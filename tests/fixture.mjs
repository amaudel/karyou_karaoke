/**
 * Base de datos de prueba: pequeña, conocida y desechable.
 *
 * Las pruebas NO deben correr contra la base real: su tamaño depende de cuántos
 * canales se hayan importado, así que cualquier aserción sobre el número de
 * resultados sería frágil. Este fixture construye una base nueva con las
 * migraciones reales y la semilla de 30 pistas, y la borra al terminar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deriveFields } from '../src/lib/normalize.mjs';
import { clasificarGenero } from '../src/domain/genero.mjs';
import { CHANNELS, POOL_ITEMS } from '../scripts/seed-data.mjs';

const MIGRACIONES = path.join(process.cwd(), 'src', 'db', 'migrations');

/**
 * @returns {{ dbPath: string, dir: string }}
 */
export function crearBaseDePrueba() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karaoke-fixture-'));
  const dbPath = path.join(dir, 'karaoke.db');
  const db = new DatabaseSync(dbPath);
  db.exec('pragma foreign_keys = on');

  // Las migraciones reales, para que el fixture no se desvíe del esquema de producción.
  for (const archivo of fs
    .readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(fs.readFileSync(path.join(MIGRACIONES, archivo), 'utf8'));
  }

  const insCanal = db.prepare(
    'insert into channels (handle, name, tier, excluded, excluded_note) values (?, ?, ?, ?, ?)',
  );
  for (const c of CHANNELS) {
    insCanal.run(c.handle ?? null, c.name, c.tier, c.excluded ?? 0, c.excludedNote ?? null);
  }

  const idPorNombre = new Map(
    db.prepare('select id, name from channels').all().map((r) => [r.name, r.id]),
  );

  const insPool = db.prepare(
    `insert into pool_items (
       video_id, channel_id, video_title, artist, song_title,
       artist_norm, title_norm, search_blob,
       duration_seconds, embeddable, vocal_class, genre
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'unreviewed', ?)`,
  );

  for (const item of POOL_ITEMS) {
    const canal = CHANNELS.find((c) => c.handle === item.handle);
    const channelId = canal ? idPorNombre.get(canal.name) : undefined;
    if (!channelId) continue;

    const campos = deriveFields(item.videoTitle, {
      artist: item.artist,
      songTitle: item.songTitle,
    });

    insPool.run(
      item.videoId,
      channelId,
      item.videoTitle,
      campos.artist,
      campos.songTitle,
      campos.artistNorm,
      campos.titleNorm,
      campos.searchBlob,
      // La duración es imprescindible para puntuar: el motor calcula el avance
      // dividiendo lo cantado entre la duración, y el servidor la usa para acotar
      // lo que reporta el navegador. Sin ella, el fixture no representaría la
      // realidad y las pruebas de abandono no probarían nada.
      192,
      // El género se clasifica igual que en producción, para que la búsqueda por
      // género se pueda probar de verdad contra el fixture.
      clasificarGenero({
        canal: canal.name,
        artista: campos.artist,
        titulo: campos.songTitle,
      }),
    );
  }

  // --- Casos límite que la semilla no cubre ---------------------------------
  // Las aserciones sobre estos dos elementos verifican que la búsqueda y la
  // pantalla del reproductor filtran lo que no se puede ofrecer.

  const canalPartyTyme = idPorNombre.get('PARTY TYME KARAOKE EN ESPAÑOL');
  const canalExcluido = idPorNombre.get('Sing King');

  // 1. No embebible: está en el pool, pero no debe aparecer ni reproducirse.
  db.prepare(
    `insert into pool_items (
       video_id, channel_id, video_title, artist, song_title,
       artist_norm, title_norm, search_blob, duration_seconds, embeddable, vocal_class
     ) values (?, ?, ?, ?, ?, ?, ?, ?, 200, 0, 'unreviewed')`,
  ).run(
    'zzNoEmb0001',
    canalPartyTyme,
    'Artista de Prueba - Cancion No Embebible (Versión Karaoke)',
    'Artista de Prueba',
    'Cancion No Embebible',
    'artista de prueba',
    'cancion no embebible',
    'artista de prueba cancion no embebible',
  );

  // 2. Canal excluido: embebible, pero de un canal que no se importa.
  db.prepare(
    `insert into pool_items (
       video_id, channel_id, video_title, artist, song_title,
       artist_norm, title_norm, search_blob, duration_seconds, embeddable, vocal_class
     ) values (?, ?, ?, ?, ?, ?, ?, ?, 200, 1, 'unreviewed')`,
  ).run(
    'zzExclu0001',
    canalExcluido,
    'Artista Excluido - Cancion Excluida (Versión Karaoke)',
    'Artista Excluido',
    'Cancion Excluida',
    'artista excluido',
    'cancion excluida',
    'artista excluido cancion excluida',
  );

  // 3. Sin duración conocida. Pasa cuando un elemento entra al pool sin
  //    enriquecer: el motor no puede calcular el avance, y la decisión es no
  //    castigar por lo que no se puede medir.
  db.prepare(
    `insert into pool_items (
       video_id, channel_id, video_title, artist, song_title,
       artist_norm, title_norm, search_blob, duration_seconds, embeddable, vocal_class
     ) values (?, ?, ?, ?, ?, ?, ?, ?, null, 1, 'unreviewed')`,
  ).run(
    'zzSinDur000',
    canalPartyTyme,
    'Artista Sin Duracion - Cancion Sin Duracion (Versión Karaoke)',
    'Artista Sin Duracion',
    'Cancion Sin Duracion',
    'artista sin duracion',
    'cancion sin duracion',
    'artista sin duracion cancion sin duracion',
  );

  db.close();
  return { dbPath, dir };
}

/**
 * Borra el directorio del fixture. En Windows hay que cerrar la conexión antes,
 * o el sistema de archivos no deja eliminar el archivo.
 * @param {string} dir
 */
export function borrarBaseDePrueba(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // La limpieza del temporal nunca debe hacer fallar la suite.
  }
}
