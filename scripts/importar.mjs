/**
 * Importador de canales de YouTube al pool.
 *
 *   pnpm importar                          importa todos los canales activos
 *   pnpm importar -- --canal @handle       solo uno
 *   pnpm importar -- --paginas 4           limita páginas por canal (para probar)
 *   pnpm importar -- --reiniciar           ignora el progreso y empieza de cero
 *
 * Es reanudable: guarda el cursor de paginación en `channels.import_cursor`. Si se
 * corta, al volver a ejecutarlo continúa donde quedó en vez de gastar cuota otra vez.
 *
 * Consumo: 2 unidades por cada 50 videos (1 de playlistItems + 1 de videos.list).
 * De las 100 búsquedas diarias: CERO.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalize, deriveFields } from '../src/lib/normalize.mjs';
import { clasificarGenero } from '../src/domain/genero.mjs';

// ------------------------------------------------------------------ argumentos
const args = process.argv.slice(2);
const arg = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? (args[i + 1] ?? true) : null;
};

const canalFiltro = arg('canal');
const limitePaginas = Number(arg('paginas') ?? 0) || Infinity;
const reiniciar = args.includes('--reiniciar');

// ------------------------------------------------------------------------- env
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('No existe .env.local con YOUTUBE_API_KEY.');
  process.exit(1);
}
process.loadEnvFile(envPath);
const KEY = (process.env.YOUTUBE_API_KEY ?? '').trim();
if (!KEY || KEY === 'PEGA_TU_CLAVE_AQUI') {
  console.error('Falta la clave en .env.local. Ejecuta:  pnpm verificar-api');
  process.exit(1);
}

// -------------------------------------------------------------------------- db
const dbPath = path.join(process.cwd(), 'data', 'karaoke.db');
if (!fs.existsSync(dbPath)) {
  console.error('No existe la base de datos. Ejecuta:  pnpm db:setup');
  process.exit(1);
}
const db = new DatabaseSync(dbPath);
db.exec('pragma foreign_keys = on');

// ------------------------------------------------------------------------- API
const API = 'https://www.googleapis.com/youtube/v3';
let unidades = 0;

async function api(endpoint, params, intento = 1) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  url.searchParams.set('key', KEY);
  unidades += 1;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });

  // Reintento con espera ante errores transitorios de Google.
  if ((res.status === 429 || res.status >= 500) && intento <= 3) {
    const espera = 1000 * intento * intento;
    console.warn(`    ${res.status}, reintentando en ${espera} ms…`);
    await new Promise((r) => setTimeout(r, espera));
    return api(endpoint, params, intento + 1);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    const motivo = err?.errors?.[0]?.reason ?? '';
    throw new Error(`HTTP ${res.status} — ${err?.message ?? res.statusText} [${motivo}]`);
  }
  return json;
}

// ----------------------------------------------------------------- clasificador
// Términos que indican karaoke de forma explícita.
const FUERTE = [
  'karaoke', 'karaoke version', 'version karaoke', 'instrumental', 'playback',
  'backing track', 'pista', 'sin voz', 'base musical', 'play back',
];

// Términos que descartan el video: no es una pista para cantar.
const DESCARTE = [
  'tutorial', 'como tocar', 'how to play', 'reaccion', 'reaction', 'entrevista',
  'interview', 'acapella', 'a capella', 'con voz', 'voz guia', 'guia vocal',
  'lead vocal', 'vocal cover', 'cover', 'en vivo', 'live performance', 'concierto',
  'detras de camaras', 'making of', 'shorts', 'short', 'teaser', 'trailer',
  // "Análisis" aparece en canales de karaoke vallenato: es un video sobre la
  // canción (letra/acordes), no una pista instrumental para cantar.
  'analisis',
];

/**
 * @param {string} titulo
 * @returns {{ match: 'strong'|'weak'|'none', rechazo: string|null }}
 */
function clasificar(titulo) {
  const t = normalize(titulo);

  for (const mala of DESCARTE) {
    if (t.includes(normalize(mala))) return { match: 'none', rechazo: `descarte:${mala}` };
  }
  for (const buena of FUERTE) {
    if (t.includes(normalize(buena))) return { match: 'strong', rechazo: null };
  }
  return { match: 'weak', rechazo: null };
}

