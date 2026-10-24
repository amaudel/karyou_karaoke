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

/**
 * Fanfarria original para el único resultado exactamente igual a 100.
 * No utiliza recursos externos, no toca el puntaje y respeta el mute global.
 * Se dispara una vez al empezar la fase final de la celebración.
 */
export function perfecto() {
  const ac = audio();
  if (!ac) return;
  const fanfarria = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  fanfarria.forEach((frecuencia, i) => {
    tono(ac, {
      frecuencia,
      cuando: i < 3 ? i * 0.095 : 0.31 + (i - 3) * 0.09,
      duracion: i === fanfarria.length - 1 ? 0.92 : 0.36,
      volumen: i === fanfarria.length - 1 ? 0.069 : 0.047,
      tipo: i === fanfarria.length - 1 ? 'sine' : 'triangle',
    });
  });
  // Shimmer agudo al coronar: un solo brillo, sin ráfagas estroboscópicas.
  tono(ac, { frecuencia: 2093, cuando: 0.66, duracion: 0.75, volumen: 0.026, tipo: 'sine' });
}


/**
 * Música ORIGINAL de cierre: un pequeño jingle festivo de 2,9 s que comienza
 * cuando la puntuación ya quedó visible, no durante el conteo.
 *
 * No necesita MP3/CDN, se sintetiza con Web Audio, respeta el silencio global y
 * acaba antes de los 3200 ms finales. El resultado de 100 usa una melodía propia.
 * @param {string} banda - Banda real calculada por el servidor.
 * @param {boolean} [esPerfecto=false] - Solo true con total === 100.
 */
export function musicaDeCelebracion(banda, esPerfecto = false) {
  const ac = audio();
  if (!ac) return;

  // Dos frases ascendentes y una cadencia resuelta: una melodía instrumental
  // breve y original, sin usar canciones ajenas ni inferir afinación vocal.
  const normal = [
    [523.25, 0.00, .17], [659.25, .23, .17], [783.99, .46, .20],
    [880.00, .76, .17], [783.99, .99, .20], [1046.50, 1.30, .30],
    [1318.51, 1.75, .20], [1174.66, 2.06, .20], [1046.50, 2.38, .45],
  ];
  const legendaria = [
    [392.00, 0.00, .12], [523.25, .16, .14], [659.25, .33, .15],
    [783.99, .56, .19], [1046.50, .81, .18], [1318.51, 1.10, .18],
    [1567.98, 1.42, .22], [1318.51, 1.78, .20], [1567.98, 2.08, .18],
    [2093.00, 2.34, .48],
  ];
  const fuerte = banda === 'excellent' || banda === 'exceptional';
  const notas = esPerfecto ? legendaria : normal;
  const volumen = esPerfecto ? .044 : fuerte ? .037 : .032;
  notas.forEach(([frecuencia, cuando, duracion], i) => {
    tono(ac, {
      frecuencia, cuando, duracion,
      volumen: volumen * (i === notas.length - 1 ? 1.14 : 1),
      tipo: i === notas.length - 1 ? 'sine' : 'triangle',
    });
  });

  // Base armónica discreta tipo celebración arcade: no tapa la voz del bar.
  const acordes = esPerfecto
    ? [[261.63, 0], [329.63, 0], [392.00, 0],
       [349.23, 1.32], [440.00, 1.32], [523.25, 1.32],
       [523.25, 2.35], [659.25, 2.35], [783.99, 2.35]]
    : [[261.63, 0], [329.63, 0], [392.00, 0],
       [349.23, 1.28], [440.00, 1.28], [523.25, 1.28],
       [261.63, 2.37], [329.63, 2.37], [392.00, 2.37]];
  acordes.forEach(([frecuencia, cuando]) => {
    tono(ac, {
      frecuencia, cuando,
      duracion: cuando > 2 ? .43 : .38,
      volumen: esPerfecto ? .011 : .007,
      tipo: 'sine',
    });
  });

  // Percusión sintética suave en pulsos: acento de festejo, sin pistas externas.
  for (const cuando of (esPerfecto
    ? [0, .32, .64, .96, 1.28, 1.60, 1.92, 2.24, 2.56]
    : [0, .46, .91, 1.37, 1.82, 2.28])) {
    tono(ac, {
      frecuencia: esPerfecto ? 118 : 105,
      cuando, duracion: .075,
      volumen: esPerfecto ? .023 : .015,
      tipo: 'sine',
    });
    tono(ac, {
      frecuencia: esPerfecto ? 1650 : 1380,
      cuando: cuando + .095, duracion: .042,
      volumen: esPerfecto ? .008 : .005,
      tipo: 'square',
    });
  }

  // Un brillo final, sin reproducir audio después de que acaba la ceremonia.
  tono(ac, {
    frecuencia: esPerfecto ? 2637.02 : 1567.98,
    cuando: 2.62, duracion: .23,
    volumen: esPerfecto ? .019 : .011,
    tipo: 'sine',
  });
}

/** Habilitar audio en el gesto real del usuario (útil en demo y Smart TV).
 * No anula el botón global de silenciar.
 */
export function activarAudio() {
  audio();
}
