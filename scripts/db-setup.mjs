/**
 * Crea la base de datos local, aplica las migraciones y carga la semilla.
 *
 *   pnpm db:setup      crea si falta y aplica lo que falte
 *   pnpm db:reset      borra la base y la reconstruye desde cero
 *
 * Usa node:sqlite (integrado en Node 24): sin compilación nativa, sin dependencias.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveFields } from '../src/lib/normalize.mjs';
import { CHANNELS, POOL_ITEMS } from './seed-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'karaoke.db');
const migrationsDir = path.join(root, 'src', 'db', 'migrations');

const reset = process.argv.includes('--reset');

if (reset && fs.existsSync(dbPath)) {
  fs.rmSync(dbPath);
  console.log('Base de datos eliminada (--reset).');
}

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('pragma foreign_keys = on');
db.exec('pragma journal_mode = wal');

// ---------------------------------------------------------------- migraciones
db.exec(`
  create table if not exists schema_migrations (
    name       text primary key,
    applied_at text not null default (datetime('now'))
  )
`);

const applied = new Set(
  db.prepare('select name from schema_migrations').all().map((r) => r.name),
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  = ${file} (ya aplicada)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  db.exec('begin');
  try {
    db.exec(sql);
    db.prepare('insert into schema_migrations (name) values (?)').run(file);
    db.exec('commit');
    console.log(`  + ${file}`);
  } catch (error) {
    db.exec('rollback');
    console.error(`  ! ${file} falló:`, error.message);
    process.exit(1);
  }
}

// -------------------------------------------------------------------- semilla
const insertChannel = db.prepare(`
  insert into channels (handle, name, tier, excluded, excluded_note)
  values (?, ?, ?, ?, ?)
  on conflict (name) do nothing
`);

const channelIdByName = new Map();
for (const c of CHANNELS) {
  insertChannel.run(c.handle ?? null, c.name, c.tier, c.excluded ?? 0, c.excludedNote ?? null);
}
for (const row of db.prepare('select id, name from channels').all()) {
  channelIdByName.set(row.name, row.id);
}

const insertPoolItem = db.prepare(`
  insert into pool_items (
    video_id, channel_id, video_title, artist, song_title,
    artist_norm, title_norm, search_blob, embeddable, vocal_class, checked_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, 1, 'unreviewed', datetime('now'))
  on conflict (video_id) do nothing
`);

let inserted = 0;
for (const item of POOL_ITEMS) {
  const channel = CHANNELS.find((c) => c.handle === item.handle);
  if (!channel) {
    console.warn(`  ! canal no encontrado para ${item.videoId}: ${item.handle}`);
    continue;
  }
  const channelId = channelIdByName.get(channel.name);
  if (!channelId) continue;

  const fields = deriveFields(item.videoTitle, {
    artist: item.artist,
    songTitle: item.songTitle,
  });

  const result = insertPoolItem.run(
    item.videoId,
    channelId,
    item.videoTitle,
    fields.artist,
    fields.songTitle,
    fields.artistNorm,
    fields.titleNorm,
    fields.searchBlob,
  );
  if (result.changes > 0) inserted += 1;
}

// ------------------------------------------------------------------ resumen
const stats = {
  canales: db.prepare('select count(*) n from channels').get().n,
  canalesActivos: db.prepare('select count(*) n from channels where excluded = 0').get().n,
  pool: db.prepare('select count(*) n from pool_items').get().n,
  canciones: db.prepare('select count(*) n from songs').get().n,
  fuentes: db.prepare('select count(*) n from song_sources').get().n,
};

console.log('');
console.log(`  pool_items insertados: ${inserted}`);
console.log(`  canales: ${stats.canales} (${stats.canalesActivos} activos)`);
console.log(`  pool total: ${stats.pool} pistas`);
console.log(`  catálogo: ${stats.canciones} canciones, ${stats.fuentes} fuentes`);
console.log(`  base de datos: ${dbPath}`);

db.close();
