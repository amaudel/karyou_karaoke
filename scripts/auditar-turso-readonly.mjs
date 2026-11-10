/**
 * Inventario de solo lectura para preparar un respaldo de Turso.
 * Uso: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/auditar-turso-readonly.mjs
 * No muestra secretos, filas de usuarios ni contenido de las tablas.
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error('Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN.');
  process.exitCode = 1;
} else {
  const client = createClient({ url, authToken });
  try {
    const tablas = await client.execute(
      "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name",
    );
    const inventario = [];
    for (const row of tablas.rows) {
      const name = String(row.name);
      // Solo identificadores que provienen de sqlite_master y sin caracteres inesperados.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Nombre de tabla inesperado.');
      const result = await client.execute(`select count(*) as total from "${name}"`);
      inventario.push({ tabla: name, registros: Number(result.rows[0]?.total ?? 0) });
    }
    const check = await client.execute('pragma quick_check');
    const integridad = check.rows.map(r => String(Object.values(r)[0])).join(', ');
    console.log(JSON.stringify({
      fecha: new Date().toISOString(),
      tablas: inventario,
      integridad,
      nota: 'Inventario de solo lectura. NO es una copia de seguridad ni una prueba de restauración.',
    }, null, 2));
    if (integridad !== 'ok') process.exitCode = 2;
  } catch (error) {
    console.error('Falló la auditoría de solo lectura:', error?.message ?? String(error));
    process.exitCode = 1;
  } finally {
    client.close();
  }
}
