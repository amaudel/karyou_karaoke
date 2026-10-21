/**
 * Verifica la clave de la API de YouTube y comprueba lo que necesita el importador.
 *
 *   pnpm verificar-api
 *
 * Solo lectura: no modifica nada y no guarda nada. Consume unas 10 unidades de las
 * 10.000 diarias, y CERO de las 100 búsquedas diarias.
 *
 * Comprueba cuatro cosas:
 *   1. Que la clave funciona.
 *   2. Que se puede resolver un canal a partir de su @handle (channels.list?forHandle).
 *      Si esto falla, el importador necesita otro camino y hay que replantearlo.
 *   3. Cuántos videos tiene cada canal, para saber qué tamaño tendrá el pool.
 *   4. Que se puede leer la duración y el estado de inserción de un video (videos.list).
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('No existe .env.local. Cópialo de .env.example y pon tu clave dentro.');
  process.exit(1);
}

process.loadEnvFile(envPath);

const KEY = (process.env.YOUTUBE_API_KEY ?? '').trim();

if (!KEY) {
  console.error('.env.local existe pero YOUTUBE_API_KEY está vacía.');
  process.exit(1);
}
if (KEY === 'PEGA_TU_CLAVE_AQUI') {
  console.error('Todavía no has sustituido PEGA_TU_CLAVE_AQUI por tu clave en .env.local.');
  process.exit(1);
}

const API = 'https://www.googleapis.com/youtube/v3';

/** Los mismos canales que están en el seed, más el excluido para confirmar el motivo. */
const CANALES = [
  { handle: '@partytymekaraokeenespanol7262', nombre: 'PARTY TYME KARAOKE EN ESPAÑOL' },
  { handle: '@EchoeEntertainment', nombre: 'Echoe Entertainment' },
  { handle: '@KaraokeMediaPlus', nombre: 'KaraokeMedia' },
  { handle: '@OficialMana', nombre: 'OficialMana' },
  { handle: '@muramatsukaraoke', nombre: 'Muramatsu Karaoke' },
  { handle: '@ChansonKaraoke', nombre: 'Chanson Karaoke' },
];

let unidades = 0;

async function api(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', KEY);

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = json?.error;
    const motivo = err?.errors?.[0]?.reason ?? '';
    throw new Error(
      `HTTP ${res.status} — ${err?.message ?? res.statusText}${motivo ? ` [${motivo}]` : ''}`,
    );
  }
  return json;
}

function explicar(error) {
  const m = String(error.message ?? error);
  if (m.includes('API key not valid')) {
    return 'La clave está mal copiada, o la API tarda un par de minutos en propagarse.';
  }
  if (m.includes('has not been used in project') || m.includes('is disabled')) {
    return 'Falta habilitar "YouTube Data API v3" en el proyecto (APIs y servicios → Biblioteca).';
  }
  if (m.includes('quotaExceeded')) {
    return 'Cupo agotado. Es raro en un proyecto nuevo; avísame.';
  }
  if (m.includes('forHandle') || m.includes('Invalid value')) {
    return 'Este proyecto no acepta el parámetro forHandle: habría que resolver los canales de otra forma.';
  }
  if (m.includes('PERMISSION_DENIED') || m.includes('API_KEY_SERVICE_BLOCKED')) {
    return 'La clave está restringida a otra API. Edítala y marca "YouTube Data API v3".';
  }
  return 'Revisa el mensaje de arriba.';
}

console.log('Verificando la clave de YouTube Data API v3');
console.log('(consumo estimado: ~10 unidades de 10.000, 0 de las 100 búsquedas)\n');

// ---------------------------------------------------------------- 1. la clave
try {
  unidades += 1;
  await api('i18nRegions', { part: 'snippet', hl: 'es' });
  console.log('1. La clave funciona.                          OK');
} catch (error) {
  console.error(`1. La clave falla.\n   ${error.message}\n   → ${explicar(error)}`);
  process.exit(1);
}

// ------------------------------------------- 2 y 3. resolver canales y tamaño
console.log('\n2 y 3. Canales y tamaño del catálogo\n');
console.log('   ' + 'CANAL'.padEnd(30) + 'ID'.padEnd(26) + 'VIDEOS');
console.log('   ' + '-'.repeat(66));

const resueltos = [];
let fallidos = 0;

for (const canal of CANALES) {
  try {
    unidades += 1;
    const data = await api('channels', {
      part: 'id,snippet,contentDetails,statistics',
      forHandle: canal.handle,
    });

    const item = data.items?.[0];
    if (!item) {
      console.log(`   ${canal.nombre.slice(0, 28).padEnd(30)}< no encontrado >`);
      fallidos += 1;
      continue;
    }

    const videos = item.statistics?.videoCount ?? '?';
    const uploads = item.contentDetails?.relatedPlaylists?.uploads ?? '';
    resueltos.push({ ...canal, channelId: item.id, uploads, videos });

    console.log(
      `   ${canal.nombre.slice(0, 28).padEnd(30)}${String(item.id).padEnd(26)}${videos}`,
    );
    if (uploads) console.log(`   ${''.padEnd(30)}playlist de subidas: ${uploads}`);
  } catch (error) {
    fallidos += 1;
    console.log(`   ${canal.nombre.slice(0, 28).padEnd(30)}ERROR: ${error.message}`);
    console.log(`   ${''.padEnd(30)}→ ${explicar(error)}`);
  }
}

// ------------------------------------------ 4. duración y estado de inserción
console.log('\n4. Duración y estado de inserción (videos.list)\n');
try {
  unidades += 1;
  const data = await api('videos', {
    part: 'snippet,contentDetails,status',
    id: 'wt-pY4mI2rs',
  });
  const v = data.items?.[0];
  if (!v) {
    console.log('   El video de prueba no devolvió datos.');
  } else {
    console.log(`   título:      ${v.snippet?.title}`);
    console.log(`   duración:    ${v.contentDetails?.duration}  (ISO 8601)`);
    console.log(`   insertable:  ${v.status?.embeddable}`);
    console.log(`   definición:  ${v.contentDetails?.definition}`);
    console.log('\n   OK: se puede leer la duración sin gastar búsquedas.');
  }
} catch (error) {
  console.log(`   ERROR: ${error.message}\n   → ${explicar(error)}`);
}

// -------------------------------------------------------------------- resumen
const totalVideos = resueltos.reduce((suma, c) => suma + Number(c.videos || 0), 0);

console.log('\n' + '='.repeat(70));
console.log(`Canales resueltos: ${resueltos.length} de ${CANALES.length}${fallidos ? ` (${fallidos} con error)` : ''}`);
if (totalVideos > 0) {
  console.log(`Videos publicados en total: ~${totalVideos.toLocaleString('es-EC')}`);
  const llamadas = Math.ceil(totalVideos / 50) * 2;
  console.log(`Coste estimado de importarlos todos: ~${llamadas} unidades (el ${((llamadas / 10000) * 100).toFixed(1)}% del cupo diario)`);
}
console.log(`Unidades consumidas en esta verificación: ~${unidades}`);
console.log('='.repeat(70));

if (resueltos.length === 0) {
  console.log('\nNingún canal se pudo resolver. Sin esto el importador no puede funcionar.');
  process.exit(1);
}
console.log('\nTodo listo para construir el importador.');
