/**
 * Consultas sobre el pool y el catálogo.
 *
 * Todo el SQL del proyecto vive aquí. Es deliberado: si algún día se migra a Postgres,
 * solo hay que reescribir este archivo y `client.mjs`.
 */
import { getDb, planas } from './client.mjs';
import { normalize, queryTokens, deriveFields } from '../lib/normalize.mjs';
import { clasificarGenero } from '../domain/genero.mjs';
import { extraerVideoId, consultarOEmbed } from '../lib/oembed.mjs';

let tablaFavoritosLista = false;

/**
 * Garantiza de forma idempotente que la tabla `favorites` exista tanto en SQLite
 * local como en Turso Cloud DB en producción.
 * @param {any} db
 */
async function asegurarTablaFavoritos(db) {
  if (tablaFavoritosLista) return;
  await db
    .prepare(
      `create table if not exists favorites (
         video_id   text primary key references pool_items(video_id) on delete cascade,
         created_at text not null default (datetime('now'))
       )`,
    )
    .run();
  tablaFavoritosLista = true;
}

/** Reinicia la bandera de caché al cambiar de base de datos en pruebas. */
export function resetFavoritosCache() {
  tablaFavoritosLista = false;
}

/**
 * Una pista del pool tal como la devuelve la búsqueda.
 *
 * Los tipos se declaran a propósito: `node:sqlite` devuelve un tipo genérico que
 * incluye `Uint8Array`, y sin esto TypeScript no deja indexar tablas por el valor
 * de una columna.
 *
 * @typedef {object} PoolHit
 * @property {string}      video_id
 * @property {string}      video_title
 * @property {string}      artist
 * @property {string}      song_title
 * @property {number|null} duration_seconds
 * @property {string}      vocal_class
 * @property {string}      channel_name
 * @property {number}      channel_tier
 * @property {number}      rank
 * @property {number}      in_catalog
 * @property {number}      [is_favorite]
 *
 * @typedef {object} CatalogSong
 * @property {number}      song_id
 * @property {string}      title
 * @property {string}      artist
 * @property {number}      source_count
 * @property {number}      available_count
 * @property {string|null} primary_video_id
 * @property {number|null} duration_seconds
 * @property {string|null} channel_name
 * @property {number}      [is_favorite]
 *
 * @typedef {object} Stats
 * @property {number} poolTotal
 * @property {number} poolBlocked
 * @property {number} poolDiscarded
 * @property {number} poolNotEmbeddable
 * @property {number} poolWithDuration
 * @property {number} poolChannels
 * @property {number} songs
 * @property {number} sources
 * @property {number} excludedChannels
 * @property {number} favorites
 */

/**
 * Conectores que no aportan al buscar. Si se exigen como token obligatorio, una
 * búsqueda natural como «virgen de los adolescentes» falla porque «de» y «los» no
 * están en el título guardado («Virgen»). Se descartan de la CONSULTA —nunca del
 * índice—, así que no hay que reindexar nada para que apliquen.
 */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a', 'al',
  'con', 'por', 'para', 'que', 'un', 'una', 'unos', 'unas',
]);

/**
 * Arma las condiciones que comparten la búsqueda y el conteo.
 *
 * Se comparten a propósito: si el conteo usara un WHERE distinto, la pantalla diría
 * «1.265 resultados» y luego mostraría otra cosa.
 *
 * @param {string} query
 */
function filtroDeBusqueda(query) {
  const tokens = queryTokens(query).filter((t) => !STOPWORDS.has(t));
  if (tokens.length === 0) return null;

  // Todos los tokens deben aparecer, en cualquier orden. Así "suerte shakira"
  // encuentra "Shakira - Suerte" igual que "shakira suerte".
  //
  // Cada token vale por el texto O por el género: buscar «vallenato» tiene que
  // devolver las ~1.265 pistas de vallenato, no solo las que llevan la palabra en
  // el artista o el título. Con dos tokens («diomedes vallenato») se exige que cada
  // uno aparezca, por texto o por género.
  const tokenConditions = tokens
    .map(() => '(p.search_blob like ? or p.genre like ?)')
    .join(' and ');

  return {
    q: normalize(query),
    paramsTokens: tokens.flatMap((t) => [`%${t}%`, `%${t}%`]),
    condiciones: `
      from pool_items p
      join channels c on c.id = p.channel_id
      where c.excluded = 0
        and p.embeddable = 1
        -- Ya intentamos reproducirla y YouTube la bloqueó por derechos.
        and p.playback_blocked = 0
        -- 'none' son los que el clasificador descartó por título (tutorial, en vivo,
        -- acapella…). Están en el pool para poder revisarlos, pero no se ofrecen.
        and p.karaoke_match <> 'none'
        and ${tokenConditions}
    `,
  };
}

