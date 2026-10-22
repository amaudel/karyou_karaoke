
import { randomBytes, createHash } from 'node:crypto';
import { getDb } from './client.mjs';

/** Solo en rutas Ads. Producción Turso puede tener migraciones previas. */
const ddl = [
  `create table if not exists bar_venues (id integer primary key, name text not null, owner_token_hash text not null unique, logo_url text, created_at text not null default (datetime('now')))`,
  `create table if not exists bar_rooms (session_id integer primary key references sessions(id) on delete cascade, venue_id integer not null references bar_venues(id) on delete cascade)`,
  `create index if not exists ix_bar_rooms_venue on bar_rooms(venue_id)`,
  `create table if not exists bar_campaigns (id integer primary key, venue_id integer not null references bar_venues(id) on delete cascade, title text not null, image_url text not null, blob_path text not null, content_type text not null, placement text not null check(placement in ('espera','entre','resultado')), layout text not null check(layout in ('spotlight','tarjeta','firma')), duration_seconds integer not null default 10 check(duration_seconds between 3 and 12), priority integer not null default 0 check(priority between 0 and 2), status text not null default 'draft' check(status in ('draft','active','paused','archived')), starts_at text, ends_at text, created_at text not null default (datetime('now')), updated_at text not null default (datetime('now')))`,
  `create index if not exists ix_bar_campaigns_active on bar_campaigns(venue_id,status,placement,priority)`,
  `create table if not exists bar_impressions (id integer primary key, campaign_id integer not null references bar_campaigns(id) on delete cascade, session_id integer not null references sessions(id) on delete cascade, placement text not null, viewed_at text not null default (datetime('now')))`,
  `create index if not exists ix_bar_impressions_campaign on bar_impressions(campaign_id,viewed_at)`,
];
let initialized = null;
export async function asegurarBarAds() {
  if (!initialized) {
    initialized = (async () => {
      const db = await getDb();
      for (const sql of ddl) await db.prepare(sql).run();
    })().catch(e => { initialized = null; throw e; });
  }
  return initialized;
}

export function huellaPropietario(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

/** Vincula automáticamente una NUEVA sala Bar al dueño que la creó.
 * Nunca permite reclamar una sala Bar antigua solo por conocer su código. */
export async function registrarNuevaSalaBar(sessionId, nombre, tokenAnterior) {
  await asegurarBarAds();
  const db = await getDb();
  const huella = huellaPropietario(tokenAnterior);
  const yaExiste = huella ? await db.prepare('select id from bar_venues where owner_token_hash = ?').get(huella) : null;
  const token = yaExiste ? tokenAnterior : randomBytes(32).toString('hex');
  let venueId = yaExiste?.id;
  if (!venueId) {
    const res = await db.prepare('insert into bar_venues (name,owner_token_hash) values (?,?)')
      .run(String(nombre || 'Mi bar').trim().slice(0,100), huellaPropietario(token));
    venueId = res.lastInsertRowid;
  }
  await db.prepare('insert into bar_rooms (session_id,venue_id) values (?,?)').run(sessionId, venueId);
  return token;
}

export async function propietarioDeSala(sessionId, token) {
  const huella = huellaPropietario(token);
  if (!huella) return null;
  await asegurarBarAds();
  const db = await getDb();
  return await db.prepare(`select v.id as id,v.name as name,v.logo_url as logo_url
    from bar_venues v join bar_rooms r on r.venue_id=v.id
    where r.session_id=? and v.owner_token_hash=?`).get(Number(sessionId),huella);
}

export async function barDeSala(sessionId) {
  await asegurarBarAds();
  return await (await getDb()).prepare(`select v.id,v.name,v.logo_url
    from bar_venues v join bar_rooms r on r.venue_id=v.id where r.session_id=?`).get(Number(sessionId));
}

export const ADS_PLACEMENTS = ['espera','entre','resultado'];
export function validarCampania(input) {
  const title = String(input.title || '').trim().slice(0,90);
  if (!title) throw new Error('Escribe el nombre de la promoción.');
  if (!ADS_PLACEMENTS.includes(input.placement)) throw new Error('Ubicación inválida.');
  const layout = input.placement === 'espera' ? 'spotlight' :
    input.placement === 'entre' ? 'tarjeta' : 'firma';
  const duracion = input.placement === 'resultado' ? 3 :
    input.placement === 'entre' ? 6 : Math.min(12,Math.max(8,Number(input.duration_seconds)||10));
  const priority = Math.min(2,Math.max(0,Math.trunc(Number(input.priority)||0)));
  const starts_at = input.starts_at || null;
  const ends_at = input.ends_at || null;
  if (starts_at && !Number.isFinite(Date.parse(starts_at))) throw new Error('Fecha de inicio inválida.');
  if (ends_at && !Number.isFinite(Date.parse(ends_at))) throw new Error('Fecha final inválida.');
  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) {
    throw new Error('La fecha final debe ser posterior al inicio.');
  }
  return { title,placement:input.placement,layout,duration_seconds:duracion,priority,
    starts_at:starts_at ? new Date(starts_at).toISOString() : null,
    ends_at:ends_at ? new Date(ends_at).toISOString() : null };
}