/** "PT3M12S" -> 192. Devuelve null para directos y valores no utilizables. */
function isoASegundos(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, d, h, mi, s] = m;
  const total =
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : null;
}

// ------------------------------------------------------------------ sentencias
const insPool = db.prepare(`
  insert into pool_items (
    video_id, channel_id, video_title, artist, song_title,
    artist_norm, title_norm, search_blob,
    duration_seconds, embeddable, vocal_class, karaoke_match,
    definition, published_at, rejected_reason, checked_at, genre
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?, ?, ?, datetime('now'), ?)
  on conflict (video_id) do update set
    duration_seconds = excluded.duration_seconds,
    embeddable       = excluded.embeddable,
    karaoke_match    = excluded.karaoke_match,
    definition       = excluded.definition,
    genre            = excluded.genre,
    checked_at       = datetime('now')
`);

const guardarCursor = db.prepare(
  'update channels set import_cursor = ?, import_seen = ?, import_kept = ? where id = ?',
);

const canales = db
  .prepare('select * from channels where excluded = 0 order by tier asc, name asc')
  .all()
  .filter((c) => (canalFiltro ? c.handle === canalFiltro : true));

if (canales.length === 0) {
  console.error(canalFiltro ? `No hay ningún canal activo con handle ${canalFiltro}` : 'No hay canales que importar.');
  process.exit(1);
}

console.log(`Importando ${canales.length} canal(es). Cursor: ${reiniciar ? 'reiniciado' : 'reanudando'}`);
console.log('');

// ------------------------------------------------------------------ bucle raíz
let totalVistos = 0;
let totalGuardados = 0;

