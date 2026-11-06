import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarColaBar, claveMesaBar } from '../src/domain/cola-bar.mjs';

const fila = (id, participant_id, table_name) => ({ id, participant_id, table_name });

test('Bar: la misma persona canta dos veces antes de pasar de mesa', () => {
  const cola = [
    fila(1, 1, 'Mesa 1'), fila(2, 1, 'Mesa 1'),
    fila(3, 2, 'Mesa 2'), fila(4, 2, 'Mesa 2'),
    fila(5, 1, 'Mesa 1'), fila(6, 2, 'Mesa 2'),
  ];
  assert.deepEqual(ordenarColaBar(cola), [1, 2, 3, 4, 5, 6]);
});

test('Bar: dos participantes de una misma mesa se alternan', () => {
  const cola = [
    fila(1, 1, 'Mesa 1'), fila(2, 1, 'Mesa 1'),
    fila(3, 3, 'Mesa 1'), fila(4, 2, 'Mesa 2'),
    fila(5, 3, 'Mesa 1'), fila(6, 2, 'Mesa 2'),
  ];
  assert.deepEqual(ordenarColaBar(cola), [1, 3, 4, 6, 2, 5]);
});

test('Bar: la actuación finalizada ya cuenta como uno de los dos turnos', () => {
  const cola = [
    fila(2, 1, 'Mesa 1'),
    fila(3, 2, 'Mesa 2'), fila(4, 2, 'Mesa 2'),
    fila(5, 1, 'Mesa 1'), fila(6, 1, 'Mesa 1'),
  ];
  assert.deepEqual(ordenarColaBar(cola, [fila(1, 1, 'Mesa 1')]), [2, 3, 4, 5, 6]);
});

test('Bar: el primer turno visible no se mueve aun si su mesa agotó el cupo', () => {
  const cola = [
    fila(5, 1, 'Mesa 1'), fila(6, 1, 'Mesa 1'),
    fila(3, 2, 'Mesa 2'), fila(4, 2, 'Mesa 2'),
  ];
  assert.deepEqual(
    ordenarColaBar(cola, [fila(2, 1, 'Mesa 1'), fila(1, 1, 'Mesa 1')]),
    [5, 3, 4, 6],
  );
});

test('Bar: Mesa 1 y mesa   1 cuentan como la misma mesa', () => {
  assert.equal(claveMesaBar(fila(1, 1, 'Mesa 1')), claveMesaBar(fila(2, 2, ' mesa   1 ')));
  assert.deepEqual(
    ordenarColaBar([fila(1, 1, 'Mesa 1'), fila(2, 2, ' mesa   1 '), fila(3, 3, 'Mesa 2')]),
    [1, 2, 3],
  );
});

test('Bar: sin mesa asignada no mezcla participantes distintos', () => {
  assert.notEqual(claveMesaBar(fila(1, 1, null)), claveMesaBar(fila(2, 2, null)));
});

test('Bar: con una única mesa, no deja canciones bloqueadas', () => {
  const cola = [1, 2, 3, 4, 5].map((id) => fila(id, 1, 'Mesa 1'));
  assert.deepEqual(ordenarColaBar(cola), [1, 2, 3, 4, 5]);
});

test('Bar: ordena todas las canciones una sola vez con tres mesas', () => {
  const cola = [
    fila(1, 1, 'M1'), fila(2, 1, 'M1'), fila(3, 1, 'M1'),
    fila(4, 2, 'M2'), fila(5, 2, 'M2'), fila(6, 2, 'M2'),
    fila(7, 3, 'M3'), fila(8, 3, 'M3'), fila(9, 3, 'M3'),
  ];
  const ids = ordenarColaBar(cola);
  assert.deepEqual(ids, [1, 2, 4, 5, 7, 8, 3, 6, 9]);
  assert.deepEqual([...ids].sort((a, b) => a - b), cola.map((c) => c.id));
});

test('Bar: cola vacía y una única canción', () => {
  assert.deepEqual(ordenarColaBar([]), []);
  assert.deepEqual(ordenarColaBar([fila(1, 1, 'M1')]), [1]);
});
