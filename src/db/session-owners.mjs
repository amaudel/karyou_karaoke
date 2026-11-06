import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './client.mjs';
import { asegurarBarAds, huellaPropietario } from './bar-ads.mjs';

/**
 * Propiedad de salas sin cuenta: un secreto aleatorio guardado en una cookie
 * httpOnly del dispositivo creador y solo su hash SHA-256 en la base.
 * Las salas Bar antiguas conservan su propietario mediante bar_rooms.
 */
let inicializacion = null;
export async function asegurarPropietariosSala() {
  if (!inicializacion) {
    inicializacion = (async () => {
      const db = await getDb();
      await db.prepare(
        'create table if not exists session_owners (' +
        'session_id integer primary key references sessions(id) on delete cascade, ' +
        'token_hash text not null check(length(token_hash) = 64))'
      ).run();
    })().catch((error) => {
      inicializacion = null;
      throw error;
    });
  }
  return inicializacion;
}

export function cookiePropietarioSala(code) {
  return `karyou_sala_owner_${code}`;
}

function huellaSala(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

/** Solo se llama al crear la sala. No permite adueñarse de una ya existente. */
export async function registrarPropietarioSala(sessionId) {
  await asegurarPropietariosSala();
  const token = randomBytes(32).toString('hex');
  const hash = huellaSala(token);
  await (await getDb()).prepare(
    'insert into session_owners (session_id, token_hash) values (?, ?)'
  ).run(Number(sessionId), hash);
  return token;
}

/** Reconoce salas nuevas y, por compatibilidad, salas Bar del mismo establecimiento. */
export async function esPropietarioSala(sessionId, tokenSala, tokenBar, userId) {
  if (userId) {
    const account = await (await getDb()).prepare('select 1 from bar_accounts a join bar_rooms r on r.venue_id=a.venue_id where a.auth_user_id=? and r.session_id=?').get(userId, Number(sessionId));
    if (account) return true;
  }
  const hash = huellaSala(tokenSala);
  if (hash) {
    await asegurarPropietariosSala();
    const propio = await (await getDb()).prepare(
      'select 1 from session_owners where session_id = ? and token_hash = ?'
    ).get(Number(sessionId), hash);
    if (propio) return true;
  }

  const hashBar = huellaPropietario(tokenBar);
  if (!hashBar) return false;
  await asegurarBarAds();
  const propioBar = await (await getDb()).prepare(
    'select 1 from bar_rooms r join bar_venues v on v.id = r.venue_id ' +
    'where r.session_id = ? and v.owner_token_hash = ?'
  ).get(Number(sessionId), hashBar);
  return Boolean(propioBar);
}

/**
 * Comprueba la propiedad DENTRO de la misma transacción que borra la sala.
 * Los participantes, turnos, puntuaciones y celebraciones tienen FK CASCADE.
 * Se conservan las campañas y el establecimiento del Bar, que son compartidos.
 */
export async function eliminarSalaAutorizada(code, tokenSala, tokenBar, userId) {
  const hash = huellaSala(tokenSala);
  const hashBar = huellaPropietario(tokenBar);
  if (!hash && !hashBar && !userId) return { ok: false, error: 'NO_AUTORIZADO' };

  if (hash) await asegurarPropietariosSala();
  if (hashBar) await asegurarBarAds();
  const db = await getDb();

  return db.transaction(async (tx) => {
    const sesion = await tx.prepare('select id from sessions where code = ?').get(code);
    if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };

    let autorizado = userId ? Boolean(await tx.prepare(
      'select 1 from bar_accounts a join bar_rooms r on r.venue_id=a.venue_id where a.auth_user_id=? and r.session_id=?'
    ).get(userId, sesion.id)) : false;
    if (!autorizado && hash) {
      autorizado = Boolean(await tx.prepare(
        'select 1 from session_owners where session_id = ? and token_hash = ?'
      ).get(sesion.id, hash));
    }
    if (!autorizado && hashBar) {
      autorizado = Boolean(await tx.prepare(
        'select 1 from bar_rooms r join bar_venues v on v.id = r.venue_id ' +
        'where r.session_id = ? and v.owner_token_hash = ?'
      ).get(sesion.id, hashBar));
    }
    if (!autorizado) return { ok: false, error: 'NO_AUTORIZADO' };

    const resultado = await tx.prepare(
      'delete from sessions where id = ? and code = ?'
    ).run(sesion.id, code);
    return resultado.changes === 1
      ? { ok: true }
      : { ok: false, error: 'SESION_NO_EXISTE' };
  });
}
