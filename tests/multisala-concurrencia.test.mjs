import test from 'node:test';
import assert from 'node:assert/strict';
import { consumirLimite } from '../src/db/rate-limit.mjs';

/** Simula varios establecimientos y salas concurrentes sin tocar producción. */
test('SaaS multisala: 10 salas x 20 participantes, cupos independientes', async () => {
  const prefijo = `multi:${Date.now()}:${Math.random()}`;
  const salas = Array.from({ length: 10 }, (_, i) => `sala-${i}`);
  const solicitudes = [];
  for (const sala of salas) {
    for (let participante = 0; participante < 20; participante++) {
      // 8 solicitudes simultáneas por usuario; solo 5 deben entrar.
      for (let intento = 0; intento < 8; intento++) {
        solicitudes.push({ sala, participante, clave: `yt-import:${prefijo}:${sala}:${participante}` });
      }
    }
  }
  const respuestas = await Promise.all(solicitudes.map(x => consumirLimite(x.clave, 5, 600)));
  assert.equal(respuestas.length, 1600);
  assert.equal(respuestas.filter(Boolean).length, 1000);
  assert.equal(respuestas.filter(x => !x).length, 600);
  for (const sala of salas) {
    for (let participante = 0; participante < 20; participante++) {
      const indices = solicitudes.map((x, i) => x.sala === sala && x.participante === participante ? i : -1).filter(i => i >= 0);
      assert.equal(indices.filter(i => respuestas[i]).length, 5, `Cupo incorrecto: ${sala}/${participante}`);
    }
  }
});

test('SaaS: reportes de la misma pista tienen cupos independientes por sala', async () => {
  const prefijo = `block:${Date.now()}:${Math.random()}`;
  const claves = Array.from({ length: 12 }, (_, i) => `yt-block:${prefijo}:sala-${i}:video-compartido`);
  const respuestas = await Promise.all(claves.flatMap(clave => [consumirLimite(clave, 1, 600), consumirLimite(clave, 1, 600)]));
  assert.equal(respuestas.filter(Boolean).length, 12);
  assert.equal(respuestas.filter(x => !x).length, 12);
});
