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

test('Móvil: Play y Cancelar permanecen debajo del título incluso mientras Play carga', () => {
  const inicioTarjeta = pagina.indexOf('border-b border-amber-400/20 bg-gradient-to-r');
  const nombre = pagina.indexOf('{siguienteTurno.song_title || siguienteTurno.video_title}', inicioTarjeta);
  const cierreFila = pagina.indexOf('Acciones fuera de la fila del título', nombre);
  const acciones = pagina.indexOf('data-karyou-acciones-siguiente="separadas"', cierreFila);
  assert.ok(inicioTarjeta > 0 && nombre > inicioTarjeta && cierreFila > nombre && acciones > cierreFila);
  assert.match(pagina, /className="flex min-w-0 items-start gap-3"/);
  assert.match(pagina, /<form action=\{iniciarTurnoMovilAction\} className="min-w-0 w-full sm:w-auto">/);
  assert.match(pagina, /<form action=\{cancelarAction\} className="w-full sm:w-auto">/);
  assert.doesNotMatch(pagina.slice(inicioTarjeta, cierreFila), /flex shrink-0 flex-col gap-2/);
});

test('Móvil: contador singular y plural de canciones pendientes', () => {
  assert.match(pagina, /estado\.esperando\.length === 1 \? 'pendiente' : 'pendientes'/);
});
