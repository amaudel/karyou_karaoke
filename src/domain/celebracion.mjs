import { getDb } from '../db/client.mjs';

/** Duración exacta de la animación Karyou TV (1,4 + 1,8 + 2,3 + 3,2 s). */
export const CELEBRACION_MS = 8700;

// Las bases Turso existentes pueden no tener aplicada todavía la última migración.
// La tabla se crea idempotentemente en la ruta de cierre/lectura.
let inicializada = null;
export async function asegurarCelebraciones() {
  if (!inicializada) {
    inicializada = (async () => {
      const db = await getDb();
      await db.prepare(`create table if not exists score_ceremonies (
        session_id integer primary key references sessions(id) on delete cascade,
        queue_item_id integer not null references queue_items(id) on delete cascade,
        until_ms integer not null,
        created_at text not null default (datetime('now'))
      )`).run();
    })().catch((e) => { inicializada = null; throw e; });
  }
  return inicializada;
}

/** Se usa dentro de la MISMA transacción que crea el score. */
export async function bloquearDespuesDePuntuar(tx, sessionId, queueItemId, ahora = Date.now()) {
  const hasta = ahora + CELEBRACION_MS;
  await tx.prepare(`insert into score_ceremonies (session_id, queue_item_id, until_ms)
    values (?, ?, ?)
    on conflict(session_id) do update set
      queue_item_id = excluded.queue_item_id,
      until_ms = excluded.until_ms,
      created_at = datetime('now')`).run(Number(sessionId), Number(queueItemId), hasta);
  return hasta;
}

/** Reloj del servidor; no se aceptan marcas de tiempo remitidas por participantes. */
export async function celebracionPendiente(sessionId, ahora = Date.now(), tx = null) {
  await asegurarCelebraciones();
  const db = tx ?? await getDb();
  const fila = await db.prepare(
    'select until_ms from score_ceremonies where session_id = ?'
  ).get(Number(sessionId));
  return Math.max(0, Number(fila?.until_ms ?? 0) - ahora);
}

/** Solo el anfitrión validado puede levantar esta restricción. */
export async function omitirCelebracion(sessionId) {
  await asegurarCelebraciones();
  const db = await getDb();
  await db.prepare('delete from score_ceremonies where session_id = ?').run(Number(sessionId));
}
