import test from 'node:test';
import assert from 'node:assert/strict';
import {
  debeRevelarResultado,
  nuevaCancionInterrumpeResultado,
} from '../src/domain/tv/revelacion-resultado.mjs';

const primero = { id: 41, queue_item_id: 101 };
const segundo = { id: 42, queue_item_id: 102 };

test('TV: al terminar una canción se revela aunque queden turnos esperando en cola', () => {
  assert.equal(debeRevelarResultado({
    resultado: primero, reciente: true, ultimoMostradoId: null, turnoSonandoId: null,
  }), true);
});

test('TV: con estado de sondeo atrasado singing del mismo turno también se revela', () => {
  assert.equal(debeRevelarResultado({
    resultado: primero, reciente: true, ultimoMostradoId: null, turnoSonandoId: 101,
  }), true);
  assert.equal(nuevaCancionInterrumpeResultado({
    resultadoActivo: primero, turnoSonandoId: 101,
  }), false);
});

test('TV: comenzar siguiente turno interrumpe puntuación previa, no por video_id', () => {
  assert.equal(nuevaCancionInterrumpeResultado({
    resultadoActivo: primero, turnoSonandoId: 102,
  }), true);
  assert.equal(debeRevelarResultado({
    resultado: primero, reciente: true, ultimoMostradoId: null, turnoSonandoId: 102,
  }), false);
});

test('TV: nuevo resultado aparece en siguiente canción incluso con cola persistente', () => {
  assert.equal(debeRevelarResultado({
    resultado: segundo, reciente: true, ultimoMostradoId: 41, turnoSonandoId: null,
  }), true);
});

test('TV: no repetir nota en sondeos ni mostrar resultados viejos', () => {
  assert.equal(debeRevelarResultado({
    resultado: primero, reciente: true, ultimoMostradoId: 41, turnoSonandoId: null,
  }), false);
  assert.equal(debeRevelarResultado({
    resultado: primero, reciente: true, ultimoMostradoId: 42, turnoSonandoId: null,
  }), false);
  assert.equal(debeRevelarResultado({
    resultado: segundo, reciente: false, ultimoMostradoId: 41, turnoSonandoId: null,
  }), false);
  assert.equal(debeRevelarResultado({
    resultado: null, reciente: true, ultimoMostradoId: null, turnoSonandoId: null,
  }), false);
});

test('TV: no interrumpir nota si próxima canción está solo preparada, no cantando', () => {
  assert.equal(nuevaCancionInterrumpeResultado({
    resultadoActivo: primero, turnoSonandoId: null,
  }), false);
});
