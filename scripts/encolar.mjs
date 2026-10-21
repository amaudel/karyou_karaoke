/**
 * Añade canciones a la cola de una sala existente.
 *
 *   node scripts/encolar.mjs BDEDW5
 *
 * Sirve para tener algo que cantar al probar la pantalla.
 */
import { getDb } from '../src/db/client.mjs';
import { pedirCancion, obtenerSesion, estadoSesion } from '../src/db/sessions.mjs';

const code = (process.argv[2] ?? '').trim().toUpperCase();
if (!code) {
  console.error('Falta el código de sala. Ejemplo:  node scripts/encolar.mjs BDEDW5');
  process.exit(1);
}

const sesion = await obtenerSesion(code);
if (!sesion) {
  console.error(`No existe la sala ${code}`);
  process.exit(1);
}

const db = await getDb();
const participantes = await db
  .prepare('select id, token, nickname from participants where session_id = ? order by joined_at')
  .all(sesion.id);

if (participantes.length === 0) {
  console.error('La sala no tiene participantes.');
  process.exit(1);
}

const canciones = ['QThJlC1W5hQ', 's6MECNPPgIo', 'z_mEpL_zl8k', 'cgczVlz2usI'];

for (let indice = 0; indice < canciones.length; indice += 1) {
  const quien = participantes[indice % participantes.length];
  const res = await pedirCancion(code, quien.token, canciones[indice]);
  console.log(res.ok ? `  + ${quien.nickname}` : `  · ${quien.nickname}: ${res.error}`);
}

const estado = await estadoSesion(code);
console.log('');
console.log(`  Sala ${code}: ${estado.total} en cola`);
if (estado.sonando) console.log(`  Sonando: ${estado.sonando.song_title} — ${estado.sonando.nickname}`);
for (const f of estado.esperando) {
  console.log(`     ${f.position}. ${f.song_title} — ${f.nickname}`);
}
