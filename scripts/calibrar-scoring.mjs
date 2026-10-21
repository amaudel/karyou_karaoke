/**
 * Calibrador del motor de puntuación.
 *
 *   node scripts/calibrar-scoring.mjs            informe completo
 *   node scripts/calibrar-scoring.mjs --ajustar  busca los pesos que mejor encajan
 *
 * Simula actuaciones con entradas realistas y mide tres cosas:
 *
 *   1. Si la distribución cae donde pide `SPEC.md` §17.3.
 *   2. CUÁNTA VARIANZA APORTA CADA COSA. Es lo importante: si el resultado varía
 *      casi todo por el generador aleatorio y muy poco por las señales reales, el
 *      motor es un número al azar disfrazado, y hay que añadir una señal de verdad
 *      (el micrófono). Este informe es el que decide eso, no una opinión.
 *   3. Qué pasaría sin audiencia y sin ninguna señal, para ver el suelo.
 *
 * La simulación usa una semilla fija: el informe es reproducible.
 */
import { puntuar, CONFIG_POR_DEFECTO } from '../src/domain/scoring/motor.mjs';
import { crearAzar, semillaDesde } from '../src/domain/scoring/azar.mjs';

const AJUSTAR = process.argv.includes('--ajustar');
const SEMILLA_INFORME = 20260915;

/** Bandas de `SPEC.md` §17.3, con la frecuencia objetivo de cada una. */
const BANDAS = [
  { nombre: '50-69  bajo', desde: 0, hasta: 69, objetivo: 3 },
  { nombre: '70-79  normal', desde: 70, hasta: 79, objetivo: 25 },
  { nombre: '80-89  bueno', desde: 80, hasta: 89, objetivo: 40 },
  { nombre: '90-96  excelente', desde: 90, hasta: 96, objetivo: 28 },
  { nombre: '97-100 excepcional', desde: 97, hasta: 100, objetivo: 4 },
];

/**
 * Genera una actuación con distribución realista.
 *
 * Los números salen de lo que se ve en una fiesta: la mayoría termina la canción,
 * algunos la abandonan, las pausas son raras, y la sala aplaude con ganas cuando le
 * gusta. En modo `plano` todas las señales son idénticas, que es el caso que revela
 * cuánto del resultado es azar.
 *
 * Cada actuación tiene una **habilidad latente**: lo que un micrófono podría medir de
 * verdad y lo que hoy no medimos. La habilidad influye en el resto de señales —quien
 * canta mejor abandona menos y recibe más aplausos—, así que las señales quedan
 * correlacionadas con algo real, como pasa en una fiesta.
 *
 * @param {() => number} r    generador de la simulación
 * @param {{ plano?: boolean, conAudiencia?: boolean, conMicro?: boolean }} opciones
 */
function actuacion(r, opciones = {}) {
  const { plano = false, conAudiencia = true, conMicro = false } = opciones;

  if (plano) {
    // Todo perfecto e idéntico en cada simulación: ninguna señal aporta información.
    return {
      completionRatio: 1,
      interruptionCount: 0,
      endedNaturally: true,
      audienceCheers: 6,
      audienceSize: 12,
      priorScores: [85, 84],
      songDifficulty: 3,
      seed: `plano-${Math.floor(r() * 1e9)}`,
    };
  }

  const limitar01 = (v) => Math.min(1, Math.max(0, v));

  // Habilidad latente del cantante. Es lo que un micrófono mediría.
  const habilidad = limitar01(0.2 + r() * 0.75);

  const abandona = r() < 0.07 * (1.4 - habilidad);
  const paradas = r() < 0.85 ? 0 : r() < 0.9 ? 1 : 2;
  const oyentes = conAudiencia ? 5 + Math.floor(r() * 16) : 0;
  // La sala aplaude más a quien canta mejor, con bastante ruido.
  const ganas = limitar01(0.1 + habilidad * 0.6 + (r() - 0.5) * 0.35);
  const aplausos = Math.round(oyentes * ganas);

  return {
    completionRatio: abandona ? 0.15 + r() * 0.3 : 0.97 + r() * 0.03,
    interruptionCount: paradas,
    endedNaturally: !abandona,
    audienceCheers: aplausos,
    audienceSize: oyentes,
    priorScores: Array.from({ length: Math.floor(r() * 6) }, () => 80 + r() * 15),
    songDifficulty: 3,
    // El micrófono mide la habilidad con ruido: nunca es una medida perfecta.
    voiceQuality: conMicro ? limitar01(habilidad + (r() - 0.5) * 0.25) : undefined,
    seed: `sim-${SEMILLA_INFORME}-${Math.floor(r() * 1e9)}`,
  };
}

