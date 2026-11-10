import test from 'node:test';
import assert from 'node:assert/strict';
import { consumirLimite } from '../src/db/rate-limit.mjs';
import { getDb } from '../src/db/client.mjs';
import { marcarPistaFallida } from '../src/db/queries.mjs';

test('100 solicitudes simultáneas aceptan exactamente 5 y rechazan 95', async () => {
  const clave = `test-concurrente:${Date.now()}:${Math.random()}`;
  const respuestas = await Promise.all(Array.from({ length: 100 }, () => consumirLimite(clave, 5, 600)));
  assert.equal(respuestas.filter(Boolean).length, 5);
  assert.equal(respuestas.filter(x => !x).length, 95);
  assert.equal(await consumirLimite(clave, 5, 600), false);
});

test('distintas claves tienen cupos independientes', async () => {
  const prefijo = `test-aislamiento:${Date.now()}:${Math.random()}`;
  const resultados = await Promise.all([
    consumirLimite(prefijo + ':a', 1, 600),
    consumirLimite(prefijo + ':b', 1, 600),
  ]);
  assert.deepEqual(resultados, [true, true]);
});

test('errores 101/150 solo registran evidencia, sin ocultar pista válida', async () => {
  const db = await getDb();
  const existente = await db.prepare('select video_id, playback_blocked, fail_count from pool_items where playback_blocked = 0 limit 1').get();
  if (!existente) return; // El dataset de pruebas puede no contener canciones.
  const resultado = await marcarPistaFallida(existente.video_id, 101);
  const despues = await db.prepare('select playback_blocked, fail_count from pool_items where video_id = ?').get(existente.video_id);
  assert.equal(resultado.ocultada, false);
  assert.equal(Number(despues.playback_blocked), 0);
  assert.equal(Number(despues.fail_count), Number(existente.fail_count) + 1);
});
