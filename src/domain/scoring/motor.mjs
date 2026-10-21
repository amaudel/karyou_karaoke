/**
 * Motor de puntuación.
 *
 * Lógica pura: sin base de datos, sin red, sin React. Recibe señales y devuelve un
 * resultado. Se puede ejecutar cien mil veces por segundo, que es justo lo que hace
 * el calibrador.
 *
 * ---------------------------------------------------------------------------
 * QUÉ MIDE Y QUÉ NO
 *
 * Este motor NO mide afinación, ni notas correctas, ni si el cantante canta bien.
 * Mide cosas que la aplicación puede saber de verdad:
 *
 *   - si la canción se terminó o se abandonó;
 *   - si hubo interrupciones;
 *   - cuánta gente de la sala aplaudió;
 *   - cuántas canciones lleva esa persona esta noche.
 *
 * Con eso más una variación sembrada, produce un número entre 50 y 100 que se
 * comporta como una evaluación de videojuego de karaoke. Es recreativo y así se
 * presenta al usuario. La FAQ lo dice con esas palabras.
 *
 * Un 100 no significa "perfecto": significa "le tocó la cola alta de la
 * distribución". Por eso es poco frecuente — si no lo fuera, el ranking no
 * significaría nada.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ LAS SEÑALES SE COMBINAN ASÍ
 *
 * Terminar la canción es la única señal honesta disponible sin micrófono, así que
 * pesa más que ninguna otra: quien abandona a la mitad no puede sacar una nota alta
 * por mucho que le sonría el azar. La variación aleatoria es un ingrediente que
 * redondea el resultado, nunca el resultado entero.
 */
import { crearAzar, semillaDesde, desviacionCentral } from './azar.mjs';

/** Sube cuando cambia el algoritmo. Las puntuaciones guardadas lo registran. */
export const VERSION_MOTOR = 2;

/** Peso de cada componente. Se ajusta con el calibrador, no a ojo. */
export const CONFIG_POR_DEFECTO = {
  /** Punto de partida antes de sumar nada. */
  base: 62,
  /** Hasta dónde puede aportar terminar la canción entera. */
  finalizacion: 12,
  /** Aporta no interrumpir. */
  consistencia: 6,
  /** Aporta el aplauso de la sala. */
  audiencia: 8,
  /** Aporta cantar varias veces en la noche. */
  racha: 2,
  /**
   * Aporta la actividad vocal medida con el micrófono.
   *
   * Está en 0 a propósito: el micrófono NO está implementado. El calibrador lo sube
   * para medir cuánto cambiaría el motor si existiera, y esa medición es la que
   * decide si vale la pena construirlo.
   */
  microfono: 0,
  /**
   * Valor de actividad vocal que se considera neutro: quien lo alcance no gana ni
   * pierde nada por el micrófono.
   *
   * El aporte está CENTRADO en este punto, y eso no es un detalle. Si el micrófono
   * sumara en crudo, cantar bien subiría la nota pero cantar normal también, y el
   * motor entero se desplazaría hacia arriba: el calibrador lo demostró — con el
   * aporte sin centrar, la mitad de los resultados acababan en 97-100. Un
   * diferenciador tiene que restar a quien canta poco, no solo sumar.
   */
  microfonoNeutro: 0.5,
  /**
   * Amplitud de la variación sembrada (desviaciones típicas).
   *
   * Ajustado con el calibrador. Con el micrófono activo conviene bajarlo: si una
   * señal real diferencia, hace falta menos azar para repartir los resultados.
   */
  variacionEscala: 8,
  /**
   * Probabilidad y tamaño del empujón poco frecuente que hace posibles los 97+.
   *
   * El calibrador prefería un 15 %, pero eso no es «raro»: diez y pico personas de
   * cada cien no es excepcional. Se deja en 4 %, que es lo que pide `SPEC.md` §17.3,
   * aceptando un ajuste de la curva ligeramente peor.
   */
  bonusRaro: { probabilidad: 0.04, maximo: 5 },
  minimo: 50,
  maximo: 100,
  /** Rango máximo de separación de los subpuntajes respecto al total. */
  desvioSubpuntaje: 4,
  moderarRacha: true,
  perfiles: { normal: [25, 10, 15, 50], revancha: [10, 10, 15, 65], moderacion: [30, 15, 20, 35] },
};