/**
 * Simula N actuaciones y devuelve el histograma y la aportación de cada componente.
 * @param {number} n
 * @param {{ plano?: boolean, conAudiencia?: boolean }} opciones
 * @param {typeof CONFIG_POR_DEFECTO} [config]
 */
function simular(n, opciones = {}, config = CONFIG_POR_DEFECTO) {
  const r = crearAzar(SEMILLA_INFORME);
  const conteo = BANDAS.map(() => 0);
  const componentes = {
    finalizacion: [],
    consistencia: [],
    audiencia: [],
    racha: [],
    microfono: [],
    variacion: [],
    raro: [],
  };
  const totales = [];

  for (let i = 0; i < n; i += 1) {
    const entradas = actuacion(r, opciones);
    const res = puntuar(entradas, config);

    totales.push(res.total);
    for (const clave of Object.keys(componentes)) {
      componentes[clave].push(res.detalle[clave]);
    }

    const banda = BANDAS.findIndex((b) => res.total >= b.desde && res.total <= b.hasta);
    if (banda >= 0) conteo[banda] += 1;
  }

  const porcentajes = conteo.map((c) => (c / n) * 100);
  const varianzas = Object.fromEntries(
    Object.entries(componentes).map(([k, valores]) => [k, varianza(valores)]),
  );
  const sumaVarianzas = Object.values(varianzas).reduce((a, b) => a + b, 0);

  return {
    n,
    porcentajes,
    varianzas,
    sumaVarianzas,
    media: totales.reduce((a, b) => a + b, 0) / n,
    desviacion: Math.sqrt(varianza(totales)),
    min: Math.min(...totales),
    max: Math.max(...totales),
  };
}

function varianza(valores) {
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  return valores.reduce((acc, v) => acc + (v - media) ** 2, 0) / valores.length;
}

function barra(porcentaje, ancho = 34) {
  const lleno = Math.round((porcentaje / 50) * ancho);
  return '█'.repeat(Math.max(0, lleno));
}

function informeDistribucion(titulo, res) {
  console.log(`\n${titulo}   (${res.n.toLocaleString('es-EC')} simulaciones)`);
  console.log('─'.repeat(78));
  console.log('  BANDA                 OBJETIVO   OBTENIDO   DIFERENCIA');
  for (let i = 0; i < BANDAS.length; i += 1) {
    const b = BANDAS[i];
    const obtenido = res.porcentajes[i];
    const dif = obtenido - b.objetivo;
    const signo = dif >= 0 ? '+' : '';
    console.log(
      `  ${b.nombre.padEnd(20)}  ${String(b.objetivo).padStart(6)} %  ${obtenido.toFixed(1).padStart(7)} %  ${(signo + dif.toFixed(1)).padStart(8)} pp   ${barra(obtenido)}`,
    );
  }
  console.log(
    `\n  media ${res.media.toFixed(1)} · desviación ${res.desviacion.toFixed(1)} · rango ${res.min}–${res.max}`,
  );
}

