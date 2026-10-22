import { getDb } from '../db/client.mjs';
import { CELEBRACION_MS, MARGEN_PRIMERA_PRESENTACION_MS } from './tiempos-celebracion.mjs';
export { CELEBRACION_MS } from './tiempos-celebracion.mjs';

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
      await db.prepare(`create table if not exists score_ceremony_presentations (
        session_id integer primary key references sessions(id) on delete cascade,
        queue_item_id integer not null references queue_items(id) on delete cascade,
        started_at_ms integer not null
      )`).run();
    })().catch((e) => { inicializada = null; throw e; });
  }
  return inicializada;
}

/** Se usa dentro de la MISMA transacción que crea el score. */
export async function bloquearDespuesDePuntuar(tx, sessionId, queueItemId, ahora = Date.now()) {
  const hasta = ahora + CELEBRACION_MS + MARGEN_PRIMERA_PRESENTACION_MS;
  await tx.prepare(`insert into score_ceremonies (session_id, queue_item_id, until_ms)
    values (?, ?, ?)
    on conflict(session_id) do update set
      queue_item_id = excluded.queue_item_id,
      until_ms = excluded.until_ms,
      created_at = datetime('now')`).run(Number(sessionId), Number(queueItemId), hasta);
  await tx.prepare('delete from score_ceremony_presentations where session_id = ?')
    .run(Number(sessionId));
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

/**
 * La TV confirma UNA SOLA VEZ el inicio visible de una calificación real.
 * El bloqueo se ajusta a 8700ms desde que aparece la nota, no desde el cierre SQL.
 * No puede reabrir una reserva vencida, reiniciar plazos sucesivamente ni
 * afectar a otro turno o a una nueva canción.
 * @returns {Promise<number>} milisegundos restantes, 0 si se ignora la petición
 */
export async function confirmarPresentacionCelebracion(sessionId, queueItemId, ahora = Date.now()) {
  await asegurarCelebraciones();
  const db = await getDb();
  let restante = 0;
  await db.transaction(async (tx) => {
    const fila = await tx.prepare(
      'select queue_item_id, until_ms from score_ceremonies where session_id = ?'
    ).get(Number(sessionId));
    if (!fila || Number(fila.queue_item_id) !== Number(queueItemId)) return;
    if (Number(fila.until_ms) <= ahora) return;

    const cantante = await tx.prepare(
      "select 1 from queue_items where session_id = ? and status = 'singing' limit 1"
    ).get(Number(sessionId));
    if (cantante) return;

    const puntaje = await tx.prepare(
      'select 1 from scores where session_id = ? and queue_item_id = ? limit 1'
    ).get(Number(sessionId), Number(queueItemId));
    if (!puntaje) return;

    const confirmacion = await tx.prepare(
      'insert into score_ceremony_presentations (session_id, queue_item_id, started_at_ms) values (?,?,?) on conflict(session_id) do nothing'
    ).run(Number(sessionId), Number(queueItemId), ahora);
    if (confirmacion.changes > 0) {
      // Una sola extensión (o reducción del margen inicial), no en cada sondeo.
      await tx.prepare(
        'update score_ceremonies set until_ms = ? where session_id = ? and queue_item_id = ?'
      ).run(ahora + CELEBRACION_MS, Number(sessionId), Number(queueItemId));
      restante = CELEBRACION_MS;
    } else {
      restante = Math.max(0, Number(fila.until_ms) - ahora);
    }
  });
  return restante;
}
