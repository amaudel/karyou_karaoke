/**
 * Dirección desde la que los móviles alcanzan la aplicación.
 *
 * El QR no puede apuntar a `localhost`: en el móvil, `localhost` es el propio móvil.
 * Hay que darle la IP de la red local, y esa IP cambia según dónde esté el portátil.
 * Por eso se detecta en cada arranque en vez de fijarla en un archivo.
 */
import os from 'node:os';

/** Primera IPv4 no interna. Devuelve 'localhost' si no hay ninguna. */
export function ipLocal() {
  const interfaces = os.networkInterfaces();
  for (const nombre of Object.keys(interfaces)) {
    for (const dir of interfaces[nombre] ?? []) {
      // `internal` excluye 127.0.0.1.
      if (dir.family === 'IPv4' && !dir.internal) return dir.address;
    }
  }
  return 'localhost';
}

/**
 * URL base para los enlaces que abre un móvil.
 *
 * `APP_URL` la sobrescribe, para cuando esto se despliegue de verdad y haya un
 * dominio en lugar de una IP de casa.
 */
export function urlBase() {
  const configurada = (process.env.APP_URL ?? '').trim();
  if (configurada) return configurada.replace(/\/+$/, '');

  const puerto = process.env.PORT ?? '3000';
  return `http://${ipLocal()}:${puerto}`;
}

/**
 * Enlace público de una sala, el que va dentro del QR.
 * @param {string} code
 */
export function urlSala(code) {
  return `${urlBase()}/sala/${code}`;
}
