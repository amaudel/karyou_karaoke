import { getDb } from './client.mjs';

/** Ventana fija compartida entre instancias Vercel (SQLite/Turso), no memoria local. */
export async function consumirLimite(clave, maximo, ventanaSegundos) {
  if (typeof clave !== 'string' || clave.length > 200 || !Number.isInteger(maximo) || maximo < 1 || !Number.isInteger(ventanaSegundos) || ventanaSegundos < 1) {
    return false;
  }
  const db = await getDb();
  await db.prepare(`create table if not exists action_rate_limits (
    key text primary key,
    window_start integer not null,
    hits integer not null
  )`).run();
  const ahora = Math.floor(Date.now() / 1000);
  const ventana = Math.floor(ahora / ventanaSegundos) * ventanaSegundos;
  // Una sola escritura condicional evita carreras entre peticiones simultáneas.
  const res = await db.prepare(`insert into action_rate_limits (key, window_start, hits)
    values (?, ?, 1)
    on conflict(key) do update set
      hits = case when action_rate_limits.window_start = excluded.window_start
        then action_rate_limits.hits + 1 else 1 end,
      window_start = excluded.window_start
    where action_rate_limits.window_start != excluded.window_start
      or action_rate_limits.hits < ?`).run(clave, ventana, maximo);
  return res.changes > 0;
}
