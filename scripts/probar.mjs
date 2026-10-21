/**
 * Prepara una sala lista para probar la pantalla de puntuación.
 *
 *   pnpm probar
 *
 * Deja: una canción sonando, cuatro en cola, tres ya puntuadas y un ranking.
 * Imprime el código y los enlaces.
 */
import {
  crearSesion,
  unirseSesion,
  pedirCancion,
  iniciarTurno,
  estadoSesion,
} from '../src/db/sessions.mjs';
import { cerrarTurnoConPuntuacion, aplaudir, rankingDeSesion } from '../src/db/puntuaciones.mjs';
import { getDb } from '../src/db/client.mjs';

const { code } = await crearSesion('Prueba de puntuación');

const ana = await unirseSesion(code, 'Ana');
const luis = await unirseSesion(code, 'Luis');
const eva = await unirseSesion(code, 'Eva');

async function envejecer(queueItemId, minutos) {
  const db = await getDb();
  await db
    .prepare(`update queue_items set started_at = datetime('now', ?) where id = ?`)
    .run(`-${minutos} minutes`, queueItemId);
}

/** Canta una canción entera, con los aplausos que se indiquen. */
async function cantar(quien, videoId, aplausos = []) {
  const pedido = await pedirCancion(code, quien.token, videoId);
  if (!pedido.ok) return null;

  await iniciarTurno(code, pedido.queueItemId);
  await envejecer(pedido.queueItemId, 4);
  for (const otro of aplausos) await aplaudir(code, otro.token, pedido.queueItemId);

  const res = await cerrarTurnoConPuntuacion(code, pedido.queueItemId, {
    posicionFinal: 190,
    terminoNatural: true,
  });
  return res.ok ? res.resultado : null;
}

const cantadas = [
  await cantar(ana, 'wt-pY4mI2rs', [luis, eva]),
  await cantar(luis, 'U5TiuzOkJEY', [ana]),
  await cantar(eva, 'K4HvVN1lVAQ', [ana, luis]),
].filter(Boolean);

// Cuatro en cola y la primera ya en pantalla, para poder pulsar Cantar.
const cola = ['n5FzZJ0bpug', 'QThJlC1W5hQ', 's6MECNPPgIo', 'z_mEpL_zl8k'];
const duenos = [ana, luis, eva, ana];
for (let i = 0; i < cola.length; i += 1) {
  await pedirCancion(code, duenos[i].token, cola[i]);
}

const estado = await estadoSesion(code);
if (estado.esperando[0]) await iniciarTurno(code, estado.esperando[0].id);

const final = await estadoSesion(code);
const ranking = await rankingDeSesion(final.sesion.id);

console.log('');
console.log(`  Sala:  ${code}`);
console.log('');
console.log('  Ya cantadas:');
for (const r of cantadas) console.log(`     ${String(r.total).padStart(3)}  ${r.nickname} — ${r.song_title}`);
console.log('');
console.log('  Ranking:');
for (const f of ranking) console.log(`     ${f.posicion}. ${f.nickname.padEnd(6)} ${f.mejor}`);
console.log('');
console.log(`  AHORA MISMO: ${final.sonando?.song_title} — ${final.sonando?.nickname}`);
console.log(`  En cola:     ${final.esperando.length}`);
console.log('');
console.log(`  PANTALLA:   http://localhost:3000/sala/${code}/tv`);
console.log(`  INVITADO:   http://localhost:3000/sala/${code}   (ábrelo en incógnito)`);
console.log(`  HISTORIAL:  http://localhost:3000/historial?sala=${code}`);
console.log('');
