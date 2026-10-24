'use client';

import {useEffect, useRef, useState} from 'react';
import type {ResultadoVista} from '@/app/sala/tipos';
import type {PromocionBar} from './AnuncioBar';
import {tic, revelar, resultado as sonidoResultado, perfecto as sonidoPerfecto} from '@/lib/sonido.mjs';
import {CEREMONIA_PREMIUM_MS,CEREMONIA_PREMIUM_FPS,FASES_PREMIUM,datosPremium} from '@/domain/ceremonia-premium.mjs';

type Props={
  resultado:ResultadoVista;
  patrocinio?:PromocionBar|null;
  siguienteEnCola?:boolean;
  onInicio?:()=>void|Promise<unknown>;
  onFin:()=>void;
};
const limitar=(n:number)=>Math.max(0,Math.min(1,n));
const suavizar=(n:number)=>1-Math.pow(1-limitar(n),3);
const pt=(ms:number,desde:number,hasta:number)=>limitar((ms-desde)/(hasta-desde));
const PALETA=['#1DFBE1','#F7D58C','#BE7CFF','#ED67C9','#E2EEFF'];
const PALETA_PERFECTA=['#FFD76A','#FFFDF7','#1DFBE1','#FFAE58','#FCE5A1'];

/** Port visual del concepto Remotion de Karyou para Smart TV, sin reproducir
 * un MP4 estático ni agregar librerías pesadas. Los datos son los del servidor.
 * Sólo se activa mediante ?ceremonia=premium en la vista de prueba. */