for (const canal of canales) {
  console.log(`${canal.name}  (${canal.handle ?? 'sin handle'})`);

  // 1. Resolver el canal si hace falta.
  let channelId = canal.youtube_id;
  let uploads = canal.uploads_playlist_id;

  if (!channelId || !uploads) {
    if (!canal.handle) {
      console.log('  sin handle, no se puede resolver. Se omite.\n');
      continue;
    }
    const data = await api('channels', {
      part: 'id,contentDetails',
      forHandle: canal.handle,
    });
    const item = data.items?.[0];
    if (!item) {
      console.log('  no se pudo resolver el canal. Se omite.\n');
      continue;
    }
    channelId = item.id;
    uploads = item.contentDetails?.relatedPlaylists?.uploads;
    db.prepare('update channels set youtube_id = ?, uploads_playlist_id = ? where id = ?').run(
      channelId,
      uploads,
      canal.id,
    );
    console.log(`  canal resuelto: ${channelId}`);
  }

  if (!uploads) {
    console.log('  el canal no expone playlist de subidas. Se omite.\n');
    continue;
  }

  if (reiniciar) {
    db.prepare(
      'update channels set import_cursor = null, import_seen = 0, import_kept = 0 where id = ?',
    ).run(canal.id);
  }

  // 2. Enumerar página a página.
  // Con --reiniciar los contadores parten de cero; si no, se reanudan desde donde
  // quedaron. Sin esto, una corrida reiniciada reporta totales acumulados que no
  // corresponden a lo que realmente procesó.
  let cursor = reiniciar ? null : (canal.import_cursor ?? null);
  let vistos = reiniciar ? 0 : (canal.import_seen ?? 0);
  let guardados = reiniciar ? 0 : (canal.import_kept ?? 0);
  let pagina = 0;
  let sinCursor = false;

  try {
    while (pagina < limitePaginas && !sinCursor) {
      pagina += 1;

      const lista = await api('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploads,
        maxResults: 50,
        pageToken: cursor,
      });

      const items = (lista.items ?? [])
        .map((i) => ({
          videoId: i.contentDetails?.videoId,
          titulo: i.snippet?.title ?? '',
          publicado: i.snippet?.publishedAt ?? null,
        }))
        // Los videos privados o borrados aparecen sin título útil.
        .filter((i) => i.videoId && i.titulo && !/^(private|deleted) video$/i.test(i.titulo));

      if (items.length > 0) {
        // 3. Enriquecer con duración y estado de inserción.
        const detalles = await api('videos', {
          part: 'contentDetails,status',
          id: items.map((i) => i.videoId).join(','),
        });
        const porId = new Map((detalles.items ?? []).map((v) => [v.id, v]));

        for (const item of items) {
          vistos += 1;
          const detalle = porId.get(item.videoId);

          // Si la API no devuelve el video, está borrado o es privado: no hay nada
          // que guardar ni que reconsiderar después.
          if (!detalle) continue;

          const duracion = isoASegundos(detalle?.contentDetails?.duration);
          const insertable = detalle?.status?.embeddable === true;
          const privado = detalle?.status?.privacyStatus !== 'public';
          const clasif = clasificar(item.titulo);

          const campos = deriveFields(item.titulo);

          // El género se deduce aquí para que la búsqueda por género funcione con
          // lo que se importe en el futuro, sin tener que reclasificar después.
          const genero = clasificarGenero({
            canal: canal.name,
            artista: campos.artist,
            titulo: campos.songTitle || item.titulo,
          });

          // Los no embebibles SÍ se guardan, marcados con embeddable = 0.
          // Motivo concreto: Party Tyme cambió su política de inserción hace poco
          // (los videos de 2019-2024 eran 95% embebibles, los de 2025-2026 son ~26%).
          // Guardarlos permite volver a comprobarlos cuando cambie, sin gastar cuota
          // enumerando el canal otra vez. La búsqueda los filtra.
          insPool.run(
            item.videoId,
            canal.id,
            item.titulo,
            campos.artist,
            campos.songTitle,
            campos.artistNorm,
            campos.titleNorm,
            campos.searchBlob,
            duracion,
            insertable && !privado ? 1 : 0,
            clasif.match,
            detalle?.contentDetails?.definition ?? null,
            item.publicado,
            clasif.rechazo,
            genero,
          );
          if (insertable && !privado) guardados += 1;
        }
      }

      cursor = lista.nextPageToken ?? null;
      sinCursor = !cursor;
      guardarCursor.run(cursor, vistos, guardados, canal.id);
      db.prepare('update channels set import_seen = ?, import_kept = ? where id = ?').run(
        vistos,
        guardados,
        canal.id,
      );

      // Progreso compacto, una línea cada 10 páginas.
      if (pagina % 10 === 0 || sinCursor) {
        process.stdout.write(
          `  página ${String(pagina).padStart(4)} · vistos ${String(vistos).padStart(6)} · guardados ${String(guardados).padStart(6)} · ${unidades} unidades\r`,
        );
      }

      if (limitePaginas !== Infinity && pagina >= limitePaginas) break;
    }

    db.prepare(
      `update channels set import_finished_at = datetime('now'), import_error = null
       where id = ?`,
    ).run(canal.id);

    console.log(
      `\n  terminado (${limitePaginas === Infinity ? 'completo' : `limitado a ${limitePaginas} páginas`}): ${guardados} pistas guardadas de ${vistos} vistas\n`,
    );
  } catch (error) {
    db.prepare('update channels set import_error = ? where id = ?').run(
      String(error.message).slice(0, 500),
      canal.id,
    );
    console.error(`\n  ERROR: ${error.message}`);
    console.error('  El cursor quedó guardado: vuelve a ejecutar para continuar.\n');
  }

  totalVistos += vistos;
  totalGuardados += guardados;
}

// -------------------------------------------------------------------- resumen
const stats = db
  .prepare(
    `select karaoke_match as clase, count(*) as n
       from pool_items where embeddable = 1 group by karaoke_match order by n desc`,
  )
  .all();

console.log('='.repeat(66));
console.log(`Videos vistos:    ${totalVistos}`);
console.log(`Pistas guardadas: ${totalGuardados}`);
console.log(`Unidades usadas:  ${unidades} de 10.000  ·  búsquedas: 0 de 100`);
console.log('');
console.log('Pool por clasificación:');
for (const s of stats) console.log(`  ${String(s.clase).padEnd(8)} ${s.n}`);
console.log('='.repeat(66));

db.close();
