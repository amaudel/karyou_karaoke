import test from 'node:test';
import assert from 'node:assert/strict';
import { letraArcade } from '../src/domain/scoring/rangos-visuales.mjs';

test('insignias de arcade siguen el rango recreativo guardado, sin alterar la nota', () => {
  const ejemplos = [
    [55, 'C'], [64, 'C'], [65, 'B'], [77, 'B'],
    [78, 'A'], [89, 'A'], [90, 'S'], [99, 'S'], [100, 'S'],
  ];
  for (const [nota, letra] of ejemplos) {
    assert.equal(letraArcade(nota), letra, `puntaje ${nota}`);
  }
});
