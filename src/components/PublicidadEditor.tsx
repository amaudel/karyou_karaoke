'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { guardarPromocionAction, estadoPromocionAction, marcaBarAction } from '@/app/sala/[code]/control/publicidad/actions';

export type CampaniaAdmin = {
  id:number;title:string;image_url:string;placement:string;layout:string;
  priority:number;duration_seconds:number;status:string;starts_at:string|null;
  ends_at:string|null;impresiones:number;
};

const localizacion: Record<string,string> = {
  espera:'TV sin canciones',entre:'Entre canciones',resultado:'Puntuación final',
};
export default function PublicidadEditor({ code,barNombre,campanias,storageOk }:{
  code:string;barNombre:string;campanias:CampaniaAdmin[];storageOk:boolean;
}) {
  const [ubicacion,setUbicacion] = useState<'espera'|'entre'|'resultado'>('espera');
  const [archivo,setArchivo] = useState<string|null>(null);
  const [archivoNombre,setArchivoNombre] = useState('');
  const [calidad,setCalidad] = useState('');
  const [duracion,setDuracion] = useState(10);
  const inicio=useRef<HTMLInputElement>(null),fin=useRef<HTMLInputElement>(null);
  const desdeISO=useRef<HTMLInputElement>(null),hastaISO=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{ if(archivo) URL.revokeObjectURL(archivo); },[archivo]);

  function nuevaImagen(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0];
    if (archivo) URL.revokeObjectURL(archivo);
    setArchivo(null);setArchivoNombre('');setCalidad('');
    if (!file) return;
    if (!['image/webp','image/png','image/jpeg'].includes(file.type) || file.size>3*1024*1024) {
      setCalidad('Formato inválido o archivo mayor de 3 MB.'); e.target.value='';return;
    }
    const src=URL.createObjectURL(file);
    const img=new window.Image();
    img.onload=()=>setCalidad(img.naturalWidth<1000 || img.naturalHeight<500
      ? '⚠ Imagen de baja resolución; podría verse borrosa en TV.'
      : '✓ Resolución adecuada para la TV.');
    img.src=src;setArchivo(src);setArchivoNombre(file.name);
  }

  function prepararFecha(e:FormEvent<HTMLFormElement>) {
    try {
      if (desdeISO.current) desdeISO.current.value=inicio.current?.value ? new Date(inicio.current.value).toISOString():'';
      if (hastaISO.current) hastaISO.current.value=fin.current?.value ? new Date(fin.current.value).toISOString():'';
    } catch { e.preventDefault();setCalidad('Revisa las fechas de inicio y fin.'); }
  }

  return (
    <div className="space-y-7">
      <section className="rounded-3xl border border-purple-400/25 bg-[#140923] p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[.18em] text-amber-300">KARYOU BAR ADS · STUDIO</p>
            <h2 className="mt-1 text-2xl font-black text-white">Identidad del establecimiento</h2>
          </div>
          <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">Acceso de propietario</span>
        </div>
        <form action={marcaBarAction} className="flex flex-wrap gap-3">
          <input name="code" type="hidden" value={code}/>
          <label className="min-w-[200px] flex-1 text-sm font-medium text-purple-200">Nombre del bar
            <input name="nombre" required maxLength={100} defaultValue={barNombre}
              className="mt-1 w-full rounded-xl border border-purple-400/35 bg-[#24143f] px-4 py-3 text-white outline-none focus:border-amber-400"/>
          </label>
          <button className="self-end rounded-xl border border-amber-400/60 px-4 py-3 font-bold text-amber-200 hover:bg-amber-400/10" type="submit">Guardar nombre</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-amber-400/35 bg-gradient-to-br from-[#281042] via-[#1a0b33] to-[#11071d] p-4 shadow-xl shadow-purple-950/40 sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">✦ Nueva campaña</p>
          <h2 className="mt-1 text-2xl font-black text-white">Tu publicidad, como parte del espectáculo</h2>
          <p className="mt-2 text-sm text-purple-200">Sube una promoción terminada con ChatGPT, Canva o tu diseñador. Karyou respeta íntegramente la imagen y añade la puesta en escena.</p>
        </div>
        {!storageOk && <div role="alert" className="mb-4 rounded-xl border border-orange-400/50 bg-orange-950/40 p-4 text-sm text-orange-100">
          La carga estará habilitada cuando el proyecto tenga configurada la conexión con Vercel Blob (<code>BLOB_READ_WRITE_TOKEN</code>).
        </div>}
        <form action={guardarPromocionAction} onSubmit={prepararFecha} className="grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="code" value={code}/>
          <div className="space-y-3">
            <label htmlFor="imagenAd" className="block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-fuchsia-400/50 bg-black/35 text-center hover:border-amber-400">
              {archivo ?
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={archivo} alt="Vista previa de tu publicidad" className="h-64 w-full object-contain" />:
                <div className="flex h-64 flex-col items-center justify-center gap-2 p-4">
                  <span className="text-4xl">🖼️</span>
                  <strong className="text-white">Seleccionar imagen publicitaria</strong>
                  <span className="text-xs text-purple-200">JPG · PNG · WebP · máximo 3 MB</span>
                </div>}
            </label>
            <input id="imagenAd" name="imagen" type="file" accept="image/png,image/jpeg,image/webp" onChange={nuevaImagen} required
              className="w-full text-xs text-purple-200 file:rounded-lg file:border-0 file:bg-fuchsia-700 file:px-3 file:py-2 file:text-white" />
            <p className="text-xs text-purple-200">{archivoNombre || 'El contenido y los textos de tu imagen no serán modificados.'}</p>
            {calidad && <p className="text-xs font-bold text-amber-200">{calidad}</p>}
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-bold text-purple-100">Nombre de la campaña
              <input name="titulo" required maxLength={90} placeholder="Ej. 2×1 en Mojitos" className="mt-1 w-full rounded-xl border border-purple-400/40 bg-purple-950/50 px-3 py-3 text-white"/>
            </label>
            <label className="block text-sm font-bold text-purple-100">Dónde aparece
              <select name="placement" value={ubicacion} onChange={e=>setUbicacion(e.target.value as typeof ubicacion)}
                className="mt-1 w-full rounded-xl border border-purple-400/40 bg-purple-950 px-3 py-3 text-white">
                <option value="espera">Spotlight · TV sin canciones</option>
                <option value="entre">Tarjeta premium · Entre canciones</option>
                <option value="resultado">Firma discreta · Últimos segundos del resultado</option>
              </select>
            </label>
            <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-950/25 p-3 text-xs text-purple-200">
              {ubicacion==='espera' ? 'La imagen se presenta junto al QR, sin recortes ni anuncios encima del video.' :
                ubicacion==='entre' ? 'La imagen se retira inmediatamente al comenzar la canción.' :
                'Durante la puntuación solo se muestra una firma compacta, nunca el flyer completo.'}
            </div>
            {ubicacion==='espera'&&<label className="block text-sm font-bold text-purple-100">
              Tiempo por promoción: {duracion} segundos
              <input type="range" min={8} max={12} step={1} value={duracion} onChange={e=>setDuracion(Number(e.target.value))}
                className="mt-2 w-full accent-amber-400"/>
            </label>}
            <input type="hidden" name="duracion" value={ubicacion==='espera'?duracion:ubicacion==='entre'?6:3}/>
            <label className="block text-sm font-bold text-purple-100">Prioridad
              <select name="prioridad" defaultValue="0" className="mt-1 w-full rounded-xl border border-purple-400/40 bg-purple-950 px-3 py-3 text-white">
                <option value="0">Normal</option><option value="1">Destacada</option><option value="2">Alta</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-purple-100">Desde (opcional)
                <input ref={inicio} type="datetime-local" className="mt-1 w-full rounded-lg border border-purple-400/40 bg-purple-950 p-2 text-white"/>
              </label>
              <label className="text-xs font-bold text-purple-100">Hasta (opcional)
                <input ref={fin} type="datetime-local" className="mt-1 w-full rounded-lg border border-purple-400/40 bg-purple-950 p-2 text-white"/>
              </label>
            </div>
            <input name="inicioIso" type="hidden" ref={desdeISO}/>
            <input name="finIso" type="hidden" ref={hastaISO}/>
            <button type="submit" disabled={!storageOk || !archivo}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-fuchsia-600 px-5 py-3 font-black text-purple-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-40">
              Guardar borrador de promoción
            </button>
            <p className="text-xs text-purple-300">Se guarda como borrador. Debes activarla expresamente para que aparezca en la TV.</p>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-black text-white">Campañas de tu bar</h2>
          <p className="text-sm text-purple-200">Las campañas se reutilizan en todas las noches que crees desde este navegador.</p>
        </div>
        {campanias.length === 0 && <div className="rounded-2xl border border-dashed border-purple-400/40 bg-purple-950/35 p-8 text-center text-purple-200">
          Aún no has subido promociones. Tu primera campaña aparecerá aquí con su imagen y su estado.
        </div>}
        <div className="grid gap-4 lg:grid-cols-2">
          {campanias.map(c=>(
            <article key={c.id} className="overflow-hidden rounded-2xl border border-fuchsia-400/25 bg-purple-950/35 shadow-xl">
              <div className="relative flex h-48 items-center justify-center bg-black/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image_url} alt={c.title} loading="lazy" className="h-full w-full object-contain"/>
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-black text-white">{c.title}</h3>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${c.status==='active'?'bg-emerald-500/15 text-emerald-200':'bg-purple-400/15 text-purple-200'}`}>
                    {c.status==='active'?'● Activa':c.status==='paused'?'Pausada':'Borrador'}
                  </span>
                </div>
                <p className="text-xs text-purple-200">{localizacion[c.placement]||c.placement} · {c.duration_seconds} s · Prioridad {c.priority}</p>
                {(c.starts_at||c.ends_at) && <p className="text-xs text-amber-200">Programada: {c.starts_at?new Date(c.starts_at).toLocaleString('es-EC'):'Ahora'} – {c.ends_at?new Date(c.ends_at).toLocaleString('es-EC'):'Sin fin'}</p>}
                <div className="flex flex-wrap gap-2 pt-2">
                  {c.status!=='active' ?
                    <form action={estadoPromocionAction}><input type="hidden" name="code" value={code}/><input type="hidden" name="id" value={c.id}/><input type="hidden" name="status" value="active"/>
                      <button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">▶ Activar</button></form> :
                    <form action={estadoPromocionAction}><input type="hidden" name="code" value={code}/><input type="hidden" name="id" value={c.id}/><input type="hidden" name="status" value="paused"/>
                      <button className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-bold text-white">⏸ Pausar</button></form>}
                  <form action={estadoPromocionAction} onSubmit={e=>{if(!window.confirm('¿Archivar esta campaña? Dejará de mostrarse en la TV.'))e.preventDefault();}}>
                    <input type="hidden" name="code" value={code}/><input type="hidden" name="id" value={c.id}/><input type="hidden" name="status" value="archived"/>
                    <button className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-bold text-red-200">Archivar</button>
                  </form>
                  <a href={c.image_url} target="_blank" rel="noreferrer" className="rounded-lg border border-purple-400/30 px-3 py-2 text-xs font-bold text-purple-200">Ver imagen ↗</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
