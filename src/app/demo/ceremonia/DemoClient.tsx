'use client';
import {useState} from 'react';
import AnimacionResultadoPremium from '@/components/AnimacionResultadoPremium';
import type {ResultadoVista} from '@/app/sala/tipos';
import type {PromocionBar} from '@/components/AnuncioBar';

const ejemplos:[number,string,string][]=[
  [94,'excellent','Rango S · celebración premium'],
  [73,'normal','Rango B · celebración normal'],
  [99,'exceptional','99 · sin modo exclusivo'],
  [100,'exceptional','👑 100 PERFECTO · modo épico'],
];
export default function DemoClient(){
  const [indice,setIndice]=useState(0);
  const [version,setVersion]=useState(1);
  const [anuncio,setAnuncio]=useState(true);
  const [enCurso,setEnCurso]=useState(true);
  const [nota,banda]=ejemplos[indice] ?? ejemplos[0]!;
  const resultado:ResultadoVista={id:version,participant_id:1,queue_item_id:1,
    nickname:'ALEX',song_title:'La música de tu vida',artist:'Karyou Demo',mesa:'Mesa 4',
    total:nota,rhythm:Math.min(100,nota-2),energy:Math.min(100,nota+1),
    interpretation:Math.min(100,nota+3),tier:banda};
  const promocion:PromocionBar={id:1,title:'Promo de ejemplo: 2x1 en bebidas',
    image_url:'',placement:'resultado',layout:'firma',duration_seconds:3.2,bar_name:'BAR DEMO'};
  return <main className="min-h-screen bg-[#070617] p-5 text-white">
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-black">Karyou · Ceremonia premium (solo prueba)</h1>
      <p className="text-amber-200 font-bold">👑 Nuevo: modo épico EXCLUSIVO para 100/100 · fanfarria, corona, rayos dorados, onda expansiva y confeti reforzado.</p>
      <p className="text-sm text-purple-200">Datos simulados de demostración. No modifica salas, puntuaciones ni producción.</p>
      <div className="flex flex-wrap gap-2">
        {ejemplos.map((ej,i)=><button key={i} type="button" onClick={()=>{setIndice(i);setVersion(v=>v+1);setEnCurso(true)}}
          className={'rounded-lg px-3 py-2 text-sm font-bold hover:bg-purple-700 '+(ej[0]===100?'bg-amber-600 text-black':'bg-purple-800')}>{ej[2]}</button>)}
        <button type="button" onClick={()=>{setAnuncio(a=>!a);setVersion(v=>v+1);setEnCurso(true)}}
          className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-bold">Patrocinador: {anuncio?'sí':'no'}</button>
        <button type="button" onClick={()=>{setVersion(v=>v+1);setEnCurso(true)}}
          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold">↻ Reproducir</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-purple-600/50">
        {enCurso?<AnimacionResultadoPremium key={version} resultado={resultado}
          patrocinio={anuncio?promocion:null} siguienteEnCola onFin={()=>setEnCurso(false)}/>:
          <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-[#171135]">
            <p className="text-2xl font-black">Ceremonia finalizada · 8,7 s</p>
            <button type="button" onClick={()=>{setVersion(v=>v+1);setEnCurso(true)}}
              className="rounded-lg bg-teal-700 px-5 py-3 font-bold">Ver de nuevo</button>
          </div>}
      </div>
      <p className="text-xs text-purple-300">Para probar con resultados reales en esta rama: /sala/TU-CODIGO/tv?ceremonia=premium</p>
    </div>
  </main>;
}