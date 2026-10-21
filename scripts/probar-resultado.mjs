/**
 * Prepara una sala cuyo último turno acaba de terminar, para poder mirar en el
 * navegador la animación del resultado DENTRO del recuadro del reproductor.
 *
 *   pnpm probar:resultado
 *
 * La diferencia con `demo-sesion.mjs` es el estado final: allí queda una canción
 * sonando, y entonces la pantalla muestra el reproductor. Aquí NO queda nada
 * sonando y el resultado es de hace unos segundos, que es la única situación en la
 * que la pantalla revela la nota. La sala tiene que estar vacía de turnos: si algo
 * está sonando, el recuadro del reproductor tiene prioridad.
 *
 * La sala queda inservible para cantar a propósito —el turno está cerrado—, así que
 * sirve para esto y poco más. Para una sala completa, `pnpm demo:sesion`.
 */
import { crearSesion, unirseSesion, pedirCancion, iniciarTurno } from '../src/db/sessions.mjs';
import { cerrarTurnoConPuntuacion, aplaudir, ultimoResultado } from '../src/db/puntuaciones.mjs';
import { getDb, closeDb } from '../src/db/client.mjs';

const { code } = await crearSesion('Resultado recién salido');

const ana = await unirseSesion(code, 'Ana');
const luis = await unirseSesion(code, 'Luis');
const eva = await unirseSesion(code, 'Eva');

const pedido = await pedirCancion(code, ana.token, 'wt-pY4mI2rs');
if (!pedido.ok) {
  console.error(`No se pudo pedir la canción: ${pedido.error}`);
  process.exit(1);
}

await iniciarTurno(code, pedido.queueItemId);

// El servidor acota el avance con su propio reloj, así que hay que retroceder el
// inicio del turno o la actuación parecería abandonada.
{
  const db = await getDb();
  await db
    .prepare(`update queue_items set started_at = datetime('now', '-4 minutes') where id = ?`)
    .run(pedido.queueItemId);
}

for (const otro of [luis, eva]) await aplaudir(code, otro.token, pedido.queueItemId);

const res = await cerrarTurnoConPuntuacion(code, pedido.queueItemId, {
  posicionFinal: 190,
  terminoNatural: true,
});
if (!res.ok) {
  console.error(`No se pudo cerrar el turno: ${res.error}`);
  process.exit(1);
}

const db = await getDb();
const sessionId = Number(
  (await db.prepare('select session_id from scores where id = ?').get(res.resultado.id)).session_id,
);
const ultimo = await ultimoResultado(sessionId);

console.log('');
console.log(`  Sala:      ${code}`);
console.log(`  Cantó:     ${res.resultado.nickname} — ${res.resultado.song_title}`);
console.log(`  Nota:      ${res.resultado.total} (${res.resultado.tier})`);
console.log(`  Antigüedad: ${ultimo?.segundos ?? '?'} s`);
console.log('');
console.log(`  Pantalla (la animación sale en el recuadro 16:9):`);
console.log(`     http://localhost:3000/sala/${code}/tv`);
console.log('');
console.log('  La animación solo se dispara si el resultado tiene menos de 45 s.');
console.log('  Si tardas más, vuelve a ejecutar el script.');
console.log('');

await closeDb();