function informeVarianza(res) {
  console.log('\n  DE QUÉ DEPENDE QUE EL RESULTADO CAMBIE');
  console.log('─'.repeat(78));
  const nombre = {
    finalizacion: 'terminar la canción',
    consistencia: 'no interrumpir',
    audiencia: 'aplausos de la sala',
    racha: 'haber cantado antes',
    microfono: 'actividad vocal (micro)',
    variacion: 'azar sembrado',
    raro: 'bonus poco frecuente',
  };
  const filas = Object.entries(res.varianzas)
    .map(([k, v]) => ({ clave: k, v, pct: (v / res.sumaVarianzas) * 100 }))
    .sort((a, b) => b.v - a.v);

  for (const fila of filas) {
    const esAzar = fila.clave === 'variacion' || fila.clave === 'raro';
    const marca = esAzar ? 'azar ' : 'señal';
    console.log(
      `  ${marca}  ${nombre[fila.clave].padEnd(24)} ${fila.pct.toFixed(1).padStart(5)} %   ${barra(fila.pct, 26)}`,
    );
  }

  const azar = filas
    .filter((f) => f.clave === 'variacion' || f.clave === 'raro')
    .reduce((a, f) => a + f.pct, 0);
  const senal = 100 - azar;

  console.log('');
  console.log(`  señales reales: ${senal.toFixed(1)} %     azar: ${azar.toFixed(1)} %`);
  const veredicto =
    senal >= 50
      ? 'Las señales mandan: el motor se sostiene sin micrófono.'
      : senal >= 30
        ? 'Las señales pesan, pero el azar manda. Zona discutible.'
        : 'El azar manda. Sin una señal más rica, esto es un número aleatorio disfrazado.';
  console.log(`  → ${veredicto}`);
}

/* ------------------------------------------------------------------ informe */

console.log('');
console.log('CALIBRACIÓN DEL MOTOR DE PUNTUACIÓN');
console.log('='.repeat(78));

const realista = simular(100_000);
informeDistribucion('ESCENARIO REALISTA (con audiencia)', realista);
informeVarianza(realista);

console.log('\n\nESCENARIOS DE CONTROL');
console.log('='.repeat(78));

const sinAudiencia = simular(100_000, { conAudiencia: false });
informeDistribucion('SIN AUDIENCIA (nadie aplaude)', sinAudiencia);

const plano = simular(100_000, { plano: true });
informeDistribucion('SEÑALES PLANAS (todos terminan, sin pausas, misma sala)', plano);
informeVarianza(plano);

console.log('\n  El escenario plano es el diagnóstico clave: si con todas las señales');
console.log('  idénticas el resultado sigue variando, esa variación es solo azar.');

/* ------------------------------------------- ¿y si hubiera micrófono? */

console.log('\n\n¿QUÉ CAMBIARÍA CON MICRÓFONO?');
console.log('='.repeat(78));
console.log('  Subiendo el peso de la actividad vocal, que hoy está en 0, y BAJANDO');
console.log('  la variación sembrada: si una señal real diferencia, hace falta menos azar.');
console.log('  La simulación da a cada cantante una habilidad latente que el micro mide');
console.log('  con ruido, y hace que quien canta mejor abandone menos y reciba más aplausos.\n');
console.log('  peso  escala   señales   azar    media   desv.   distribución');
console.log('  ' + '─'.repeat(70));

for (const [peso, escala] of [
  [0, 7],
  [0, 5],
  [12, 6],
  [16, 5],
  [20, 4],
  [24, 3],
  [28, 2],
]) {
  const config = { ...CONFIG_POR_DEFECTO, microfono: peso, variacionEscala: escala };
  const res = simular(60_000, { conMicro: peso > 0 }, config);
  const azarV = res.varianzas.variacion + res.varianzas.raro;
  const pctAzar = (azarV / res.sumaVarianzas) * 100;
  const dist = res.porcentajes.map((x) => x.toFixed(0).padStart(3)).join('/');
  console.log(
    `  ${String(peso).padStart(4)}  ${String(escala).padStart(6)}   ${(100 - pctAzar).toFixed(1).padStart(6)} %   ${pctAzar.toFixed(1).padStart(4)} %   ${res.media.toFixed(1).padStart(5)}   ${res.desviacion.toFixed(1).padStart(5)}   ${dist}`,
  );
}