/**
 * @typedef {object} EntradasPuntuacion
 * @property {number}   completionRatio  0..1 de la canción reproducida
 * @property {number}   interruptionCount pausas y saltos hacia atrás
 * @property {boolean}  endedNaturally   terminó sola, sin que nadie la cortara
 * @property {number}   audienceCheers   cuántas personas aplaudieron
 * @property {number}   audienceSize     cuántas había en la sala
 * @property {number[]} priorScores      puntuaciones previas del mismo participante
 * @property {number}   songDifficulty   1..5
 * @property {number}   [voiceQuality]   0..1 de actividad vocal, si hay micrófono
 * @property {string}   seed             texto estable: sesión + participante + turno
 *
 * @typedef {object} ResultadoPuntuacion
 * @property {number}  total
 * @property {number}  rhythm
 * @property {number}  energy
 * @property {number}  interpretation
 * @property {string}  tier
 * @property {number}  engineVersion
 * @property {string}  semilla
 * @property {object}  detalle  aporte de cada componente, para auditar y calibrar
 */

/** @param {number} valor @param {number} minimo @param {number} maximo */
function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Banda del resultado. Los cortes salen de `SPEC.md` §17.3.
 * @param {number} total
 */
function bandaDe(total) {
  if (total < 70) return 'under';
  if (total < 80) return 'normal';
  if (total < 90) return 'good';
  if (total < 97) return 'excellent';
  return 'exceptional';
}

/**
 * Calcula la puntuación de una actuación.
 *
 * @param {EntradasPuntuacion} entradas
 * @param {typeof CONFIG_POR_DEFECTO} [config]
 * @returns {ResultadoPuntuacion}
 */
