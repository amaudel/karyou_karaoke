import test from 'node:test';
import assert from 'node:assert/strict';
import { intervaloSondeo, debeSondear } from '../src/domain/polling.mjs';

test('intervalos de TV y móvil conservan límites y desfase', () => {
  assert.equal(intervaloSondeo(2000, 0), 2000);
  assert.equal(intervaloSondeo(2000, 1), 2400);
  assert.equal(intervaloSondeo(5000, 0), 5000);
  assert.equal(intervaloSondeo(5000, 1), 6000);
  assert.equal(intervaloSondeo(100, 0), 2000);
  assert.equal(intervaloSondeo(999999, 0), 60000);
});

test('pestañas ocultas o desconectadas no generan sondeo', () => {
  assert.equal(debeSondear(true, true), true);
  assert.equal(debeSondear(false, true), false);
  assert.equal(debeSondear(true, false), false);
  assert.equal(debeSondear(false, false), false);
});

test('modelo multisala: 10 salas x 100 móviles reduce la frecuencia activa al menos 60 %', () => {
  const salas = 10;
  const participantesPorSala = 100;
  const clientes = salas * participantesPorSala;
  const antesPorMinuto = clientes * (60000 / 2000);
  const despuesMaximoPorMinuto = clientes * (60000 / intervaloSondeo(5000, 0));
  assert.equal(antesPorMinuto, 30000);
  assert.equal(despuesMaximoPorMinuto, 12000);
  assert.ok((antesPorMinuto - despuesMaximoPorMinuto) / antesPorMinuto >= 0.6);
  // Un participante oculto deja de generar refrescos periódicos.
  assert.equal(debeSondear(false, true) ? despuesMaximoPorMinuto : 0, 0);
});
