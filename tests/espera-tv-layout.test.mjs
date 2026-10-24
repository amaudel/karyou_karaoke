import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const espera = readFileSync(new URL('../src/components/PantallaEspera.tsx', import.meta.url), 'utf8');
const anuncios = readFileSync(new URL('../src/components/AnuncioBar.tsx', import.meta.url), 'utf8');

test('TV: pantalla de espera en viewport completo sin desplazamiento', () => {
  assert.match(espera, /data-karyou-espera-tv="dos-columnas"/);
  assert.match(espera, /grid-rows-\[auto_minmax\(0,1fr\)\]/);
  assert.match(espera, /grid-cols-\[minmax\(0,1\.08fr\)_minmax\(0,1fr\)\]/);
  assert.match(espera, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(espera, /document\.documentElement\.style\.overflow = 'hidden'/);
  assert.doesNotMatch(espera, /min-h-\[calc\(100vh-8rem\)\]/);
});

test('TV: batalla de mesas a la izquierda y QR a la derecha', () => {
  const izquierda = espera.indexOf('Izquierda: batalla de mesas');
  const derecha = espera.indexOf('Derecha: QR y acceso');
  assert.ok(izquierda > 0 && derecha > izquierda);
  assert.match(espera, /rankingMesas\.slice\(0, 4\)/);
  assert.match(espera, /src=\{qr\}/);
  assert.match(espera, /Código de sala/);
  assert.match(espera, /\{enlace\}/);
});

test('TV: acciones, resultado y publicidad se conservan', () => {
  assert.match(espera, /manejarActivar/);
  assert.match(espera, /AnimacionResultadoPremium/);
  assert.match(espera, /onInicioCelebracion/);
  assert.match(espera, /ubicacion="espera" mini/);
  assert.match(anuncios, /if \(mini\)/);
});
