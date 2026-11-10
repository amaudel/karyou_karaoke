import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const actions = readFileSync(fileURLToPath(new URL('../src/app/sala/actions.ts', import.meta.url)), 'utf8');
const control = readFileSync(fileURLToPath(new URL('../src/app/sala/[code]/control/page.tsx', import.meta.url)), 'utf8');
const sessions = readFileSync(fileURLToPath(new URL('../src/db/sessions.mjs', import.meta.url)), 'utf8');

function bodyOf(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `Falta ${name}`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

test('las acciones de administración exigen autorización del propietario', () => {
  for (const name of [
    'iniciarTurnoAction', 'cerrarTurnoAction', 'moverAction',
    'cambiarModoSesionAction', 'cambiarEspectaculoAction', 'terminarSesionAction',
  ]) {
    assert.match(bodyOf(actions, name), /await exigirPropietario\(code\)/);
  }
});

test('el panel exige propietario antes de mostrar datos administrativos', () => {
  assert.match(control, /await esPropietarioSala\(/);
  assert.match(control, /if \(!autorizado\) notFound\(\)/);
});

test('cierre móvil verifica identidad y pertenencia al turno sonando', () => {
  const body = bodyOf(actions, 'terminarTurnoMovilAction');
  assert.match(body, /await identificar\(code, token\)/);
  assert.match(body, /estado\.sonando\.participant_id !== quien\.participante\.id/);
});

test('inicio móvil rechaza identidad ausente y turnos fuera de orden', () => {
  const body = bodyOf(sessions, 'iniciarTurnoMovil');
  assert.match(body, /if \(!quien\)/);
  assert.match(body, /primero\.id !== Number\(queueItemId\)/);
  assert.match(body, /return \{ ok: false, error: 'TURNO_NO_CORRESPONDE' \}/);
});