/**
 * Busca en el pool. El pool es el índice de búsqueda: contiene todo lo importado,
 * incluidas varias versiones de la misma canción.
 *
 * Sin la API de YouTube de por medio, así que no consume cuota ni tiene límite diario.
 *
 * @param {string} query
 * @param {number} [limit]
 * @param {number} [offset] para paginar. La pantalla de invitado muestra 20 por página.
 * @returns {Promise<PoolHit[]>}
 */
export async function searchPool(query, limit = 40, offset = 0) {
  const filtro = filtroDeBusqueda(query);
  if (!filtro) return [];

  const db = await getDb();
  await asegurarTablaFavoritos(db);
  const { q, paramsTokens, condiciones } = filtro;

  const sql = `
    select
      p.video_id,
      p.video_title,
      p.artist,
      p.song_title,
      p.duration_seconds,
      p.vocal_class,
      c.name  as channel_name,
      c.tier  as channel_tier,
      case
        when p.title_norm = ? or p.artist_norm = ? then 0
        when p.title_norm like ? or p.artist_norm like ? then 1
        when p.title_norm like ? or p.artist_norm like ? then 2
        else 3
      end as rank,
      exists (select 1 from song_sources s where s.video_id = p.video_id) as in_catalog,
      exists (select 1 from favorites f where f.video_id = p.video_id) as is_favorite
    ${condiciones}
    order by rank asc, c.tier asc, p.title_norm asc
    limit ? offset ?
  `;

  const params = [
    q, q,
    `${q}%`, `${q}%`,
    `%${q}%`, `%${q}%`,
    ...paramsTokens,
    limit,
    Math.max(0, Math.floor(offset)),
  ];

  return planas(/** @type {PoolHit[]} */ (await db.prepare(sql).all(...params)));
}

/**
 * Cuántas pistas coinciden con la búsqueda.
 *
 * Existe para poder decir «20 de 1.265» en lugar de dejar creer que solo hay 20. Usa
 * el MISMO filtro que `searchPool`: si se separan, el número miente.
 *
 * @param {string} query
 * @returns {Promise<number>}
 */
export async function contarPool(query) {
  const filtro = filtroDeBusqueda(query);
  if (!filtro) return 0;

  const db = await getDb();
  const fila = await db
    .prepare(`select count(*) as n ${filtro.condiciones}`)
    .get(...filtro.paramsTokens);
  return Number(fila?.n ?? 0);
}

/**
 * Agrega una pista del pool al catálogo.
 *
 * Si la canción ya existe (mismo título y artista normalizados), NO crea una canción
 * nueva: añade otra versión. Es lo que permite tener dos videos de "Maná - Rayando El
 * Sol" y sobrevivir a que uno deje de ser embebible.
 *
 * @param {string} videoId
 */
export async function addToCatalog(videoId) {
  const db = await getDb();

  const item = await db.prepare('select * from pool_items where video_id = ?').get(videoId);
  if (!item) return { ok: false, error: 'Esa pista no está en el pool.' };

  return db.transaction(async (tx) => {
    let song = await tx
      .prepare('select * from songs where title_norm = ? and artist_norm = ?')
      .get(item.title_norm, item.artist_norm);

    let createdSong = false;
    if (!song) {
      const res = await tx
        .prepare(
          `insert into songs (title, artist, title_norm, artist_norm, search_blob)
           values (?, ?, ?, ?, ?)`,
        )
        .run(item.song_title, item.artist, item.title_norm, item.artist_norm, item.search_blob);
      song = await tx.prepare('select * from songs where id = ?').get(Number(res.lastInsertRowid));
      createdSong = true;
    }

    const already = await tx
      .prepare('select id from song_sources where video_id = ?')
      .get(videoId);
    if (already) {
      return { ok: true, songId: song.id, createdSong: false, addedSource: false };
    }

    const hasPrimary =
      (await tx
        .prepare('select count(*) as n from song_sources where song_id = ? and is_primary = 1')
        .get(song.id)).n > 0;

    await tx
      .prepare(
        `insert into song_sources (song_id, video_id, channel_id, is_primary, priority)
         values (?, ?, ?, ?, ?)`,
      )
      .run(song.id, videoId, item.channel_id, hasPrimary ? 0 : 1, hasPrimary ? 100 : 10);

    return {
      ok: true,
      songId: song.id,
      createdSong,
      addedSource: true,
      isPrimary: !hasPrimary,
    };
  });
}

