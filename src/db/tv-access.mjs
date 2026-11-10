import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDb } from './client.mjs';

let setup;
async function ensure() {
  if (!setup) setup = (async () => {
    const db = await getDb();
    await db.prepare('create table if not exists tv_access (session_id integer primary key references sessions(id) on delete cascade, token_hash text not null)').run();
  })().catch(e => { setup = null; throw e; });
  return setup;
}
const hash = token => createHash('sha256').update(token).digest('hex');
export const tvCookieName = code => `karyou_tv_${code}`;

/** Generar un enlace de emparejamiento desde el panel del propietario. Revoca el anterior. */
export async function issueTvToken(sessionId) {
  await ensure();
  const token = randomBytes(32).toString('hex');
  await (await getDb()).prepare('insert into tv_access(session_id,token_hash) values (?,?) on conflict(session_id) do update set token_hash=excluded.token_hash').run(sessionId, hash(token));
  return token;
}
export async function verifyTvToken(sessionId, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  // La verificación nunca crea tablas: una solicitud pública no debe modificar el esquema.
  const tabla = await (await getDb()).prepare("select 1 from sqlite_master where type='table' and name='tv_access'").get();
  if (!tabla) return false;
  const row = await (await getDb()).prepare('select token_hash from tv_access where session_id=?').get(sessionId);
  if (!row || typeof row.token_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.token_hash)) return false;
  return timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(hash(token), 'hex'));
}
