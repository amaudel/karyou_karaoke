/**
 * Inspección profunda de los candidatos a karaoke vallenato. NO importa nada.
 *
 * Para cada canal objetivo descarga hasta 4 páginas de subidas (200 vídeos) y
 * clasifica cada título en cubos que separan la paja del trigo:
 *   - karaoke: lleva marca de karaoke/pista/instrumental
 *   - análisis: "(Análisis)" o "#shorts" — NO es una pista, es contenido de red
 *   - cover: dice "cover" — probablemente con voz
 *   - vallenato: el título/artista es vallenato (no salsa/cumbia)
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
process.loadEnvFile(envPath);
const KEY = (process.env.YOUTUBE_API_KEY ?? '').trim();

const API = 'https://www.googleapis.com/youtube/v3';
let unidades = 0;

async function api(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  url.searchParams.set('key', KEY);
  unidades += 1;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${json?.error?.message ?? ''}`);
  return json;
}

const N = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const KARAOKE = ['karaoke', 'pista', 'pistas', 'instrumental', 'backing', 'sin voz', 'play back'];
const VALLENATO = [
  'vallenato', 'diomedes', 'silvestre', 'binomio', 'celedon', 'orozco', 'manjarres',
  'pelaez', 'zuleta', 'villazon', 'teheran', 'kaleth', 'martin elias', 'beto zabaleta',
  'elder dayan', 'poncho', 'ivan villazon', 'jean carlos', 'jorge celedon', 'rafael orozco',
  'peter', 'patricia', 'los betos', 'los diablitos', 'hermanos zuleta',
];
const OTRO_GENERO = ['salsa', 'cumbia', 'merengue', 'bachata', 'regueton', 'reggaeton', 'norteño', 'ranchera'];

const OBJETIVOS = [
  'Karaoke Vallenato',
  'Karaoke Vallenato Cristiano',
  'JOTA KARAOKE',
  'KaraokeGO',
  'Alexander Carpio Music',
  'PISTA KARAOKE JCMIX',
];

function isoASegundos(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, d, h, mi, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
}

// Resolver los objetivos por nombre mediante búsqueda de canales.
const resueltos = [];
for (const nombre of OBJETIVOS) {
  const data = await api('search', { part: 'snippet', type: 'channel', q: nombre, maxResults: 5 });
  // Quedarse con el canal cuyo título normalizado coincide, priorizando más vídeos.
  let mejor = null;
  for (const it of data.items ?? []) {
    const t = N(it.snippet?.channelTitle);
    if (t.includes(N(nombre)) || N(nombre).includes(t)) {
      const d = await api('channels', { part: 'statistics,contentDetails', id: it.snippet.channelId });
      const v = Number(d.items?.[0]?.statistics?.videoCount ?? 0);
      if (!mejor || v > mejor.videos) mejor = { ...it.snippet, videos: v, data: d.items?.[0] };
    }
  }
  if (mejor) resueltos.push({ nombre, channelId: mejor.channelId, videos: mejor.videos, uploads: mejor.data?.contentDetails?.relatedPlaylists?.uploads });
}

console.log('=== Inspección profunda (hasta 200 vídeos/canal) ===\n');

for (const c of resueltos) {
  let karaoke = 0, analisis = 0, cover = 0, vallenato = 0, otroGenero = 0;
  let completos = 0, embebibles = 0, vistos = 0;
  const ejemplosKaraoke = [], ejemplosBasura = [];
  let cursor = null;

  for (let p = 0; p < 4; p++) {
    const lista = await api('playlistItems', {
      part: 'contentDetails,snippet', playlistId: c.uploads, maxResults: 50, pageToken: cursor ?? undefined,
    });
    const items = (lista.items ?? []).map((i) => ({ id: i.contentDetails?.videoId, t: i.snippet?.title ?? '' })).filter((i) => i.id);
    if (!items.length) break;

    const det = await api('videos', { part: 'contentDetails,status', id: items.map((i) => i.id).join(',') });
    const porId = new Map((det.items ?? []).map((v) => [v.id, v]));

    for (const it of items) {
      const d = porId.get(it.id);
      if (!d) continue;
      vistos += 1;
      const tn = N(it.t);
      const dur = isoASegundos(d.contentDetails?.duration) ?? 0;
      const emb = d.status?.embeddable === true && d.status?.privacyStatus === 'public';

      const esKaraoke = KARAOKE.some((m) => tn.includes(m));
      const esAnalisis = tn.includes('analisis') || tn.includes('short');
      const esCover = tn.includes('cover');
      const esVallenato = VALLENATO.some((m) => tn.includes(m)) || tn.includes('vallenato');
      const esOtro = OTRO_GENERO.some((m) => tn.includes(m));

      if (esKaraoke) karaoke += 1;
      if (esAnalisis) analisis += 1;
      if (esCover) cover += 1;
      if (esVallenato) vallenato += 1;
      if (esOtro && !esVallenato) otroGenero += 1;
      if (dur >= 120 && dur <= 600) completos += 1;
      if (emb) embebibles += 1;

      if (esKaraoke && esVallenato && !esAnalisis && ejemplosKaraoke.length < 3) ejemplosKaraoke.push(it.t.slice(0, 60));
      if ((esAnalisis || esCover) && ejemplosBasura.length < 3) ejemplosBasura.push(it.t.slice(0, 60));
    }

    cursor = lista.nextPageToken ?? null;
    if (!cursor) break;
  }

  console.log(`  ${c.nombre}`);
  console.log(`    vistos ${vistos} · embebibles ${embebibles} · karaoke ${karaoke} · vallenato ${vallenato} · análisis/short ${analisis} · cover ${cover} · duración completa ${completos} · otro género ${otroGenero}`);
  for (const e of ejemplosKaraoke) console.log(`      ✓ ${e}`);
  for (const e of ejemplosBasura) console.log(`      ✗ ${e}`);
  console.log('');
}

console.log(`Unidades: ${unidades} · búsquedas: ${resueltos.length} de 100`);