export function puntuar(entradas, config = CONFIG_POR_DEFECTO) {
  const azar = crearAzar(semillaDesde(entradas.seed));

  // --- 1. Finalización ------------------------------------------------------
  // La señal que más pesa, y con razón: sin micrófono es lo único que separa a
  // quien cantó de quien se fue.
  const ratio = limitar(Number(entradas.completionRatio) || 0, 0, 1);
  const finalizacion = ratio * config.finalizacion;

  // Se considera abandono por DEBAJO DEL 60 % cantado, no por «no haber llegado
  // al final». Son cosas distintas: si el operador corta a alguien que ya llevaba
  // el 90 %, no es un abandono y no debe castigarse como tal. Lo que importa es
  // cuánto se cantó, no cómo terminó.
  const abandono = ratio < 0.6;

  // --- 2. Consistencia ------------------------------------------------------
  // Cada interrupción resta el doble. Tres o más anulan el aporte.
  const interrupciones = Math.max(0, Number(entradas.interruptionCount) || 0);
  const consistencia = Math.max(0, config.consistencia - interrupciones * 2);

  // --- 3. Audiencia ---------------------------------------------------------
  // Proporción de la sala que aplaudió. Si no hay sala, se da el valor neutro:
  // no se puede castigar a alguien por cantar cuando no había nadie mirando.
  const oyentes = Math.max(0, Number(entradas.audienceSize) || 0);
  const aplausos = Math.max(0, Number(entradas.audienceCheers) || 0);
  const proporcionAplauso = oyentes > 0 ? limitar(aplausos / oyentes, 0, 1) : null;
  const audiencia =
    proporcionAplauso === null ? config.audiencia / 2 : proporcionAplauso * config.audiencia;

  // --- 4. Racha -------------------------------------------------------------
  // Cantar varias veces suma un poco. Es participación, no calidad: por eso su
  // peso es el más bajo de todos.
  const previas = Array.isArray(entradas.priorScores) ? entradas.priorScores.length : 0;
  const racha = Math.min(config.racha, Math.floor(previas / 2));

  // --- 4b. Actividad vocal (solo si hay micrófono) --------------------------
  // Mide cuánto cantó de verdad, con qué energía sostenida y con qué continuidad.
  // NO mide afinación: eso necesitaría una referencia musical que no tenemos y que
  // no se puede extraer de YouTube.
  //
  // Con `config.microfono` en 0 —el valor por defecto— este bloque no aporta nada.
  const voz =
    entradas.voiceQuality === undefined || entradas.voiceQuality === null
      ? null
      : limitar(Number(entradas.voiceQuality) || 0, 0, 1);
  // Centrado: por encima del neutro suma, por debajo resta.
  const aporteMicrofono =
    voz === null ? 0 : (voz - config.microfonoNeutro) * config.microfono;

  // --- 5. Variación sembrada ------------------------------------------------
  // El ingrediente, no el plato. Sesgada hacia arriba y con forma de campana:
  // concentra los resultados y deja las colas finas.
  const variacion = desviacionCentral(azar) * config.variacionEscala;

  // --- 6. Bonus poco frecuente ---------------------------------------------
  const raro = azar() < config.bonusRaro.probabilidad ? azar() * config.bonusRaro.maximo : 0;

  // --- Distribución recreativa calibrable por rangos ------------------------
  // Las señales desplazan ligeramente los pesos sin destruir la distribución base.
  // Los abandonos mantienen la escala histórica y no entran en las estadísticas.
  const anteriores = Array.isArray(entradas.priorScores) ? entradas.priorScores : [];
  const revancha = !abandono && anteriores.length > 0 && anteriores.at(-1) >= 55 && anteriores.at(-1) <= 64;
  const rachaAlta = anteriores.length >= 3 && anteriores.slice(-3).every((n) => n >= 90);
  const perfil = revancha ? 'revancha' : config.moderarRacha !== false && rachaAlta ? 'moderacion' : 'normal';
  const basePesos = (config.perfiles ?? CONFIG_POR_DEFECTO.perfiles)[perfil];
  const indice = limitar(
    (ratio * 0.48) + (consistencia / Math.max(1, config.consistencia)) * 0.2 +
    (proporcionAplauso ?? 0.5) * 0.25 + (previas > 0 ? 0.07 : 0.035),
    0, 1,
  );
  // Ajuste pequeño y simétrico: señales neutras reproducen las cuotas objetivo.
  const ajuste = (indice - 0.5) * 0.12;
  const pesos = basePesos.map((peso, i) => peso * (1 + (i === 3 ? ajuste : i === 0 ? -ajuste : 0)));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  let boleto = azar() * sumaPesos;
  let indiceRango = 3;
  for (let i = 0; i < pesos.length; i += 1) {
    boleto -= pesos[i];
    if (boleto < 0) { indiceRango = i; break; }
  }
  const rangos = [[55, 64], [65, 77], [78, 89], [90, 100]];
  const [minRango, maxRango] = rangos[indiceRango];
  // Selección ponderada dentro de cada rango; el 100 ronda el 1 % global
  // (2 % condicionado al rango excelente en perfil normal).
  const pesosNotas = [];
  for (let nota = minRango; nota <= maxRango; nota += 1) {
    let peso = 1;
    if (indiceRango === 3) {
      peso = nota === 100 ? 0.22 : nota === 99 ? 0.6 :
        nota >= 93 && nota <= 98 ? 2.1 : 0.85;
    }
    peso *= 1 + ((nota - (minRango + maxRango) / 2) / Math.max(1, maxRango - minRango)) * (indice - 0.5) * 0.6;
    pesosNotas.push(peso);
  }
  let punto = azar() * pesosNotas.reduce((a, b) => a + b, 0);
  let total = maxRango;
  for (let i = 0; i < pesosNotas.length; i += 1) {
    punto -= pesosNotas[i];
    if (punto < 0) { total = minRango + i; break; }
  }
  if (abandono) {
    const baseAbandono = config.minimo + Math.round((ratio / 0.6) * 14);
    const ruidoAbandono = Math.round((azar() - 0.4) * 8);
    total = limitar(baseAbandono + ruidoAbandono, config.minimo, 69);
  }
  // --- Subpuntajes ---------------------------------------------------------
  // Se derivan del total, no se calculan aparte. Así es imposible mostrar
  // «Ritmo 51 / Energía 99 / Total 93», que es lo que delata a un puntaje falso.
  //
  // Aun así cada uno se inclina hacia la señal que le corresponde, para que no
  // sean tres copias del mismo número. El desvío nunca pasa de ±4.
  const d = config.desvioSubpuntaje;
  const desvio = (senal, etiqueta) => {
    const centrado = senal - 0.5;
    const ruido = (azar() - 0.5) * 2;
    const bruto2 = (centrado * 6 + ruido * 2) / 4; // a [-1, 1]
    void etiqueta;
    return limitar(bruto2 * d, -d, d);
  };

  const rhythm = limitar(
    Math.round(total + desvio(consistencia / config.consistencia, 'ritmo')),
    0,
    100,
  );
  const energy = limitar(
    Math.round(total + desvio(proporcionAplauso ?? 0.5, 'energia')),
    0,
    100,
  );
  const interpretation = limitar(
    Math.round(total + desvio(ratio, 'interpretacion')),
    0,
    100,
  );

  return {
    total,
    rhythm,
    energy,
    interpretation,
    tier: bandaDe(total),
    engineVersion: VERSION_MOTOR,
    semilla: entradas.seed,
    detalle: {
      finalizacion: Number(finalizacion.toFixed(2)),
      consistencia: Number(consistencia.toFixed(2)),
      audiencia: Number(audiencia.toFixed(2)),
      racha,
      microfono: Number(aporteMicrofono.toFixed(2)),
      variacion: Number(variacion.toFixed(2)),
      raro: Number(raro.toFixed(2)),
      abandono,
      perfil: abandono ? 'abandono' : perfil,
      rango: abandono ? null : indiceRango,
      revanchaConsumida: revancha,
      revanchaPendiente: !abandono && total >= 55 && total <= 64,
      indiceRecreativo: Number(indice.toFixed(3)),
      dificultad: entradas.songDifficulty ?? 3,
      sinAudiencia: proporcionAplauso === null,
      sinMicrofono: voz === null,
    },
  };
}
