/**
 * Cacería de canales de karaoke VALLENATO. Solo descubre y evalúa: NO importa nada.
 *
 *   node scripts/cazar-vallenato.mjs
 *
 * Evalúa cada canal en tres capas, en orden de fiabilidad:
 *   1. ¿El canal se presenta como karaoke/pistas? (título + descripción)
 *   2. ¿Sus videos llevan marca de karaoke en el título? (muestra de subidas)
 *   3. ¿Se insertan de verdad? status.embeddable MIENTE con Content ID, así que se
 *      comprueba con oEmbed (sin cuota) una muestra de los que dicen ser insertables.
 *
 * Consumo: N búsquedas (de las 100 diarias) + ~1 unidad por canal + ~2 por página
 * de muestra. No escribe en la base de datos.
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('No existe .env.local con YOUTUBE_API_KEY.');
  process.exit(1);
}
process.loadEnvFile(envPath);
const KEY = (process.env.YOUTUBE_API_KEY ?? '').trim();
if (!KEY || KEY === 'PEGA_TU_CLAVE_AQUI') {
  console.error('Falta la clave en .env.local.');
  process.exit(1);
}

const API = 'https://www.googleapis.com/youtube/v3';

async function api(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  url.searchParams.set('key', KEY);
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new Error(`HTTP ${res.status} — ${err?.message ?? res.statusText} [${err?.errors?.[0]?.reason ?? ''}]`);
  }
  return json;
}

// Lo mismo que el importador: términos que marcan "esto es karaoke".
const NORM = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const MARCA_KARAOKE = ['karaoke', 'pista', 'pistas', 'instrumental', 'backing', 'sin voz', 'playback', 'play back'];
const MARCA_DESCARTE = ['cover', 'tutorial', 'reaccion', 'en vivo', 'live', 'concierto', 'entrevista', 'con voz', 'acapella'];

function marcaTitulo(titulo) {
  const t = NORM(titulo);
  for (const m of MARCA_DESCARTE) if (t.includes(m)) return 'descarte';
  for (const m of MARCA_KARAOKE) if (t.includes(m)) return 'fuerte';
  return 'debil';
}

function marcaCanal({ titulo, descripcion }) {
  const t = NORM(`${titulo ?? ''} ${descripcion ?? ''}`);
  const tiene = MARCA_KARAOKE.filter((m) => t.includes(m));
  const malo = MARCA_DESCARTE.some((m) => t.includes(m));
  return { karaoke: tiene.length > 0, malo, senales: tiene };
}

function isoASegundos(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, d, h, mi, s] = m;
  const total = Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : null;
}

// ------------------------------------------------------------- 1. descubrir
const CONSULTAS = [
  'karaoke vallenato',
  'pistas vallenato',
  'vallenato instrumental',
  'karaoke vallenato instrumental',
  'karaoke diomedes diaz',
  'karaoke silvestre dangond',
];

console.log('=== 1. Búsqueda de canales ===\n');
const canales = new Map(); // channelId -> {titulo, descripcion, subs, videos}

for (const q of CONSULTAS) {
  try {
    const data = await api('search', {
      part: 'snippet',
      type: 'channel',
      q,
      maxResults: 20,
    });
    for (const it of data.items ?? []) {
      const id = it.snippet?.channelId;
      if (!id || canales.has(id)) continue;
      canales.set(id, {
        titulo: it.snippet?.channelTitle ?? '',
        descripcion: it.snippet?.description ?? '',
      });
    }
    console.log(`  "${q}" -> ${(data.items ?? []).length} canales (acumulado ${canales.size})`);
  } catch (e) {
    console.log(`  "${q}" ERROR: ${e.message}`);
  }
}

// Enriquecer con stats + playlist de subidas de cada canal.
console.log('\n=== 2. Evaluación de canal (marca de karaoke + tamaño) ===\n');
const evaluados = [];
for (const [id, base] of canales) {
  try {
    const data = await api('channels', {
      part: 'snippet,statistics,contentDetails',
      id,
    });
    const it = data.items?.[0];
    if (!it) continue;
    const marca = marcaCanal({ titulo: it.snippet?.title, descripcion: it.snippet?.description });
    evaluados.push({
      channelId: id,
      titulo: it.snippet?.title ?? base.titulo,
      descripcion: (it.snippet?.description ?? base.descripcion).slice(0, 180),
      videos: Number(it.statistics?.videoCount ?? 0),
      subs: Number(it.statistics?.subscriberCount ?? 0),
      uploads: it.contentDetails?.relatedPlaylists?.uploads ?? '',
      marca,
    });
  } catch (e) {
    console.log(`  ${base.titulo} ERROR: ${e.message}`);
  }
}

evaluados.sort((a, b) => {
  // Karaoke primero, luego más videos, luego más subs.
  if (a.marca.karaoke !== b.marca.karaoke) return a.marca.karaoke ? -1 : 1;
  return b.videos - a.videos;
});

for (const c of evaluados) {
  const tag = c.marca.karaoke ? `KARAOKE [${c.marca.senales.join(', ')}]` : (c.marca.malo ? 'DESCARTE' : 'ambiguo');
  console.log(
    `  ${tag.padEnd(34)} ${String(c.videos).padStart(5)} vídeos · ${String(c.subs).padStart(7)} subs · ${c.titulo.slice(0, 52)}`,
  );
}

// -------------------------------------------------- 3. muestra de los candidatos
const CANDIDATOS = evaluados.filter((c) => c.marca.karaoke && c.uploads).slice(0, 8);

console.log('\n=== 3. Muestra de subidas de los candidatos karaoke ===\n');

for (const c of CANDIDATOS) {
  let vistos = 0;
  let embebibles = 0;
  let tituloKaraoke = 0;
  let duracionOk = 0;
  const ejemplos = [];

  try {
    const lista = await api('playlistItems', {
      part: 'contentDetails,snippet',
      playlistId: c.uploads,
      maxResults: 50,
    });
    const items = (lista.items ?? []).map((i) => ({
      videoId: i.contentDetails?.videoId,
      titulo: i.snippet?.title ?? '',
    })).filter((i) => i.videoId);

    if (items.length > 0) {
      const detalles = await api('videos', {
        part: 'contentDetails,status',
        id: items.map((i) => i.videoId).join(','),
      });
      const porId = new Map((detalles.items ?? []).map((v) => [v.id, v]));

      for (const it of items) {
        const d = porId.get(it.videoId);
        if (!d) continue;
        vistos += 1;
        const emb = d.status?.embeddable === true && d.status?.privacyStatus === 'public';
        if (emb) embebibles += 1;
        if (marcaTitulo(it.titulo) === 'fuerte') tituloKaraoke += 1;
        const dur = isoASegundos(d.contentDetails?.duration);
        if (dur && dur >= 90 && dur <= 600) duracionOk += 1;
        if (ejemplos.length < 4) ejemplos.push(it.titulo.slice(0, 70));
      }
    }
  } catch (e) {
    console.log(`  ${c.titulo}: ERROR ${e.message}\n`);
    continue;
  }

  console.log(`  ${c.titulo.slice(0, 50)}`);
  console.log(
    `    muestra ${vistos} · embebibles ${embebibles} (${((embebibles / Math.max(1, vistos)) * 100).toFixed(0)}%) · título-karaoke ${tituloKaraoke} · duración 1.5–10min ${duracionOk}`,
  );
  for (const e of ejemplos) console.log(`      · ${e}`);
  console.log('');
}

// --------------------------------------- 4. embebibilidad REAL por oEmbed (sin cuota)
console.log('=== 4. Comprobación real de inserción (oEmbed) ===\n');
console.log('   status.embeddable miente con Content ID; oEmbed devuelve 401/403 cuando');
console.log('   YouTube bloquea la inserción por derechos. Probamos un embebible de cada canal.\n');

for (const c of CANDIDATOS) {
  let probado = null;
  try {
    const lista = await api('playlistItems', {
      part: 'contentDetails,snippet',
      playlistId: c.uploads,
      maxResults: 50,
    });
    const ids = (lista.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean);
    if (ids.length === 0) continue;

    const detalles = await api('videos', {
      part: 'status,contentDetails',
      id: ids.join(','),
    });
    const emb = (detalles.items ?? []).find(
      (v) => v.status?.embeddable === true && isoASegundos(v.contentDetails?.duration) !== null,
    );
    if (!emb) {
      console.log(`  ${c.titulo.slice(0, 44).padEnd(44)} < sin candidato insertable >`);
      continue;
    }

    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${emb.id}&format=json`);
    probado = r.status;
    console.log(
      `  ${c.titulo.slice(0, 44).padEnd(44)} oEmbed ${r.status} (${r.ok ? 'sí insertable' : 'BLOQUEADO'}) · ${emb.id}`,
    );
  } catch (e) {
    console.log(`  ${c.titulo.slice(0, 44).padEnd(44)} ERROR ${e.message}`);
  }
}

console.log('\n=== Resumen ===');
console.log(`  canales descubiertos: ${canales.size}`);
console.log(`  candidatos karaoke:   ${CANDIDATOS.length}`);
console.log('');
console.log('  No se ha modificado nada. Decide qué canales añadir y ejecuta la importación.');