/**
 * Un elemento del pool por su videoId, para la pantalla del reproductor.
 *
 * Solo devuelve elementos reproducibles: si no es embebible, la pantalla no debe
 * intentar cargarlo.
 *
 * @param {string} videoId
 * @returns {PoolHit | null}
 */
export async function getPoolItem(videoId) {
  const db = await getDb();
  await asegurarTablaFavoritos(db);
  const fila = await db
    .prepare(
      `select
         p.video_id,
         p.video_title,
         p.artist,
         p.song_title,
         p.duration_seconds,
         p.vocal_class,
         c.name as channel_name,
         c.tier as channel_tier,
         exists (select 1 from song_sources s where s.video_id = p.video_id) as in_catalog,
         exists (select 1 from favorites f where f.video_id = p.video_id) as is_favorite
       from pool_items p
       join channels c on c.id = p.channel_id
       where p.video_id = ?
         and p.embeddable = 1
         and p.playback_blocked = 0
         and c.excluded = 0`,
    )
    .get(videoId);

  return fila ? /** @type {PoolHit} */ ({ ...fila }) : null;
}

/**
 * Marca una pista como no reproducible tras un fallo real de reproducción.
 *
 * Existe porque `status.embeddable` de la API de YouTube dice `true` en videos que
 * luego YouTube bloquea en la inserción por un reclamo de derechos (Content ID).
 * Comprobado: «Shakira - Loba» de Echoe Entertainment tiene embeddable=true y la
 * gestora LatinAutor-UMPG bloquea su reproducción. No hay ningún campo de la API
 * que lo prediga, así que la única señal fiable es intentar reproducirla.
 *
 * Marcar aquí hace dos cosas: deja de ofrecerse en la búsqueda, y acumula el dato
 * de cuántas pistas están bloqueadas — que es justo lo que no se puede saber de
 * antemano.
 *
 * @param {string} videoId
 * @param {number} codigo Código de error del reproductor (101, 150…)
 * @returns {{ ok: boolean, ocultada?: boolean }}
 */
export async function marcarPistaFallida(videoId, codigo) {
  const db = await getDb();

  // Solo los códigos que significan «no se puede insertar». Un error 5 es del
  // reproductor HTML5 y puede ser transitorio; no debe retirar la pista.
  if (codigo !== 101 && codigo !== 150) {
    return { ok: false };
  }

  const res = await db
    .prepare(
      `update pool_items
          set playback_blocked = 1,
              fail_count = fail_count + 1,
              last_error_code = ?,
              checked_at = datetime('now')
        where video_id = ?
          and playback_blocked = 0`,
    )
    .run(String(codigo), videoId);

  return { ok: true, ocultada: res.changes > 0 };
}

/**
 * El catálogo usable: canciones con sus versiones y la mejor fuente DISPONIBLE.
 *
 * «Disponible» significa embebible y no bloqueada por derechos. Una canción cuyas
 * versiones estén todas bloqueadas se devuelve igual, pero con `primary_video_id`
 * nulo, para que la interfaz pueda decir que no hay versión en lugar de ofrecer un
 * enlace que llevaría a un 404.
 *
 * @returns {CatalogSong[]}
 */
export async function getCatalog() {
  const db = await getDb();
  await asegurarTablaFavoritos(db);
  /** @type {CatalogSong[]} */
  const filas = await db
    .prepare(
      `with mejor_fuente as (
         select
           src.song_id,
           src.video_id,
           p.duration_seconds,
           ch.name as channel_name,
           row_number() over (
             partition by src.song_id
             order by src.is_primary desc, src.priority asc, p.fail_count asc
           ) as rn
         from song_sources src
         join pool_items p on p.video_id = src.video_id
         left join channels ch on ch.id = src.channel_id
         where src.active = 1
           and p.embeddable = 1
           and p.playback_blocked = 0
       )
       select
         s.id    as song_id,
         s.title,
         s.artist,
         (select count(*) from song_sources x
           where x.song_id = s.id and x.active = 1) as source_count,
         (select count(*) from song_sources x
            join pool_items y on y.video_id = x.video_id
           where x.song_id = s.id and x.active = 1
             and y.embeddable = 1 and y.playback_blocked = 0) as available_count,
         mf.video_id        as primary_video_id,
         mf.duration_seconds,
         mf.channel_name,
         case
           when mf.video_id is not null
             and exists (select 1 from favorites f where f.video_id = mf.video_id)
           then 1
           else 0
         end as is_favorite
       from songs s
       left join mejor_fuente mf on mf.song_id = s.id and mf.rn = 1
       where s.active = 1
       order by s.artist_norm asc, s.title_norm asc`,
    )
    .all();
  return planas(filas);
}

