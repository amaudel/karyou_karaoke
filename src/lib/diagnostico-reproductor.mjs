/**
 * Registro de diagnóstico del reproductor de la TV.
 *
 * Existe para una pregunta concreta: cuando una canción «se detiene y sigue sola»,
 * ¿qué pasó justo antes? ¿Un anuncio, buffering, un refresco del servidor, una orden
 * de la propia aplicación? Sin esto la respuesta se adivina.
 *
 * Solo se activa si la URL lleva `?debug=1`. Sin esa marca, `diag()` no hace nada:
 * no guarda, no escribe en consola y no toca el reproductor.
 *
 * Qué NO se registra, a propósito: tokens, cookies, códigos de sala, apodos ni
 * ningún dato de personas. Solo estados del reproductor, tiempos e identificadores
 * de video. El texto exportado se puede compartir sin revisar a mano.
 */

export const MAX_EVENTOS = 400;

/**
 * Registro en memoria con tope: al llenarse descarta lo más antiguo.
 * @param {number} [max]
 * @param {() => number} [ahora] Reloj en ms; se inyecta para poder probarlo.
 */
export function crearRegistro(max = MAX_EVENTOS, ahora = () => Date.now()) {
  /** @type {Array<Record<string, unknown>>} */
  const eventos = [];
  const inicio = ahora();
  return {
    /**
     * @param {string} tipo
     * @param {Record<string, unknown>} [datos]
     */
    registrar(tipo, datos = {}) {
      const ms = ahora();
      eventos.push({ hora: new Date(ms).toISOString(), msDesdeInicio: ms - inicio, tipo, ...datos });
      if (eventos.length > max) eventos.splice(0, eventos.length - max);
    },
    eventos: () => eventos.slice(),
    /** Una línea JSON por evento: fácil de pegar y de leer. */
    texto: () => eventos.map((e) => JSON.stringify(e)).join('\n'),
    limpiar: () => {
      eventos.length = 0;
    },
  };
}

/**
 * ¿Se atascó el video entre dos muestras? Solo si en la muestra anterior YA
 * reproducía y, en el tiempo real transcurrido, avanzó menos de la mitad. Así no se
 * marca el arranque (primera muestra tras empezar) ni las pausas o el buffering, que
 * tienen su propio estado.
 * @param {{ t: number, jugando: boolean, enMs: number } | null} previo
 * @param {{ t: number, jugando: boolean, enMs: number }} actual
 * @returns {{ avanzo: number, enSegundos: number } | null}
 */
export function detectarAtasco(previo, actual) {
  if (!previo || !previo.jugando || !actual.jugando) return null;
  const enSegundos = (actual.enMs - previo.enMs) / 1000;
  if (enSegundos <= 0) return null;
  const avanzo = actual.t - previo.t;
  if (avanzo >= enSegundos * 0.5) return null;
  return { avanzo: Number(avanzo.toFixed(2)), enSegundos: Number(enSegundos.toFixed(2)) };
}

/** @param {string} search Por ejemplo `window.location.search`. */
export function activoEnUrl(search) {
  try {
    return new URLSearchParams(search).get('debug') === '1';
  } catch {
    return false;
  }
}

/** @type {boolean | undefined} */
let activo;
/** @type {ReturnType<typeof crearRegistro> | null} */
let registro = null;

/** ¿Está activo el diagnóstico en esta pestaña? (se decide una sola vez) */
export function diagnosticoActivo() {
  if (typeof window === 'undefined') return false;
  if (activo === undefined) activo = activoEnUrl(window.location.search);
  return activo;
}

/** El registro de esta pestaña, o `null` si el diagnóstico no está activo. */
export function obtenerRegistro() {
  if (!diagnosticoActivo()) return null;
  if (!registro) {
    registro = crearRegistro();
    // Accesible desde la consola del navegador: __karyouDiag.texto()
    /** @type {any} */ (window).__karyouDiag = registro;
  }
  return registro;
}

/**
 * Anota un evento. No hace nada si el diagnóstico no está activo, y nunca lanza:
 * una falla del diagnóstico no puede afectar a la pantalla que se está diagnosticando.
 * @param {string} tipo
 * @param {Record<string, unknown>} [datos]
 */
export function diag(tipo, datos) {
  try {
    const r = obtenerRegistro();
    if (!r) return;
    r.registrar(tipo, datos);
    console.info('[karyou-diag]', tipo, datos ?? '');
  } catch {
    // El diagnóstico es best-effort.
  }
}
