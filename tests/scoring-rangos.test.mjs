import test from 'node:test';
import assert from 'node:assert/strict';
import { puntuar, VERSION_MOTOR } from '../src/domain/scoring/motor.mjs';

const entrada = (seed, priorScores = []) => ({
  completionRatio: 1, interruptionCount: 0, endedNaturally: true,
  audienceCheers: 2, audienceSize: 4, priorScores, songDifficulty: 3, seed,
});

test('motor v2: reproducible y en rangos validos', () => {
  assert.equal(VERSION_MOTOR, 2);
  for (let i = 0; i < 1000; i++) {
    const a = puntuar(entrada('semilla-' + i));
    assert.deepEqual(a, puntuar(entrada('semilla-' + i)));
    assert.ok(a.total >= 55 && a.total <= 100);
    assert.ok(a.rhythm >= 0 && a.rhythm <= 100);
  }
});

test('revancha solo por historial individual', () => {
  const a = puntuar(entrada('rev-1', [59]));
  assert.equal(a.detalle.perfil, 'revancha');
  const b = puntuar(entrada('rev-1', [82]));
  assert.equal(b.detalle.perfil, 'normal');
  assert.equal(a.detalle.revanchaConsumida, true);
});

test('moderacion tras tres excelentes y prioridad de revancha', () => {
  assert.equal(puntuar(entrada('r', [95, 94, 92])).detalle.perfil, 'moderacion');
  assert.equal(puntuar(entrada('r', [95, 94, 59])).detalle.perfil, 'revancha');
});

test('abandono no consume revancha', () => {
  const a = puntuar({ ...entrada('abandono', [59]), completionRatio: 0.2, endedNaturally: false });
  assert.equal(a.detalle.perfil, 'abandono');
  assert.equal(a.detalle.revanchaConsumida, false);
});

test('distribucion por perfiles aproximada con 100000 semillas', () => {
  const perfiles = [
    { previo: [], esperado: [25, 10, 15, 50] },
    { previo: [59], esperado: [10, 10, 15, 65] },
    { previo: [91, 92, 93], esperado: [30, 15, 20, 35] },
  ];
  for (const { previo, esperado } of perfiles) {
    const conteos = [0, 0, 0, 0];
    for (let i = 0; i < 100000; i++) {
      const n = puntuar(entrada('calibracion-' + i, previo)).total;
      conteos[n <= 64 ? 0 : n <= 77 ? 1 : n <= 89 ? 2 : 3]++;
    }
    for (let j = 0; j < 4; j++) {
      assert.ok(Math.abs(conteos[j] / 1000 - esperado[j]) < 3,
        'perfil ' + esperado.join('/') + ' rango ' + j + ': ' + conteos[j] / 1000);
    }
  }
});

test('las etiquetas visuales corresponden a los cuatro rangos v2', () => {
  const etiqueta = (n) => n <= 64 ? 'under' : n <= 77 ? 'normal' : n <= 89 ? 'good' : n <= 98 ? 'excellent' : 'exceptional';
  const vistos = new Set();
  for (let i = 0; i < 12000; i++) {
    const resultado = puntuar(entrada('tier-v2-' + i));
    assert.equal(resultado.tier, etiqueta(resultado.total), 'nota ' + resultado.total);
    vistos.add(resultado.total);
  }
  for (const nota of [55, 64, 65, 69, 70, 77, 78, 79, 89, 90, 98, 99, 100]) {
    assert.ok(vistos.has(nota), 'no se observo nota ' + nota);
  }
});

test('revancha no modifica la identidad de la mesa ni la cola', () => {
  const resultado = puntuar(entrada('mesa4-carlos', [59]));
  assert.equal(resultado.detalle.perfil, 'revancha');
  const otraPersonaMismaMesa = puntuar(entrada('mesa4-andrea', [85]));
  assert.equal(otraPersonaMismaMesa.detalle.perfil, 'normal');
});