/**
 * Alterna (o fija) si una pista del pool está en Favoritos.
 *
 * @param {string} videoId
 * @returns {Promise<{ ok: true, favorito: boolean } | { ok: false, error: string }>}
 */
export async function toggleFavorito(videoId) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId ?? ''))) {
    return { ok: false, error: 'PISTA_INVALIDA' };
  }

  const db = await getDb();
  await asegurarTablaFavoritos(db);

  const item = await db
    .prepare(
      `select 1 from pool_items p
        join channels c on c.id = p.channel_id
       where p.video_id = ? and p.embeddable = 1 and p.playback_blocked = 0 and c.excluded = 0`,
    )
    .get(videoId);
  if (!item) {
    return { ok: false, error: 'PISTA_NO_DISPONIBLE' };
  }

  const existe = await db
    .prepare('select 1 from favorites where video_id = ?')
    .get(videoId);

  if (existe) {
    await db.prepare('delete from favorites where video_id = ?').run(videoId);
    return { ok: true, favorito: false };
  }

  await db
    .prepare('insert into favorites (video_id) values (?) on conflict (video_id) do nothing')
    .run(videoId);
  return { ok: true, favorito: true };
}

/**
 * Lista todas las canciones favoritas disponibles para cantar o pedir en un toque.
 *
 * @param {number} [limit=60]
 * @returns {Promise<PoolHit[]>}
 */
export async function listarFavoritos(limit = 60) {
  const db = await getDb();
  await asegurarTablaFavoritos(db);

  /** @type {PoolHit[]} */
  const filas = await db
    .prepare(
      `select
         p.video_id,
         p.video_title,
         p.artist,
         p.song_title,
         p.duration_seconds,
         p.vocal_class,
         c.name as channel_name,
         c.tier as channel_tier,
         0 as rank,
         exists (select 1 from song_sources s where s.video_id = p.video_id) as in_catalog,
         1 as is_favorite
       from favorites f
       join pool_items p on p.video_id = f.video_id
       join channels c on c.id = p.channel_id
       where c.excluded = 0
         and p.embeddable = 1
         and p.playback_blocked = 0
       order by f.created_at desc
       limit ?`,
    )
    .all(limit);

  return planas(filas);
}

/**
 * Importa una canción suelta al pool a partir de una URL o ID de YouTube usando oEmbed.
 *
 * - Si ya estaba en el pool y es reproducible, la devuelve sin gastar red.
 * - Si no estaba, consulta `oEmbed` (gratis, sin API key), verifica que sea embebible,
 *   crea el canal si es nuevo, deriva título/artista/género y la guarda en `pool_items`.
 *
 * @param {string} entrada URL o ID de YouTube
 * @param {{ fetchFn?: typeof fetch }} [opciones]
 * @returns {Promise<
 *   | { ok: true, videoId: string, nueva: boolean, item: PoolHit }
 *   | { ok: false, error: 'URL_INVALIDA' | 'NO_EMBEBIBLE' | 'VIDEO_NO_EXISTE' | 'CANAL_EXCLUIDO' | 'PISTA_NO_DISPONIBLE' | 'ERROR_OEMBED' }
 * >}
 */
