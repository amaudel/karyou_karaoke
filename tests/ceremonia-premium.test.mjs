import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CELEBRACION_MS} from '../src/domain/tiempos-celebracion.mjs';
import {
  CEREMONIA_PREMIUM_MS,CEREMONIA_PREMIUM_CUADROS,FASES_PREMIUM,
  rangoPremium,datosPremium,
} from '../src/domain/ceremonia-premium.mjs';

test('Remotion premium: 261 cuadros a 30fps, exactamente el bloqueo existente',()=>{
  assert.equal(CEREMONIA_PREMIUM_MS,CELEBRACION_MS);
  assert.equal(CEREMONIA_PREMIUM_MS,8700);
  assert.equal(CEREMONIA_PREMIUM_CUADROS,261);
  assert.deepEqual(FASES_PREMIUM,{intriga:1400,metricas:3200,puntuacion:5500,fin:8700});
});

test('rangos recreativos idénticos al motor Karyou, en sus fronteras',()=>{
  for(const [p,r] of [[0,'C'],[64,'C'],[65,'B'],[77,'B'],[78,'A'],[89,'A'],[90,'S'],[100,'S']]){
    assert.equal(rangoPremium(p),r);
  }
});

test('usa el resultado confirmado, no inventa afinación ni reescribe métricas',()=>{
  const score={id:15,nickname:'Cantante Real',song_title:'La canción',artist:'Artista',
    mesa:'Mesa 3',total:94,rhythm:91,energy:96,interpretation:93,tier:'excellent'};
  const datos=datosPremium(score);
  assert.equal(datos.total,94);
  assert.deepEqual([datos.ritmo,datos.energia,datos.interpretacion],[91,96,93]);
  assert.equal(datos.rango,'S');
  assert.equal(datos.titular,'ESTRELLA DE LA NOCHE');
  assert.equal(datos.patrocinador,null);
  assert.equal(datos.siguienteEnCola,false);
  assert.equal('afinacion' in datos,false);
  assert.deepEqual(score,{id:15,nickname:'Cantante Real',song_title:'La canción',artist:'Artista',
    mesa:'Mesa 3',total:94,rhythm:91,energy:96,interpretation:93,tier:'excellent'});
});

test('anuncio elegible respeta imagen original completa, otros placements excluidos',()=>{
  const resultado={id:20,nickname:'Ana',song_title:'Noche',total:100,rhythm:99,
    energy:98,interpretation:100,tier:'exceptional'};
  const ad={placement:'resultado',bar_name:'Bar Original',title:'Promo subida por el dueño',
    image_url:'https://ejemplo.test/imagen-publicidad.png'};
  const info=datosPremium(resultado,ad,true);
  assert.equal(info.patrocinador.imagen,ad.image_url);
  assert.equal(info.patrocinador.nombre,ad.bar_name);
  assert.equal(info.siguienteEnCola,true);
  assert.equal(datosPremium(resultado,{...ad,placement:'espera'}).patrocinador,null);
});

test('selector premium limitado a vista previa; los demás usan componente estable',()=>{
  const tv=readFileSync('src/app/sala/[code]/tv/page.tsx','utf8');
  const escenario=readFileSync('src/components/EscenarioTV.tsx','utf8');
  const espera=readFileSync('src/components/PantallaEspera.tsx','utf8');
  assert.match(tv,/process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(tv,/query\?\.ceremonia === 'premium'/);
  assert.match(escenario,/usarCeremoniaPremium \?/);
  assert.match(escenario,/: <AnimacionResultado/);
  assert.match(espera,/usarCeremoniaPremium \? <AnimacionResultadoPremium/);
  assert.match(espera,/: <AnimacionResultado/);
  const demo=readFileSync('src/app/demo/ceremonia/page.tsx','utf8');
  assert.match(demo,/VERCEL_ENV==='production'/);
});

test('composición premium no inicia canciones ni modifica puntaje o base de datos',()=>{
  const animacion=readFileSync('src/components/AnimacionResultadoPremium.tsx','utf8');
  assert.doesNotMatch(animacion,/iniciarTurno|empezarTurnoAction|playVideo\(|loadVideoById\(/);
  assert.match(animacion,/sessionStorage/);
  assert.match(animacion,/objectFit:'contain'/);
  assert.match(animacion,/callbacks\.current\.onFin\(\)/);
});
