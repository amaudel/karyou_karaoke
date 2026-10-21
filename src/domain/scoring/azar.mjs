/**
 * Generador pseudoaleatorio con semilla.
 *
 * Existe porque `Math.random()` no sirve aquí por dos motivos:
 *
 *   1. No es reproducible. Dos ejecuciones con las mismas entradas darían
 *      resultados distintos, y entonces no se puede probar, ni auditar, ni
 *      reproducir un resultado que alguien reclame.
 *   2. No permite separar la variación real de la artificial. Con un generador
 *      sembrado, el calibrador puede fijar la semilla y medir cuánto del
 *      resultado viene de las señales y cuánto del azar. Ese número es el que
 *      decide si hace falta el micrófono.
 *
 * Este archivo es el ÚNICO sitio del proyecto donde se genera azar. `Math.random()`
 * está prohibido en el resto por la regla de lint de `CLAUDE.md` §20.
 */

/**
 * mulberry32: 32 bits de estado, rápido y de calidad suficiente para un juego.
 * No sirve para criptografía y no se usa para nada que la necesite.
 *
 * @param {number} semilla entero de 32 bits sin signo
 * @returns {() => number} función que devuelve un número en [0, 1)
 */
export function crearAzar(semilla) {
  let estado = semilla >>> 0;
  return function azar() {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convierte un texto en una semilla de 32 bits (FNV-1a).
 *
 * Se hace aquí y no con `node:crypto` a propósito: el dominio tiene que poder
 * ejecutarse sin Node, sin red y sin base de datos, para poder probarse y
 * calibrarse en milisegundos.
 *
 * @param {string} texto
 * @returns {number}
 */
export function semillaDesde(texto) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Desviación con forma de campana, aproximadamente normal.
 *
 * Suma de tres uniformes (distribución de Irwin-Hall). Se usa en lugar de un
 * uniforme simple porque así el resultado se concentra en el centro y deja colas
 * finas: es lo que hace que un 100 sea raro, en vez de tener la misma
 * probabilidad que un 85.
 *
 * Rango [-3, 3], desviación típica 1.
 *
 * @param {() => number} azar
 * @returns {number}
 */
export function desviacionCentral(azar) {
  return (azar() + azar() + azar() - 1.5) / 0.5;
}
