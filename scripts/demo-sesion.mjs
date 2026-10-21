/**
 * Prepara una sesión de prueba con participantes, cola y algunos resultados ya
 * cantados, para poder mirar las pantallas con datos reales.
 *
 *   pnpm demo:sesion
 *
 * Imprime el código de sala y los enlaces.
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

const { code } = await crearSesion('Karaoke en casa — prueba');

const ana = await unirseSesion(code, 'Ana');
const luis = await unirseSesion(code, 'Luis');
const eva = await unirseSesion(code, 'Eva');

/** Retrocede el inicio del turno para simular que ya lleva un rato sonando. */
async function envejecer(queueItemId, minutos) {
  const db = await getDb();
  await db
    .prepare(`update queue_items set started_at = datetime('now', ?) where id = ?`)
    .run(`-${minutos} minutes`, queueItemId);
}

/**
 * Canta una canción de principio a fin, con algún aplauso.
 * @param {{ token: string, participantId: number }} quien
 */
async function cantarCompleta(quien, videoId, minutos, aplausos = []) {
  const pedido = await pedirCancion(code, quien.token, videoId);
  if (!pedido.ok) return null;

  await iniciarTurno(code, pedido.queueItemId);
  await envejecer(pedido.queueItemId, minutos);
  for (const otro of aplausos) await aplaudir(code, otro.token, pedido.queueItemId);

  const res = await cerrarTurnoConPuntuacion(code, pedido.queueItemId, {
    posicionFinal: 190,
    terminoNatural: true,
  });
  return res.ok ? res.resultado : null;
}

const cantadas = [
  await cantarCompleta(ana, 'wt-pY4mI2rs', 4, [luis, eva]), // La Bikina, con aplausos
  await cantarCompleta(luis, 'U5TiuzOkJEY', 4, [ana]), // Rayando El Sol
  await cantarCompleta(eva, 'K4HvVN1lVAQ', 4, [ana, luis]), // Estos Celos, con aplausos
].filter(Boolean);

// Y una más en curso, para que la pantalla tenga algo que mostrar.
const enCurso = await pedirCancion(code, ana.token, 'n5FzZJ0bpug');
if (enCurso.ok) await iniciarTurno(code, enCurso.queueItemId);

const estado = await estadoSesion(code);
const ranking = await rankingDeSesion(estado.sesion.id);

console.log('');
console.log(`  Sala:          ${code}`);
console.log(`  Nombre:        ${estado.sesion.name}`);
console.log(`  Participantes: ${estado.participantes.map((p) => p.nickname).join(', ')}`);
console.log(`  Sonando:       ${estado.sonando?.song_title} — ${estado.sonando?.nickname}`);
console.log(`  En cola:       ${estado.esperando.length}`);
console.log('');
console.log('  Canciones ya cantadas:');
for (const r of cantadas) {
  console.log(`     ${String(r.total).padStart(3)}  ${r.nickname} — ${r.song_title}`);
}
console.log('');
console.log('  Ranking:');
for (const f of ranking) {
  console.log(`     ${f.posicion}. ${f.nickname.padEnd(6)} mejor ${f.mejor}  media ${f.media}`);
}
console.log('');
console.log(`  Pantalla:   http://localhost:3000/sala/${code}/tv`);
console.log(`  Invitado:   http://localhost:3000/sala/${code}`);
console.log(`  Historial:  http://localhost:3000/historial?sala=${code}`);
console.log('');
