'use client';

import { useEffect, useState } from 'react';

export type PromocionBar = {
  id: number;
  title: string;
  image_url: string;
  placement: 'espera' | 'entre' | 'resultado';
  layout: 'spotlight' | 'tarjeta' | 'firma';
  duration_seconds: number;
  bar_name: string;
  bar_logo?: string | null;
};

/** Diseño premium para promociones YA TERMINADAS: imagen intacta, sin recorte ni filtros.
 * Nunca aparece dentro ni encima del iframe de YouTube.
 */
export default function AnuncioBar({
  promociones, ubicacion, compacto = false, mini = false,
}: {
  promociones: PromocionBar[];
  ubicacion: 'espera' | 'entre';
  compacto?: boolean;
  mini?: boolean;
}) {
  const elegibles = promociones.filter(p => p.placement === ubicacion);
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    if (elegibles.length < 2) return;
    const atual = elegibles[indice % elegibles.length];
    const ms = ubicacion === 'entre' ? 6000 : (atual?.duration_seconds ?? 10) * 1000;
    const timer = window.setTimeout(() => setIndice(i => (i + 1) % elegibles.length), ms);
    return () => window.clearTimeout(timer);
  }, [indice, elegibles.length, ubicacion, elegibles.map(p => p.id).join(',')]);
  if (!elegibles.length) return null;
  const item = elegibles[indice % elegibles.length];
  if (!item) return null;
  // Variante horizontal para la pantalla de espera 16:9: la promoción sigue
  // rotando, pero no empuja la batalla de mesas ni el QR fuera del televisor.
  if (mini) {
    return (
      <aside aria-label="Promoción del establecimiento"
        className="flex h-[clamp(65px,11vh,95px)] min-h-0 items-center gap-3 rounded-2xl border border-amber-400/30 bg-[#13091f]/80 px-3 py-2 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.title}
          className="h-full w-[clamp(70px,9vw,122px)] shrink-0 rounded-lg bg-black/40 object-contain" loading="eager" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">✦ Promoción del bar · {item.bar_name}</p>
          <p className="truncate text-sm font-extrabold">{item.title}</p>
        </div>
        {elegibles.length > 1 && <span className="shrink-0 text-xs text-purple-200/70">{indice % elegibles.length + 1}/{elegibles.length}</span>}
      </aside>
    );
  }
  return (
    <aside className={`karyou-bar-ad group relative isolate overflow-hidden rounded-3xl border border-amber-400/40 bg-[#13091f] text-white shadow-xl shadow-fuchsia-950/40 ${compacto ? 'p-3' : 'p-4'}`}
      aria-label="Promoción del establecimiento">
      <div aria-hidden className="pointer-events-none absolute -top-12 left-1/3 h-24 w-52 rounded-full bg-fuchsia-500/20 blur-3xl"/>
      <div className="relative z-10 flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.17em] text-amber-300">✦ Promoción del bar</p>
          <p className="truncate text-sm font-black text-white">{item.bar_name}</p>
        </div>
        <span className="rounded-full border border-fuchsia-400/30 bg-purple-950/60 px-3 py-1 text-[10px] font-bold text-fuchsia-200">
          {ubicacion === 'entre' ? 'Mientras llega tu turno' : 'La fiesta continúa'}
        </span>
      </div>
      <div key={item.id} className={`karyou-ad-reveal relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-purple-300/25 bg-black/35 ${compacto ? 'h-[170px] sm:h-[210px]' : 'h-[265px] sm:h-[340px]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.title} className="h-full w-full object-contain" loading="eager" />
      </div>
      <div className="relative z-10 mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-black text-amber-200">{item.title}</p>
        {elegibles.length > 1 &&
          <span className="shrink-0 text-[11px] tabular-nums text-purple-200/75">{indice % elegibles.length + 1} / {elegibles.length}</span>}
      </div>
    </aside>
  );
}
