import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('móviles usan polling de 5 s y TV conserva 2 s', () => {
  const movil = leer('../src/app/sala/[code]/page.tsx');
  const tv = leer('../src/app/sala/[code]/tv/page.tsx');
  assert.match(movil, /<Refresco cada=\\{5000\\}/);
  assert.doesNotMatch(movil, /<Refresco cada=\\{2000\\}/);
  assert.match(tv, /<Refresco cada=\\{2000\\}/);
});

test('polling cancela el temporizador al ocultarse y al desmontar', () => {
  const refresco = leer('../src/components/Refresco.tsx');
  assert.match(refresco, /document\.addEventListener\('visibilitychange', reanudar\)/);
  assert.match(refresco, /if \(!permitido\(\)\) \{\s*if \(timer !== undefined\) clearTimeout\(timer\)/);
  assert.match(refresco, /document\.removeEventListener\('visibilitychange', reanudar\)/);
  assert.match(refresco, /window\.addEventListener\('online', reanudar\)/);
});
