import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/app/sala/actions.ts', import.meta.url)), 'utf8');

function bodyOf(name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `Falta ${name}`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

for (const [name, mutation] of [
  ['pedirPorUrlAction', 'await importarPistaPorUrl(url)'],
  ['toggleFavoritoSalaAction', 'await toggleFavorito(videoId)'],
]) {
  test(`${name} verifica identidad antes de modificar el catálogo global`, () => {
    const body = bodyOf(name);
    const identity = body.indexOf('await identificar(code, token)');
    const guard = body.indexOf('if (!participante)');
    const mutationIndex = body.indexOf(mutation);
    assert.ok(identity >= 0 && guard > identity && mutationIndex > guard,
      'La identidad y el rechazo deben preceder a cualquier escritura global');
    assert.match(body.slice(guard, mutationIndex), /NO_IDENTIFICADO/);
  });
}
