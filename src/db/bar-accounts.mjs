import { randomBytes } from 'node:crypto';
import { getDb } from './client.mjs';
import { asegurarBarAds, huellaPropietario } from './bar-ads.mjs';

export async function barDeCuenta(userId) {
  if (!userId) return null;
  const db = await getDb();
  return await db.prepare('select v.id, v.name from bar_venues v join bar_accounts a on a.venue_id=v.id where a.auth_user_id=?').get(userId);
}

export async function crearBarParaCuenta(userId, name) {
  const nombre = String(name || '').trim();
  if (!userId || nombre.length < 2 || nombre.length > 100) throw new Error('Escribe un nombre de bar de 2 a 100 caracteres.');
  await asegurarBarAds();
  const db = await getDb();
  return db.transaction(async tx => {
    const existing = await tx.prepare('select venue_id from bar_accounts where auth_user_id=?').get(userId);
    if (existing) return existing.venue_id;
    const token = randomBytes(32).toString('hex');
    const venue = await tx.prepare('insert into bar_venues (name, owner_token_hash) values (?,?)').run(nombre, huellaPropietario(token));
    await tx.prepare('insert into bar_accounts (auth_user_id, venue_id) values (?,?)').run(userId, venue.lastInsertRowid);
    return venue.lastInsertRowid;
  });
}

export async function cuentaEsPropietariaDeSala(userId, sessionId) {
  if (!userId) return false;
  return Boolean(await (await getDb()).prepare('select 1 from bar_accounts a join bar_rooms r on r.venue_id=a.venue_id where a.auth_user_id=? and r.session_id=?').get(userId, Number(sessionId)));
}

export async function asignarSalaACuenta(userId, sessionId) {
  const db = await getDb();
  const result = await db.prepare('insert into bar_rooms (session_id, venue_id) select ?, venue_id from bar_accounts where auth_user_id=?').run(Number(sessionId), userId);
  if (result.changes !== 1) throw new Error('No existe un bar para esta cuenta.');
}

export async function salaTieneCuenta(sessionId) {
  return Boolean(await (await getDb()).prepare('select 1 from bar_rooms r join bar_accounts a on a.venue_id=r.venue_id where r.session_id=?').get(Number(sessionId)));
}