console.log('\n  Objetivo de la distribución:    3/ 25/ 40/ 28/  4');

/* ------------------------------------------------------ la tensión de fondo */

console.log('\n\nLA TENSIÓN DE FONDO');
console.log('='.repeat(78));
console.log('  Para que los resultados se repartan como pide el SPEC hay que ensanchar la');
console.log('  dispersión. Y ensanchar la dispersión, con estas señales, significa subir el');
console.log('  azar — que es lo que ahoga a las señales. La tabla lo mide:\n');
console.log('  escala   desviación   señales   ¿encaja con el objetivo?');
console.log('  ' + '─'.repeat(58));

for (const escala of [2, 3, 4, 5, 6, 8, 10]) {
  const config = { ...CONFIG_POR_DEFECTO, variacionEscala: escala };
  const res = simular(40_000, {}, config);
  const azarV = res.varianzas.variacion + res.varianzas.raro;
  const pctAzar = (azarV / res.sumaVarianzas) * 100;
  const error = BANDAS.reduce((acc, b, i) => acc + (res.porcentajes[i] - b.objetivo) ** 2, 0);
  const encaje = error < 150 ? 'sí' : error < 400 ? 'regular' : 'no';
  console.log(
    `  ${String(escala).padStart(6)}   ${res.desviacion.toFixed(1).padStart(10)}   ${(100 - pctAzar).toFixed(1).padStart(6)} %   ${encaje} (error ${error.toFixed(0)})`,
  );
}

console.log('\n  Con señales flojas hay que elegir: o los resultados se reparten, o');
console.log('  significan algo. No se puede tener las dos cosas. La salida es añadir una');
console.log('  señal que diferencie de verdad — el micrófono — y entonces bajar la escala.');

/* ------------------------------------------------- ajuste automático de pesos */

if (AJUSTAR) {
  console.log('\n\nBÚSQUEDA DE PESOS');
  console.log('='.repeat(78));
  console.log('  Probando combinaciones y midiendo la distancia a la distribución objetivo…\n');

  const candidatos = [];
  for (let base = 56; base <= 70; base += 2) {
    for (let escala = 4; escala <= 10; escala += 1) {
      for (const prob of [0.03, 0.06, 0.1, 0.15]) {
        const config = {
          ...CONFIG_POR_DEFECTO,
          base,
          variacionEscala: escala,
          bonusRaro: { ...CONFIG_POR_DEFECTO.bonusRaro, probabilidad: prob },
        };
        const res = simular(30_000, {}, config);
        const error = BANDAS.reduce(
          (acc, b, i) => acc + (res.porcentajes[i] - b.objetivo) ** 2,
          0,
        );
        candidatos.push({ base, escala, prob, error, res });
      }
    }
  }

  candidatos.sort((a, b) => a.error - b.error);

  console.log('  base  escala  P(raro)   error   distribución (bajo/normal/bueno/excel/100)');
  console.log('  ' + '─'.repeat(72));
  for (const c of candidatos.slice(0, 8)) {
    const p = c.res.porcentajes.map((x) => x.toFixed(0).padStart(3)).join(' / ');
    console.log(
      `  ${String(c.base).padStart(4)}  ${String(c.escala).padStart(6)}  ${String(c.prob).padStart(7)}  ${c.error.toFixed(0).padStart(6)}   ${p}`,
    );
  }

  const mejor = candidatos[0];
  console.log('\n  Mejor combinación encontrada:');
  console.log(`    base: ${mejor.base}   variacionEscala: ${mejor.escala}   P(raro): ${mejor.prob}`);
  console.log(
    `    → objetivo 3 / 25 / 40 / 28 / 4   ·   obtenido ${mejor.res.porcentajes.map((x) => x.toFixed(1)).join(' / ')}`,
  );
}

console.log('');
