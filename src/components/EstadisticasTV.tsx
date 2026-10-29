'use client';

import {useEffect, useState} from 'react';
import type {FilaMesaVista, FilaRankingVista} from '@/app/sala/tipos';

/** Listas paginadas: todas las posiciones se muestran sin desplazar la TV. */
export default function EstadisticasTV({mesas, ranking, modo, lateral=false}:{
  mesas:FilaMesaVista[]; ranking:FilaRankingVista[]; modo:'casa'|'bar'; lateral?:boolean;
}) {
  const [pagina,setPagina]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>setPagina(p=>p+1),8000);
    return ()=>window.clearInterval(timer);},[]);
  const bloques=modo==='bar'?['mesas','personas']:['personas'];
  const bloque=bloques[pagina%bloques.length] ?? 'personas';
  const tabla=(tipo:string)=>{
    const esMesa=tipo==='mesas';
    const lista=esMesa?mesas:ranking;
    const paginas=Math.max(1,Math.ceil(lista.length/3));
    const actual=Math.floor(pagina/(lateral?bloques.length:1))%paginas;
    return <section key={tipo} className="karyou-tv-estadistica rounded-2xl border border-amber-500/30 bg-purple-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-amber-300">{esMesa?'🏆 Batalla de mesas':'🏅 Ranking de la noche'}</h2>
        {paginas>1&&<span className="text-[10px] text-purple-200">{actual+1}/{paginas}</span>}
      </div>
      {esMesa&&<p className="mt-1 text-[10px] text-purple-200/75">Promedio · mínimo 3 actuaciones para el podio</p>}
      {!lista.length?<p className="mt-2 text-xs text-purple-200/70">{esMesa?'Las mesas aparecerán al participar.':'Aún no hay puntuaciones.'}</p>:
      <ol className="mt-2 space-y-1">
        {esMesa?mesas.slice(actual*3,actual*3+3).map(f=><li key={f.mesa} className="flex items-center gap-2 text-xs">
          <span className="w-5 text-amber-300">{f.elegible?`#${f.posicion}`:'⏳'}</span>
          <span className="min-w-0 flex-1 truncate font-bold">{f.mesa}<span className="ml-1 text-[10px] font-normal text-purple-200/70">{f.canciones} act.{!f.elegible?' · provisional':''}</span></span>
          <strong className="text-amber-300">{f.media} pts</strong>
        </li>):ranking.slice(actual*3,actual*3+3).map(f=><li key={f.participant_id} className="flex items-center gap-2 text-xs">
          <span className="w-5 text-amber-300">#{f.posicion}</span><span className="min-w-0 flex-1 truncate font-bold">{f.nickname}</span><strong className="text-amber-300">{f.mejor}</strong>
        </li>)}
      </ol>}
    </section>;
  };
  return <div className={lateral?'karyou-tv-estadisticas-lateral':'karyou-tv-estadisticas-pie'}>
    {lateral?tabla(bloque):bloques.map(tabla)}
  </div>;
}
