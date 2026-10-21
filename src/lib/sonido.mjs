/**
 * Sonidos de la secuencia de puntuación.
 *
 * Se generan con la Web Audio API en lugar de usar archivos de audio: no hay
 * assets que descargar, no hay licencias de música que resolver, ocupan cero
 * bytes de red y se ajustan cambiando números.
 *
 * LÍMITE IMPORTANTE: los navegadores no dejan sonar nada antes de que el usuario
 * interactúe con la página. Por eso `despertar()` se instala al montar y espera al
 * primer clic o tecla —que en la pantalla de TV es el botón Cantar—. Si el usuario
 * no toca nada, la secuencia se ve igual, solo que muda.
 */

/** @type {AudioContext | null} */
let contexto = null;
let silenciado = false;
let despierto = false;

/**
 * Activa o desactiva todos los sonidos.
 * @param {boolean} valor
 */
export function silenciar(valor) {
  silenciado = Boolean(valor);
}

export function estaSilenciado() {
  return silenciado;
}

/** @returns {AudioContext | null} */
function audio() {
  if (typeof window === 'undefined' || silenciado) return null;

  const Constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!Constructor) return null;

  if (!contexto) {
    try {
      contexto = new Constructor();
    } catch {
      return null;
    }
  }
  // Puede estar suspendido por la política de reproducción automática.
  if (contexto.state === 'suspended') contexto.resume().catch(() => {});
  return contexto;
}

/**
 * Instala la espera al primer gesto del usuario. Sin esto, el contexto de audio
 * nace suspendido y ningún sonido suena.
 */
export function despertar() {
  if (despierto || typeof window === 'undefined') return;
  despierto = true;

  const alGesto = () => {
    audio();
  };
  window.addEventListener('pointerdown', alGesto, { once: true, passive: true });
  window.addEventListener('keydown', alGesto, { once: true });
}

/**
 * Un tono con envolvente. Se ataca rápido y se apaga suave: un corte seco suena a
 * clic y resulta desagradable.
 *
 * @param {AudioContext} ac
 * @param {{ frecuencia: number, cuando: number, duracion: number, volumen?: number, tipo?: OscillatorType }} opciones
 */
function tono(ac, { frecuencia, cuando, duracion, volumen = 0.07, tipo = 'triangle' }) {
  const t0 = ac.currentTime + cuando;
  const osc = ac.createOscillator();
  const gan = ac.createGain();

  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, t0);

  gan.gain.setValueAtTime(0.0001, t0);
  gan.gain.exponentialRampToValueAtTime(volumen, t0 + 0.012);
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);

  osc.connect(gan);
  gan.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.03);
}

/** Un chasquido corto. Marca cada frase del análisis. */
export function tic() {
  const ac = audio();
  if (!ac) return;
  tono(ac, { frecuencia: 1240, cuando: 0, duracion: 0.06, volumen: 0.035, tipo: 'square' });
}

/** Dos notas ascendentes al aparecer los subpuntajes. */
export function revelar() {
  const ac = audio();
  if (!ac) return;
  tono(ac, { frecuencia: 523.25, cuando: 0, duracion: 0.16, volumen: 0.05 });
  tono(ac, { frecuencia: 698.46, cuando: 0.08, duracion: 0.2, volumen: 0.05 });
}

/**
 * El tono del resultado. Cambia con la banda: cuanto mejor la nota, más larga y
 * más alta la secuencia. Es lo que hace que un 97 se sienta distinto de un 81
 * antes incluso de leer el número.
 *
 * @param {string} banda
 */
export function resultado(banda) {
  const ac = audio();
  if (!ac) return;

  /** @type {Record<string, number[]>} */
  const escalas = {
    under: [392.0, 349.23],
    normal: [440.0, 523.25],
    good: [523.25, 659.25, 783.99],
    excellent: [523.25, 659.25, 783.99, 1046.5],
    exceptional: [523.25, 659.25, 783.99, 1046.5, 1318.51],
  };

  const notas = escalas[banda] ?? escalas.normal;
  notas.forEach((frecuencia, i) => {
    tono(ac, {
      frecuencia,
      cuando: i * 0.1,
      duracion: i === notas.length - 1 ? 0.6 : 0.32,
      volumen: 0.075,
    });
  });
}