export async function importarPistaPorUrl(entrada, opciones = {}) {
  const videoId = extraerVideoId(entrada);
  if (!videoId) {
    return { ok: false, error: 'URL_INVALIDA' };
  }

  const db = await getDb();
  await asegurarTablaFavoritos(db);

  const existente = await db
    .prepare(
      `select p.*, c.excluded as channel_excluded
         from pool_items p
         join channels c on c.id = p.channel_id
        where p.video_id = ?`,
    )
    .get(videoId);

  if (existente) {
    if (existente.channel_excluded === 1) {
      return { ok: false, error: 'CANAL_EXCLUIDO' };
    }
    if (existente.embeddable === 0) {
      return { ok: false, error: 'NO_EMBEBIBLE' };
    }
    if (existente.playback_blocked === 1) {
      return { ok: false, error: 'PISTA_NO_DISPONIBLE' };
    }
    if (existente.karaoke_match === 'none') {
      await db
        .prepare(`update pool_items set karaoke_match = 'weak' where video_id = ?`)
        .run(videoId);
    }
    const item = await getPoolItem(videoId);
    if (!item) return { ok: false, error: 'PISTA_NO_DISPONIBLE' };
    return { ok: true, videoId, nueva: false, item };
  }

  const oembed = await consultarOEmbed(videoId, opciones.fetchFn);
  if (!oembed.ok) {
    if (oembed.error === 'VIDEO_ID_INVALIDO') return { ok: false, error: 'URL_INVALIDA' };
    return { ok: false, error: oembed.error };
  }

  const { title, channelName, channelHandle } = oembed;

  // Verificamos si el canal ya existe (por nombre o por handle) y si está excluido
  let canal = await db
    .prepare(
      `select * from channels
        where lower(name) = lower(?)
           or (? is not null and lower(handle) = lower(?))
        limit 1`,
    )
    .get(channelName, channelHandle, channelHandle);

  if (canal && canal.excluded === 1) {
    return { ok: false, error: 'CANAL_EXCLUIDO' };
  }

  const campos = deriveFields(title);
  const genero = clasificarGenero({
    canal: channelName,
    artista: campos.artist,
    titulo: campos.songTitle,
  });

  await db.transaction(async (tx) => {
    if (!canal) {
      await tx
        .prepare(
          `insert into channels (handle, name, tier, excluded)
           values (?, ?, 3, 0)
           on conflict (name) do nothing`,
        )
        .run(channelHandle ?? null, channelName);
      canal = await tx
        .prepare('select * from channels where lower(name) = lower(?) limit 1')
        .get(channelName);
    }

    await tx
      .prepare(
        `insert into pool_items (
           video_id, channel_id, video_title, artist, song_title,
           artist_norm, title_norm, search_blob,
           embeddable, vocal_class, karaoke_match, genre, checked_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, 1, 'unreviewed', 'strong', ?, datetime('now'))
         on conflict (video_id) do update set
           embeddable = 1,
           karaoke_match = case when pool_items.karaoke_match = 'none' then 'weak' else pool_items.karaoke_match end`,
      )
      .run(
        videoId,
        canal.id,
        title,
        campos.artist,
        campos.songTitle,
        campos.artistNorm,
        campos.titleNorm,
        campos.searchBlob,
        genero,
      );
  });

  const item = await getPoolItem(videoId);
  if (!item) return { ok: false, error: 'PISTA_NO_DISPONIBLE' };

  return { ok: true, videoId, nueva: true, item };
}

/**
 * Contadores para la pantalla de inicio.
 * @returns {Stats}
 */
export async function getStats() {
  const db = await getDb();
  await asegurarTablaFavoritos(db);
  const one = async (sql) => (await db.prepare(sql).get()).n;
  return {
    poolTotal: await one(
      `select count(*) as n from pool_items p
         join channels c on c.id = p.channel_id
        where c.excluded = 0 and p.embeddable = 1 and p.karaoke_match <> 'none'
          and p.playback_blocked = 0`,
    ),
    // Bloqueadas por derechos al intentar reproducirlas. No se puede saber de
    // antemano: la API las da por embebibles.
    poolBlocked: await one('select count(*) as n from pool_items where playback_blocked = 1'),
    poolDiscarded: await one(
      `select count(*) as n from pool_items where embeddable = 1 and karaoke_match = 'none'`,
    ),
    poolNotEmbeddable: await one('select count(*) as n from pool_items where embeddable = 0'),
    poolWithDuration: await one(
      // Mismo filtro que poolTotal, para que los dos contadores sean comparables.
      `select count(*) as n from pool_items p
         join channels c on c.id = p.channel_id
        where c.excluded = 0 and p.embeddable = 1 and p.karaoke_match <> 'none'
          and p.duration_seconds is not null`,
    ),
    poolChannels: await one(
      `select count(distinct p.channel_id) as n
         from pool_items p join channels c on c.id = p.channel_id
        where c.excluded = 0 and p.embeddable = 1`,
    ),
    songs: await one('select count(*) as n from songs where active = 1'),
    sources: await one('select count(*) as n from song_sources where active = 1'),
    excludedChannels: await one('select count(*) as n from channels where excluded = 1'),
    favorites: await one(
      `select count(*) as n from favorites f
         join pool_items p on p.video_id = f.video_id
         join channels c on c.id = p.channel_id
        where c.excluded = 0 and p.embeddable = 1 and p.playback_blocked = 0`,
    ),
  };
}