export default function AnimacionResultadoPremium({
  resultado,patrocinio=null,siguienteEnCola=false,onInicio,onFin,
}:Props){
  const [elapsed,setElapsed]=useState(0);
  const [width,setWidth]=useState(1920);
  const boxRef=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onInicio,onFin});
  useEffect(()=>{callbacks.current={onInicio,onFin}},[onInicio,onFin]);
  const sounded=useRef(-1);
  const [reducirMovimiento,setReducirMovimiento]=useState(false);
  useEffect(()=>{
    setReducirMovimiento(Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  },[]);

  useEffect(()=>{
    const box=boxRef.current;
    if(!box)return;
    const resize=()=>setWidth(box.getBoundingClientRect().width||1920);
    resize();
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(resize);
      observer.observe(box);
      return ()=>observer.disconnect();
    }
    window.addEventListener('resize',resize);
    return ()=>window.removeEventListener('resize',resize);
  },[]);

  useEffect(()=>{
    const key='karyou:ceremonia-premium:'+resultado.id;
    let comienzo=Date.now();
    let nuevo=true;
    try{
      const anterior=Number(sessionStorage.getItem(key));
      if(anterior>0&&anterior<=comienzo&&comienzo-anterior<3600000){
        comienzo=anterior;
        nuevo=false;
      }else sessionStorage.setItem(key,String(comienzo));
    }catch{/* Navegadores sin acceso a sessionStorage. */}
    // El backend ya confirma una sola vez la apertura del resultado.
    if(nuevo)Promise.resolve().then(()=>callbacks.current.onInicio?.())
      .catch(err=>console.warn('[Karyou] No se confirmó la ceremonia:',err));
    let id=0,previo=-1,terminado=false;
    const paso=()=>{
      if(terminado)return;
      const ms=Math.max(0,Math.min(CEREMONIA_PREMIUM_MS,Date.now()-comienzo));
      const cuadro=Math.floor(ms*CEREMONIA_PREMIUM_FPS/1000);
      if(cuadro!==previo){previo=cuadro;setElapsed(ms);}
      if(ms>=CEREMONIA_PREMIUM_MS){terminado=true;callbacks.current.onFin();}
      else id=requestAnimationFrame(paso);
    };
    id=requestAnimationFrame(paso);
    return ()=>{terminado=true;cancelAnimationFrame(id)};
  },[resultado.id]);

  const fase=elapsed>=FASES_PREMIUM.puntuacion?3:elapsed>=FASES_PREMIUM.metricas?2:
    elapsed>=FASES_PREMIUM.intriga?1:0;
  useEffect(()=>{
    if(fase===sounded.current)return;
    sounded.current=fase;
    if(fase===0)tic();
    else if(fase===1)revelar();
    else if(fase===2 && resultado.total!==100)sonidoResultado(resultado.tier);
    else if(fase===3 && resultado.total===100)sonidoPerfecto();
  },[fase,resultado.tier]);

  const r=datosPremium(resultado,patrocinio,siguienteEnCola);
  if(!r)return null;
  const esPerfecto=r.esPerfecto;
  const explosion=esPerfecto?suavizar(pt(elapsed,FASES_PREMIUM.puntuacion,FASES_PREMIUM.puntuacion+550)):0;
  const destello=esPerfecto&&!reducirMovimiento?
    Math.max(0,1-Math.abs(elapsed-(FASES_PREMIUM.puntuacion+165))/225):0;
  const onda=esPerfecto&&!reducirMovimiento?
    pt(elapsed,FASES_PREMIUM.puntuacion,FASES_PREMIUM.puntuacion+1120):0;
  const pulso=esPerfecto&&!reducirMovimiento?
    1+Math.sin(elapsed/155)*0.025*explosion:1;
  const metricas=suavizar(pt(elapsed,FASES_PREMIUM.intriga,FASES_PREMIUM.metricas-250));
  const progreso=suavizar(pt(elapsed,FASES_PREMIUM.metricas,FASES_PREMIUM.puntuacion));
  const revelacion=suavizar(pt(elapsed,FASES_PREMIUM.puntuacion,FASES_PREMIUM.puntuacion+520));
  const scoreActual=Math.round(r.total*progreso);
  const scale=width/1920;
  const confeti=Array.from({length:esPerfecto?(reducirMovimiento?38:100):44},(_,i)=>({
    left:100+(i*137)%1720,
    top:-60+((elapsed-FASES_PREMIUM.puntuacion)*(0.11+i%4*0.028)+(i*113)%190+1020)%1070,
    rotate:(elapsed/13)*(i%2?-1:1)+i*29,
    color:(esPerfecto?PALETA_PERFECTA:PALETA)[i%PALETA.length],
  }));
  const datos=[
    {name:'RITMO',value:r.ritmo,color:'#21F1E4'},
    {name:'ENERGÍA',value:r.energia,color:'#BA78FF'},
    {name:'INTERPRETACIÓN',value:r.interpretacion,color:'#FFC77A'},
  ];
  return <div ref={boxRef} className="relative w-full overflow-hidden bg-[#040511]"
    role="img" aria-label={'Puntuación recreativa: '+r.cantante+', '+r.total+' de 100, rango '+r.rango}
    style={{aspectRatio:'16 / 9',isolation:'isolate'}}>
    <div style={{position:'absolute',left:0,top:0,width:1920,height:1080,
      transform:'scale('+scale+')',transformOrigin:'top left',pointerEvents:'none',
      overflow:'hidden',color:'#F6F6FF',fontFamily:'Inter, Segoe UI, Arial, sans-serif',
      background:esPerfecto&&explosion>0
        ?'radial-gradient(ellipse at 67% 49%,#6B462A,transparent 56%),radial-gradient(ellipse at 18% 64%,#39135F,transparent 54%),#040511'
        :'radial-gradient(ellipse at 67% 49%,#19246B,transparent 55%),radial-gradient(ellipse at 18% 64%,#39135F,transparent 54%),#040511'}}>
      {Array.from({length:7},(_,i)=><div key={'beam'+i} style={{position:'absolute',left:95+i*280,top:-340,width:130,height:1300,
        transform:'rotate('+((i-3)*14+Math.sin(elapsed/1800+i)*3)+'deg)',transformOrigin:'top center',
        opacity:.7,filter:'blur(30px)',background:'linear-gradient(#3FE8F720,transparent 85%)'}}/>)}
      {Array.from({length:45},(_,i)=><div key={'dot'+i} style={{position:'absolute',
        left:(i*857+153)%1920+Math.sin(elapsed/1200+i)*13,
        top:((i*367+251)-elapsed*(i%3+1)*.013+1200)%1200,
        width:i%3+2,height:i%3+2,borderRadius:'50%',background:i%4===0?'#FFD6A1':'#C1DBFF',opacity:.33}}/>)}
      <div style={{position:'absolute',inset:34,borderRadius:52,border:'2px solid #48446F',
        background:'linear-gradient(135deg,#21163838,#07112211,#25173B38)',
        boxShadow:'inset 0 0 0 6px #0B0B24,inset 0 0 90px #1C144E,0 35px 90px #0008'}}/>
      <div style={{position:'absolute',top:34,left:145,right:145,height:5,
        background:esPerfecto&&explosion>0
          ?'linear-gradient(90deg,transparent,#FFD76A,#FFFDF7,#FFD76A,transparent)'
          :'linear-gradient(90deg,transparent,#22F3E5,#BF8FFF,#FFE3AB,transparent)',filter:'blur(2px)'}}/>
      {[100,1812].map((x,i)=>[340,695].map((y,j)=><div key={'speaker'+i+j} style={{position:'absolute',left:x-42,top:y-42,width:84,height:84,borderRadius:'50%',
        border:'8px solid #292440',boxShadow:'0 0 0 4px #625A8055,inset 0 0 25px #000,0 0 25px #7A5DDE55',
        transform:'scale('+(1+Math.sin(elapsed/260+i+j)*.03)+')',
        background:'radial-gradient(circle at 34% 27%,#4C4767,#10101E 58%,#05050B 72%)'}}/>))}
      <header style={{position:'absolute',left:155,right:155,top:90,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:18}}>
          <div style={{width:59,height:59,borderRadius:18,background:'linear-gradient(135deg,#0CFAE7,#C087FA)',boxShadow:'0 0 24px #0AF3EF6A',
            display:'grid',placeItems:'center',fontSize:35}}>🎤</div>
          <div><div style={{fontSize:48,fontWeight:950,letterSpacing:5}}>KARYOU<span style={{color:'#18F2DF'}}>.</span></div>
            <div style={{fontSize:15,letterSpacing:6,color:'#AEB0D3',marginTop:4}}>EL SHOW ES TUYO</div></div>
        </div>
        <div style={{textAlign:'right',maxWidth:560}}>
          {r.patrocinador&&revelacion>.01?<>
            <div style={{fontSize:15,color:'#BAB3D8',letterSpacing:4,fontWeight:800}}>✦ PATROCINA ESTE MOMENTO</div>
            <div style={{fontSize:29,color:'#FFE0A1',fontWeight:950,marginTop:6,opacity:revelacion}}>{r.patrocinador.nombre}</div>
            <div style={{fontSize:15,color:'#E6DDF2',opacity:revelacion}}>{r.patrocinador.titulo}</div>
          </>:<div style={{fontSize:18,color:'#C0BDE7',letterSpacing:4}}>● PUNTUACIÓN RECREATIVA</div>}
        </div>
      </header>
      <div style={{position:'absolute',top:205,left:180,right:180,height:2,
        background:'linear-gradient(90deg,transparent,#8474C1,transparent)'}}/>
      <div style={{position:'absolute',left:0,right:0,top:235,textAlign:'center'}}>
        <div style={{fontSize:23,color:'#BDB7E3',fontWeight:800,letterSpacing:9}}>EL SHOW FUE TUYO</div>
        <div style={{fontSize:esPerfecto&&explosion>0?72:59,fontWeight:950,letterSpacing:4,marginTop:9,
          color:esPerfecto&&explosion>0?'#FFF2C1':'#FFFFFF',
          textShadow:esPerfecto&&explosion>0?'0 0 35px #FFD76A55':'none'}}>
          {esPerfecto&&explosion>0?'👑 100 PERFECTO':'TU PUNTUACIÓN FINAL'}
        </div>
      </div>
      <section style={{position:'absolute',left:205,top:395,width:590,height:463,boxSizing:'border-box',
        background:'linear-gradient(135deg,#1B193BEE,#090A20F2)',border:'1px solid #7066A3',
        borderRadius:32,padding:'34px 36px',boxShadow:'0 25px 65px #0007'}}>
        <div style={{fontSize:18,letterSpacing:4,color:'#AFA8D7',fontWeight:800}}>♪ ESTRELLA EN ESCENA</div>
        <div style={{fontSize:59,fontWeight:950,marginTop:18,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.cantante.toUpperCase()}</div>
        <div style={{fontSize:25,color:'#BCB8D6',marginTop:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {r.cancion}{r.artista?' · '+r.artista:''}{r.mesa?' · '+r.mesa:''}</div>
        <div style={{position:'relative',marginTop:30,height:150,borderRadius:18,
          background:'#080D23',display:'flex',alignItems:'center',justifyContent:'space-around',overflow:'hidden'}}>
          {Array.from({length:28},(_,i)=><div key={i} style={{width:9,borderRadius:7,
            height:19+(Math.sin(elapsed/150+i*.95)+1)*44+(Math.sin(elapsed/240+i*.7)+1)*12,
            background:'linear-gradient(#72FEED,'+(i%3===0?'#AF72FB':'#107DAF')+')',boxShadow:'0 0 12px #13D4CD55'}}/>)}
          {r.patrocinador?.imagen&&revelacion>0&&<div style={{position:'absolute',inset:0,background:'#090B20',
            display:'grid',placeItems:'center',opacity:revelacion}}>
            {/* La creatividad terminada del bar se conserva completa. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.patrocinador.imagen} alt={'Promoción de '+r.patrocinador.nombre}
              style={{width:'100%',height:'100%',objectFit:'contain'}}/>
          </div>}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:20}}>
          <span style={{fontSize:19,color:'#9F9BBF',letterSpacing:3}}>RANGO KARYOU</span>
          <span style={{fontSize:24,color:'#FFE1A0',opacity:revelacion}}>{'★'.repeat(Math.max(1,Math.round(r.total/20)))}</span>
        </div>
      </section>
      <div style={{position:'absolute',left:968,top:365,width:620,height:475,display:'grid',placeItems:'center'}}>
        {esPerfecto&&explosion>0&&<>
          {Array.from({length:12},(_,i)=><div key={'rayo'+i} style={{
            position:'absolute',left:'50%',top:'50%',width:14,height:510,
            borderRadius:30,background:'linear-gradient(transparent,#FFD76A99 35%,transparent 82%)',
            opacity:explosion*(reducirMovimiento?.25:.58),
            filter:'blur(14px)',
            transform:'translate(-50%,-50%) rotate('+(i*30+(reducirMovimiento?0:elapsed*.003))+'deg)',
          }}/>)}
          <div style={{position:'absolute',width:520,height:520,border:'9px solid #FFE8A7',
            boxShadow:'0 0 65px #FFD76A55',borderRadius:'50%',opacity:(1-onda)*.7,
            transform:'scale('+(1+onda*1.65)+')'}}/>
          <div style={{position:'absolute',top:20,fontSize:67,color:'#FFE5A4',
            opacity:explosion,transform:'translateY('+((1-explosion)*25)+'px) scale('+(0.85+explosion*.15)+')',
            filter:'drop-shadow(0 0 16px #FFD76A)'}}>♛</div>
        </>}
        <div style={{position:'absolute',width:492,height:492,borderRadius:'50%',
          background:'radial-gradient(circle,#22E5E82A,#7F53B91B 48%,transparent 68%)',filter:'blur(15px)'}}/>
        <svg width="500" height="500" viewBox="0 0 500 500" style={{position:'absolute',transform:'rotate(-90deg)',overflow:'visible'}}>
          <circle cx="250" cy="250" r="198" stroke="#33304E" strokeWidth="25" fill="none"/>
          <circle cx="250" cy="250" r="198" stroke={esPerfecto&&explosion>0?'#FFD76A':'#2CF8E7'} strokeWidth="24" fill="none" strokeLinecap="round"
            strokeDasharray={(Math.PI*2*198*progreso*r.total/100)+' '+(Math.PI*2*198)}
            style={{filter:esPerfecto&&explosion>0?'drop-shadow(0 0 22px #FFD76A)':'drop-shadow(0 0 18px #13E9DB)'}}/>
          <circle cx="250" cy="250" r="167" stroke="#A081EE55" strokeWidth="2" strokeDasharray="8 18" fill="none"/>
        </svg>
        <div style={{position:'relative',textAlign:'center'}}>
          <div style={{fontSize:23,letterSpacing:5,fontWeight:800,color:'#CFC8ED'}}>PUNTOS</div>
          <div style={{fontSize:136,lineHeight:1.1,fontWeight:1000,letterSpacing:-6,
            color:esPerfecto&&explosion>0?'#FFFDF7':'#FFFFFF',
            textShadow:esPerfecto&&explosion>0?'0 0 42px #FFD76ABB':'0 0 35px #17EADB88',
            transform:'scale('+pulso+')',
            fontVariantNumeric:'tabular-nums'}}>
            {elapsed<FASES_PREMIUM.metricas?'···':scoreActual}
          </div>
          <div style={{fontSize:20,letterSpacing:4,color:'#9696C4'}}>DE 100 POSIBLES</div>
          <div style={{marginTop:12,fontSize:26,fontWeight:950,color:r.color,opacity:revelacion}}>
            {esPerfecto?'RANGO S · EXCLUSIVO':'RANGO '+r.rango}
          </div>
        </div>
      </div>
      <div style={{position:'absolute',top:834,left:950,width:670,textAlign:'center',
        fontSize:esPerfecto?43:39,fontWeight:1000,letterSpacing:esPerfecto?2:4,
        color:r.color,opacity:revelacion,
        textShadow:esPerfecto?'0 0 30px #FFD76A99':'0 0 22px #D693FF66'}}>{r.titular}</div>
      {esPerfecto&&revelacion>0&&<div style={{position:'absolute',top:848,left:240,width:520,
        textAlign:'center',fontSize:22,fontWeight:900,letterSpacing:2,
        color:'#FFE5B0',opacity:explosion}}>{r.remate}</div>}
      <div style={{position:'absolute',left:205,right:205,bottom:81,display:'flex',gap:20,opacity:metricas,
        transform:'translateY('+((1-metricas)*28)+'px)'}}>
        {datos.map(d=><div key={d.name} style={{flex:1,height:105,boxSizing:'border-box',borderRadius:19,
          border:'1px solid #5C577B',background:'#171632EE',padding:'17px 22px'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:19,fontWeight:800,letterSpacing:2}}>
            <span style={{color:'#B8B5D3'}}>{d.name}</span><span style={{color:d.color,fontSize:24}}>{Math.round(d.value*metricas)}%</span>
          </div>
          <div style={{height:10,background:'#2F2A47',borderRadius:8,marginTop:15,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:8,background:d.color,width:(d.value*metricas)+'%',boxShadow:'0 0 14px '+d.color}}/>
          </div>
        </div>)}
      </div>
      {destello>0&&<div aria-hidden="true" style={{position:'absolute',inset:0,
        background:'#FFF8DA',opacity:destello*.3,pointerEvents:'none'}}/>}
      {revelacion>0&&confeti.map((f,i)=><div key={'conf'+i} style={{position:'absolute',left:f.left,
        top:f.top,width:5+i%3*3,height:11+i%4*3,background:f.color,borderRadius:2,
        opacity:revelacion*.85,transform:'rotate('+f.rotate+'deg)',boxShadow:'0 0 12px '+f.color}}/>)}
      <div style={{position:'absolute',bottom:36,left:164,color:'#8283A9',fontSize:16,letterSpacing:3}}>KARYOU · PUNTUACIÓN RECREATIVA</div>
      {r.siguienteEnCola&&<div style={{position:'absolute',bottom:36,right:160,color:'#BBC0DF',fontSize:16,
        letterSpacing:2,opacity:revelacion}}>
        ▶ SIGUIENTE CANCIÓN LISTA · PLAY AL TERMINAR
      </div>}
    </div>
  </div>;
}