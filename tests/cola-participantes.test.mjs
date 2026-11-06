import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../src/app/sala/[code]/page.tsx', import.meta.url), 'utf8');

test('Móvil: pendientes siempre sobre Cantando ahora', () => {
  const cola = pagina.indexOf('data-karyou-cola-participantes="pendientes"');
  const sonando = pagina.indexOf('sonando ahora');
  const buscar = pagina.indexOf('FormularioBuscar consultaInicial');
  assert.ok(cola > 0 && sonando > cola && buscar > sonando);
  assert.match(pagina, /\{consulta && \(/);
});

test('Móvil: siguiente canción y mesa salen de la cola pendiente real', () => {
  assert.match(pagina, /const siguienteTurno = estado\.esperando\[0\]/);
  assert.match(pagina, /Siguiente en cantar/);
  assert.match(pagina, /siguienteTurno\.song_title/);
  assert.match(pagina, /siguienteTurno\.nickname/);
  assert.match(pagina, /siguienteTurno\.mesa/);
  assert.match(pagina, /estado\.esperando\.slice\(1\)\.map/);
  assert.doesNotMatch(pagina, /estado\.cola\.map/);
});

test('Móvil: mantiene cancelar turno propio y estado sin pendientes', () => {
  assert.match(pagina, /siguienteEsMio && \(/);
  assert.match(pagina, /mia && \(/);
  assert.match(pagina, /action=\{cancelarAction\}/);
  assert.match(pagina, /Todavía no hay canciones pendientes/);
});
