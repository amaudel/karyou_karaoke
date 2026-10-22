/**
 * Vercel Blob soporta dos esquemas de autenticación:
 * - OIDC (predeterminado al conectar nuevas tiendas desde junio de 2026):
 *   BLOB_STORE_ID + un token efímero provisto automáticamente en Vercel Functions.
 * - Token tradicional: BLOB_READ_WRITE_TOKEN.
 *
 * No leer ni transmitir estos secretos al navegador. Este predicado solo indica
 * que existe una configuración de tienda; la autenticación real la hace
 * @vercel/blob dentro de la Server Action.
 *
 * @param {{ BLOB_STORE_ID?: string, BLOB_READ_WRITE_TOKEN?: string }} env
 */
export function blobConfigurado(env = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);
}
