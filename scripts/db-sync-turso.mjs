/**
 * Script para sincronizar el esquema y los datos desde data/karaoke.db hacia Turso Cloud DB.
 */
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Error: TURSO_DATABASE_URL y TURSO_AUTH_TOKEN deben estar en el entorno.');
  process.exit(1);
}

const dbPath = path.join(process.cwd(), 'data', 'karaoke.db');
if (!fs.existsSync(dbPath)) {
  console.error('Error: No se encontró data/karaoke.db local');
  process.exit(1);
}

console.log('📦 Conectando a SQLite local...');
const localDb = new DatabaseSync(dbPath);

console.log(`🌐 Conectando a Turso Cloud DB (${url})...`);
const cloudDb = createClient({ url, authToken });

const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log('⚡ Aplicando esquemas y migraciones en Turso...');
for (const file of files) {
  console.log(`  -> Aplicando ${file}`);
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  try {
    await cloudDb.executeMultiple(sql);
  } catch (e) {
    if (!String(e.message).includes('duplicate column')) {
      console.warn(`     (aviso en ${file}: ${e.message})`);
    }
  }
}

const tables = [
  { name: 'channels', pk: 'id' },
  { name: 'pool_items', pk: 'video_id' },
];

for (const { name: table, pk } of tables) {
  const rows = localDb.prepare(`SELECT * FROM ${table}`).all();
  console.log(`🚀 Transfiriendo ${rows.length} filas de '${table}' a Turso...`);
  if (rows.length === 0) continue;

  const sample = rows[0];
  const keys = Object.keys(sample);
  const colsStr = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const updates = keys
    .filter((k) => k !== pk)
    .map((k) => `${k} = excluded.${k}`)
    .join(', ');
  const sql = `INSERT INTO ${table} (${colsStr}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`;

  const BATCH_SIZE = 250;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = chunk.map((row) => ({
      sql,
      args: keys.map((k) => row[k]),
    }));
    await cloudDb.batch(batch, 'write');
  }
  console.log(`  ✓ Tabla '${table}' completada.`);
}

console.log('\n🎉 ¡Sincronización masiva con Turso Cloud DB completada con éxito!');
