import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const actions = read('../src/app/actions.ts');
const sala = read('../src/app/sala/actions.ts');
const stage = read('../src/components/KaraokeStage.tsx');
const escenario = read('../src/components/EscenarioTV.tsx');
const limiter = read('../src/db/rate-limit.mjs');

test('reportes de bloqueo requieren TV o propietario y límite por pista', () => {
  assert.match(actions, /verifyTvToken\(sesion\.id/);
  assert.match(actions, /esPropietarioSala\(/);
  assert.match(actions, /consumirLimite\(`yt-block:/);
  assert.match(actions, /codigo !== 101 && codigo !== 150/);
  assert.match(stage, /reportarPistaBloqueada\(code, idActual, evento\.data\)/);
  assert.match(escenario, /<KaraokeStage\s+code=\{code\}/);
});

test('las importaciones móviles y del catálogo tienen límites', () => {
  assert.match(sala, /consumirLimite\(`yt-import:/);
  assert.match(actions, /limitarCatalogo\('importar', 10\)/);
  assert.match(actions, /limitarCatalogo\('agregar', 30\)/);
  assert.match(actions, /limitarCatalogo\('favoritos', 60\)/);
});

test('el límite compartido usa escritura condicional atómica en DB', () => {
  assert.match(limiter, /on conflict\(key\) do update/);
  assert.match(limiter, /where action_rate_limits\.window_start != excluded\.window_start/);
  assert.match(limiter, /action_rate_limits\.hits < \?/);
});
