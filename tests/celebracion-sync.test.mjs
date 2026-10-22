import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CELEBRACION_MS, TIEMPOS_CALIFICACION, MARGEN_PRIMERA_PRESENTACION_MS,
} from '../src/domain/tiempos-celebracion.mjs';

test('una sola duración exacta 8700ms para animación y protección', () => {
  assert.equal(CELEBRACION_MS, 8700);
  assert.equal(Object.values(TIEMPOS_CALIFICACION).reduce((a,b)=>a+b,0), CELEBRACION_MS);
  assert.ok(MARGEN_PRIMERA_PRESENTACION_MS > 0);
  const animacion=readFileSync('src/components/AnimacionResultado.tsx','utf8');
  assert.match(animacion,/TIEMPOS_CALIFICACION as TIEMPOS/);
  assert.match(animacion,/onInicio/);
});

test('repetir canción jamás evita la autorización del siguiente turno en la TV', () => {
  const escenario=readFileSync('src/components/KaraokeStage.tsx','utf8');
  assert.match(escenario,/if \(onCantar \|\| celebracionRestanteMs > 0\) return/);
  assert.match(escenario,/estado === 'terminado' && !onCantar && celebracionRestanteMs <= 0/);
});

test('el Play secundario de cola tampoco se muestra durante la celebración', () => {
  const sala=readFileSync('src/app/sala/[code]/page.tsx','utf8');
  assert.match(sala,/!celebracionBloqueada && !estado.sonando && indice === 0/);
});

test('la TV confirma inicio tanto con canciones en cola como sin canciones', () => {
  const tv=readFileSync('src/app/sala/[code]/tv/page.tsx','utf8');
  const total=(tv.match(/onInicioCelebracion=\{confirmarInicioCelebracionAction/g)||[]).length;
  assert.equal(total,2);
  assert.match(readFileSync('src/components/EscenarioTV.tsx','utf8'),/onInicio=\{\(\) => onInicioCelebracion/);
  assert.match(readFileSync('src/components/PantallaEspera.tsx','utf8'),/onInicio=\{\(\) => onInicioCelebracion/);
});