/** Nunca confiar en venue_id de formularios: siempre se deriva de la cookie. */
export async function crearCampania(venueId, configuracion, blob) {
  await asegurarBarAds();
  const c=validarCampania(configuracion);
  const res=await (await getDb()).prepare(`insert into bar_campaigns
    (venue_id,title,image_url,blob_path,content_type,placement,layout,duration_seconds,priority,status,starts_at,ends_at)
    values (?,?,?,?,?,?,?,?,?,'draft',?,?)`).run(
      venueId,c.title,blob.url,blob.pathname,blob.contentType,c.placement,c.layout,c.duration_seconds,
      c.priority,c.starts_at,c.ends_at);
  return res.lastInsertRowid;
}

export async function listarCampanias(venueId) {
  await asegurarBarAds();
  return await (await getDb()).prepare(`select c.*,
    (select count(*) from bar_impressions i where i.campaign_id=c.id) as impresiones
    from bar_campaigns c where venue_id=? and status!='archived'
    order by created_at desc, id desc`).all(venueId);
}

export async function editarCampania(venueId,id,input) {
  const c=validarCampania(input);
  await asegurarBarAds();
  const resultado=await (await getDb()).prepare(`update bar_campaigns
    set title=?,placement=?,layout=?,duration_seconds=?,priority=?,starts_at=?,ends_at=?,updated_at=datetime('now')
    where venue_id=? and id=? and status!='archived'`).run(
      c.title,c.placement,c.layout,c.duration_seconds,c.priority,c.starts_at,c.ends_at,
      Number(venueId),Number(id));
  return resultado.changes>0;
}

export async function campaniaDelBar(venueId,id) {
  await asegurarBarAds();
  return await (await getDb()).prepare('select id,blob_path from bar_campaigns where venue_id=? and id=?')
    .get(Number(venueId),Number(id));
}

export async function eliminarCampania(venueId,id) {
  await asegurarBarAds();
  return await (await getDb()).prepare('delete from bar_campaigns where venue_id=? and id=?')
    .run(Number(venueId),Number(id));
}

export async function cambiarEstadoCampania(venueId,id,status) {
  if (!['draft','active','paused','archived'].includes(status)) return false;
  await asegurarBarAds();
  const db=await getDb();
  const r=await db.prepare(`update bar_campaigns set status=?,updated_at=datetime('now')
     where id=? and venue_id=? and status!='archived'`).run(status,Number(id),venueId);
  return r.changes > 0;
}

export async function actualizarLogoBar(venueId, url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('URL inválida.');
  await asegurarBarAds();
  await (await getDb()).prepare('update bar_venues set logo_url=? where id=?').run(url,venueId);
}

export async function actualizarMarcaBar(venueId, nombre) {
  const limpio=String(nombre||'').trim().slice(0,100);
  if (!limpio) throw new Error('Escribe el nombre del establecimiento.');
  await asegurarBarAds();
  await (await getDb()).prepare('update bar_venues set name=? where id=?').run(limpio,venueId);
}

/** Solo contenido activo dentro del periodo configurado. Orden estable para rotación. */
export async function promocionesDeSala(sessionId, ahora=new Date()) {
  await asegurarBarAds();
  const iso=ahora.toISOString();
  const filas=await (await getDb()).prepare(`select c.id,c.title,c.image_url,c.placement,c.layout,
      c.duration_seconds,c.priority,v.name as bar_name,v.logo_url as bar_logo
    from bar_rooms r join bar_venues v on v.id=r.venue_id
    join bar_campaigns c on c.venue_id=v.id
    where r.session_id=? and c.status='active'
      and (c.starts_at is null or c.starts_at<=?)
      and (c.ends_at is null or c.ends_at>?)
    order by c.priority desc,c.id asc limit 25`).all(Number(sessionId),iso,iso);
  return filas;
}

export async function registrarImpresion(sessionId,campaignId,placement) {
  if (!ADS_PLACEMENTS.includes(placement)) return false;
  await asegurarBarAds();
  const db=await getDb();
  const exists=await db.prepare(`select c.id from bar_rooms r
     join bar_campaigns c on c.venue_id=r.venue_id
     where r.session_id=? and c.id=? and c.placement=? and c.status='active'`).get(sessionId,campaignId,placement);
  if (!exists) return false;
  await db.prepare('insert into bar_impressions (campaign_id,session_id,placement) values (?,?,?)')
     .run(campaignId,sessionId,placement);
  return true;
}
