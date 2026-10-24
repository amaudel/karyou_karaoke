import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datosPremium,CEREMONIA_PREMIUM_MS,FASES_PREMIUM,rangoPremium} from '../src/domain/ceremonia-premium.mjs';

function resultado(total,tier='exceptional'){
  return {id:1,nickname:'Ana',song_title:'Mi canción',artist:'Artista',
    total,rhythm:96,energy:99,interpretation:98,tier};
}
test('100 exactos dispara el modo épico; 99 y 94 no',()=>{
  const cien=datosPremium(resultado(100));
  assert.equal(cien.esPerfecto,true);
  assert.equal(cien.rango,'S','el rango oficial se conserva');
  assert.equal(cien.selloEspecial,'100 PERFECTO');
  assert.equal(cien.titular,'LEYENDA DEL KARAOKE');
  assert.equal(cien.remate,'UNA ACTUACIÓN PARA RECORDAR');
  assert.equal(cien.color,'#FFD76A');
  assert.equal(datosPremium(resultado(99)).esPerfecto,false);
  assert.equal(datosPremium(resultado(99)).selloEspecial,null);
  assert.equal(datosPremium(resultado(94,'excellent')).esPerfecto,false);
});
test('modo épico no altera métricas, no presume afinación y conserva los 8,7 segundos',()=>{
  const cien=datosPremium(resultado(100));
  assert.deepEqual([cien.ritmo,cien.energia,cien.interpretacion],[96,99,98]);
  assert.equal(rangoPremium(100),'S');
  assert.equal(CEREMONIA_PREMIUM_MS,8700);
  assert.equal(FASES_PREMIUM.puntuacion,5500);
  assert.equal(FASES_PREMIUM.fin,8700);
  assert.equal(cien.patrocinador,null);
});
test('solo conserva patrocinio en ubicación resultado y no modifica la puntuación',()=>{
  const dato=resultado(100);
  const sponsor={placement:'resultado',bar_name:'BAR',title:'PROMO',image_url:'https://example.com/imagen.png'};
  const con=datosPremium(dato,sponsor,true);
  assert.equal(con.total,100);
  assert.equal(con.patrocinador.nombre,'BAR');
  assert.equal(con.siguienteEnCola,true);
  assert.equal(datosPremium(dato,{...sponsor,placement:'espera'}).patrocinador,null);
  assert.equal(dato.total,100);
});
test('animación usa el disparador sonoro especial sólo cuando total es 100',()=>{
  const visual=readFileSync('src/components/AnimacionResultadoPremium.tsx','utf8');
  const sound=readFileSync('src/lib/sonido.mjs','utf8');
  assert.match(visual,/fase===3 && resultado\.total===100/);
  assert.match(visual,/esPerfecto\?\(reducirMovimiento\?38:100\):44/);
  assert.match(visual,/prefers-reduced-motion/);
  assert.match(sound,/export function perfecto\(\)/);
  assert.match(visual,/onFin\(\)/);
});
