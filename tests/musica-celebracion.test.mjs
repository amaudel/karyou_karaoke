import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {musicaDeCelebracion, silenciar} from '../src/lib/sonido.mjs';
import {FASES_PREMIUM,CEREMONIA_PREMIUM_MS} from '../src/domain/ceremonia-premium.mjs';

test('música después del resultado: dura menos que los últimos 3,2s y respeta silencio',()=>{
  const starts=[],stops=[],freqs=[];
  const oldWindow=globalThis.window;
  class MockAudioContext {
    currentTime=10;
    state='running';
    destination={};
    createOscillator(){
      return {type:'sine',frequency:{setValueAtTime(n){freqs.push(n)}},
        connect(){},start(t){starts.push(t)},stop(t){stops.push(t)}};
    }
    createGain(){
      return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};
    }
  }
  globalThis.window={AudioContext:MockAudioContext};
  try {
    assert.equal(CEREMONIA_PREMIUM_MS-FASES_PREMIUM.puntuacion,3200);
    musicaDeCelebracion('normal',false);
    assert.ok(starts.length>=15,'mini melodía con armonía y percusión');
    assert.ok(Math.max(...stops)<=13.2,'audio finaliza antes que la ceremonia');
    const hastaNormal=starts.length;
    const maximaNormal=Math.max(...freqs);
    musicaDeCelebracion('exceptional',true);
    assert.ok(starts.length>hastaNormal,'100 tiene jingle propio');
    assert.ok(Math.max(...freqs)>maximaNormal,'100 usa un brillo más alto y memorable');
    const hastaAmbas=starts.length;
    silenciar(true);
    musicaDeCelebracion('excellent',false);
    assert.equal(starts.length,hastaAmbas,'mute deshabilita toda la celebración');
  } finally {
    silenciar(false);
    if(oldWindow===undefined)delete globalThis.window;
    else globalThis.window=oldWindow;
  }
});

test('la fanfarria se activa exactamente al revelar el número (5,5s), sin modificar Play',()=>{
  const source=readFileSync('src/components/AnimacionResultadoPremium.tsx','utf8');
  assert.match(source,/else if\(fase===3 && resultado\.total===100\)musicaDeCelebracion\(resultado\.tier,true\)/);
  assert.match(source,/else if\(fase===3\)musicaDeCelebracion\(resultado\.tier,false\)/);
  assert.match(source,/fase=elapsed>=FASES_PREMIUM\.puntuacion\?3/);
  assert.doesNotMatch(source,/iniciarTurno|loadVideoById\(|playVideo\(/);
  assert.match(readFileSync('src/app/demo/ceremonia/DemoClient.tsx','utf8'),/activarAudio\(\)/);
});
