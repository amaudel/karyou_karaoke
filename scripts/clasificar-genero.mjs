/**
 * Rellena el género de todo el pool.
 *
 *   pnpm clasificar:genero                        base local si no hay credenciales
 *   pnpm clasificar:genero -- --local             fuerza la base local
 *   node --env-file=.env.local scripts/clasificar-genero.mjs    contra Turso
 *
 * Es idempotente: primero limpia todos los géneros y luego los vuelve a deducir, así
 * que si se amplían las reglas de `src/domain/genero.mjs` basta con volver a
 * ejecutarlo para que todo quede al día.
 *
 * También crea la columna si falta: Turso no pasa por el runner de migraciones de
 * `db-setup.mjs`, y `alter table` no es idempotente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '../src/db/client.mjs';
import { clasificarGenero } from '../src/domain/genero.mjs';

// `--local` ignora `.env.local` para no arrastrar las credenciales de Turso.
const forzarLocal = process.argv.includes('--local');
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath) && !forzarLocal) process.loadEnvFile(envPath);

const usandoTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
console.log(`Base de datos: ${usandoTurso ? 'Turso (nube)' : 'SQLite local'}`);
console.log('');

const db = await getDb();

/* ------------------------------------------------- asegurar la columna genre */
try {
  await db.prepare('alter table pool_items add column genre text').run();
  console.log('  + columna genre creada');
} catch (error) {
  if (/duplicate column/i.test(String(error.message))) {
    console.log('  = columna genre ya existía');
  } else {
    throw error;
  }
}
try {
  await db
    .prepare('create index if not exists ix_pool_genre on pool_items(genre)')
    .run();
} catch {
  // El índice ya existe.
}

/* --------------------------------------------------------- deducir el género */
const filas = await db
  .prepare(
    `select p.video_id, p.artist, p.song_title, p.video_title, c.name as channel_name
       from pool_items p join channels c on c.id = p.channel_id`,
  )
  .all();

console.log(`  revisando ${filas.length} pistas…`);

/** @type {Map<string, string[]>} */
const porGenero = new Map();
let sinGenero = 0;

for (const f of filas) {
  const genero = clasificarGenero({
    canal: f.channel_name,
    artista: f.artist,
    titulo: f.song_title || f.video_title,
  });
  if (!genero) {
    sinGenero += 1;
    continue;
  }
  if (!porGenero.has(genero)) porGenero.set(genero, []);
  porGenero.get(genero).push(f.video_id);
}

/* -------------------------------------------------------------- escribir */
console.log('  limpiando géneros anteriores…');
await db.prepare('update pool_items set genre = null').run();

const LOTE = 150;
for (const [genero, ids] of porGenero) {
  for (let i = 0; i < ids.length; i += LOTE) {
    const trozo = ids.slice(i, i + LOTE);
    const marcas = trozo.map(() => '?').join(',');
    await db
      .prepare(`update pool_items set genre = ? where video_id in (${marcas})`)
      .run(genero, ...trozo);
  }
}

/* --------------------------------------------------------------- resumen */
console.log('');
console.log('  Género            Pistas');
console.log('  ' + '-'.repeat(28));
const ordenado = [...porGenero.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [genero, ids] of ordenado) {
  console.log(`  ${genero.padEnd(16)}  ${String(ids.length).padStart(6)}`);
}
console.log(`  ${'(sin género)'.padEnd(16)}  ${String(sinGenero).padStart(6)}`);
console.log('  ' + '-'.repeat(28));
console.log(`  ${'TOTAL'.padEnd(16)}  ${String(filas.length).padStart(6)}`);

await closeDb();
