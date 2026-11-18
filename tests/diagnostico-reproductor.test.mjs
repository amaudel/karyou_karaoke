/**
 * Registro de diagnóstico del reproductor: solo se activa con ?debug=1, tiene tope
 * de memoria y nunca interfiere si falla.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  crearRegistro,
  activoEnUrl,
  detectarAtasco,
  diag,
  diagnosticoActivo,
  MAX_EVENTOS,
} from '../src/lib/diagnostico-reproductor.mjs';

test('diagnóstico: solo se activa con ?debug=1 exacto', () => {
  assert.equal(activoEnUrl('?debug=1'), true);
  assert.equal(activoEnUrl('?x=2&debug=1'), true);
  assert.equal(activoEnUrl(''), false);
  assert.equal(activoEnUrl('?debug=0'), false);
  assert.equal(activoEnUrl('?debug=true'), false);
  assert.equal(activoEnUrl('?ceremonia=clasica'), false);
});

test('diagnóstico: registra eventos con hora, tiempo relativo y datos', () => {
  let reloj = 1_000;
  const r = crearRegistro(10, () => reloj);
  r.registrar('yt_estado', { estado: 'PLAYING', t: 12.5 });
  reloj += 250;
  r.registrar('refresh', { motivo: 'timer' });

  const [a, b] = r.eventos();
  assert.equal(a.tipo, 'yt_estado');
  assert.equal(a.estado, 'PLAYING');
  assert.equal(a.msDesdeInicio, 0);
  assert.equal(b.msDesdeInicio, 250);
  assert.match(String(a.hora), /^\d{4}-\d{2}-\d{2}T/);
});

test('diagnóstico: el tope descarta lo más antiguo y conserva lo reciente', () => {
  const r = crearRegistro(3);
  for (let i = 1; i <= 5; i++) r.registrar('e', { i });
  assert.deepEqual(r.eventos().map((e) => e.i), [3, 4, 5]);
  assert.equal(MAX_EVENTOS, 400);
});

test('diagnóstico: texto() es una línea JSON por evento y limpiar() vacía', () => {
  const r = crearRegistro(10);
  r.registrar('a', { x: 1 });
  r.registrar('b', { y: 'z' });
  const lineas = r.texto().split('\n');
  assert.equal(lineas.length, 2);
  assert.equal(JSON.parse(lineas[0]).tipo, 'a');
  assert.equal(JSON.parse(lineas[1]).y, 'z');
  r.limpiar();
  assert.equal(r.eventos().length, 0);
  assert.equal(r.texto(), '');
});

test('diagnóstico: eventos() devuelve una copia que no altera el registro', () => {
  const r = crearRegistro(10);
  r.registrar('a');
  r.eventos().pop();
  assert.equal(r.eventos().length, 1);
});

test('diagnóstico: sin navegador (servidor) está inactivo y diag() no hace nada ni lanza', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(diagnosticoActivo(), false);
  assert.doesNotThrow(() => diag('yt_estado', { estado: 'PLAYING' }));
});

test('diagnóstico: detectarAtasco marca solo cuando ya reproducía y no avanzó', () => {
  const m = (t, jugando, enMs) => ({ t, jugando, enMs });
  // Avanza con normalidad: 1 s de reloj, 1 s de video.
  assert.equal(detectarAtasco(m(10, true, 0), m(11, true, 1000)), null);
  // Atasco real: 1 s de reloj, el video casi no se movió.
  assert.deepEqual(detectarAtasco(m(10, true, 0), m(10.05, true, 1000)), { avanzo: 0.05, enSegundos: 1 });
  // Arranque: la muestra anterior no reproducía todavía (el falso positivo visto en vivo).
  assert.equal(detectarAtasco(m(0, false, 0), m(0.08, true, 1000)), null);
  // Pausa o buffering ahora: tienen su propio estado, no es «atasco».
  assert.equal(detectarAtasco(m(10, true, 0), m(10, false, 1000)), null);
  // Sin muestra previa o reloj sin avanzar.
  assert.equal(detectarAtasco(null, m(5, true, 1000)), null);
  assert.equal(detectarAtasco(m(10, true, 500), m(10, true, 500)), null);
  // Avanzó algo más de la mitad: no se marca (jitter normal del muestreo).
  assert.equal(detectarAtasco(m(10, true, 0), m(10.6, true, 1000)), null);
});
