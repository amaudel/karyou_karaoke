'use client';

import { useEffect, useState } from 'react';

const CLAVE = 'karyou-tour-participante-v1';
const PASOS = [
  { selector: '[data-karyou-tour="busqueda"]', titulo: 'Busca tu canción', texto: 'Escribe el nombre de una canción o artista y toca Buscar. También puedes elegir un género.' },
  { selector: '[data-karyou-tour="busqueda"]', titulo: 'Pide la canción', texto: 'En los resultados, toca Pedir junto a la canción que quieres cantar. El límite de canciones aparece en la cola.' },
  { selector: '[data-karyou-cola-participantes="pendientes"]', titulo: 'Sigue tu turno', texto: 'Aquí verás las canciones pendientes y quién canta después. También puedes consultar cuántas canciones tuyas están en espera.' },
  { selector: '[data-karyou-cola-participantes="pendientes"]', titulo: '¡A cantar!', texto: 'Cuando llegue tu turno, sigue las indicaciones de la pantalla para iniciar tu canción en la TV. Al terminar, disfruta tu puntuación.' },
];

type Rect = { top: number; left: number; width: number; height: number };

export default function TourParticipante() {
  const [paso, setPaso] = useState<number | null>(null);
  const [bienvenida, setBienvenida] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(CLAVE)) setBienvenida(true); } catch { setBienvenida(true); }
  }, []);

  useEffect(() => {
    if (paso === null) return;
    const actualizar = () => {
      const el = document.querySelector(PASOS[paso].selector);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    document.querySelector(PASOS[paso].selector)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    actualizar();
    window.addEventListener('scroll', actualizar, true);
    window.addEventListener('resize', actualizar);
    const id = window.setInterval(actualizar, 500);
    return () => { window.removeEventListener('scroll', actualizar, true); window.removeEventListener('resize', actualizar); window.clearInterval(id); };
  }, [paso]);

  const terminar = () => {
    try { localStorage.setItem(CLAVE, '1'); } catch { /* El tour sigue siendo opcional. */ }
    setBienvenida(false); setPaso(null); setRect(null);
  };

  return <>
    <button type="button" onClick={() => { setBienvenida(false); setPaso(0); }} className="rounded-xl border border-purple-400/50 px-3 py-2 text-xs font-bold text-purple-100">❔ Cómo funciona</button>
    {(bienvenida || paso !== null) && <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guía de Karyou">
      {(bienvenida || !rect) && <div className="absolute inset-0 bg-black/75" />}
      {paso !== null && rect && <div aria-hidden="true" className="pointer-events-none fixed rounded-2xl border-2 border-amber-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.78)]" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }} />}
      <div className="absolute bottom-3 left-3 right-3 mx-auto max-h-[75dvh] max-w-md overflow-y-auto rounded-3xl border border-purple-400/50 bg-[#190c30] p-5 text-white shadow-2xl sm:bottom-8">
        {bienvenida ? <>
          <p className="text-xs font-bold uppercase tracking-widest text-pink-300">🎤 Bienvenido a Karyou</p>
          <h2 className="mt-2 text-xl font-black">¡Tu canción empieza aquí!</h2>
          <p className="mt-2 text-sm leading-relaxed text-purple-100">Te mostramos en cuatro pasos cómo pedir canciones y seguir tu turno.</p>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => { setBienvenida(false); setPaso(0); }} className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-bold">Muéstrame cómo</button><button type="button" onClick={terminar} className="rounded-xl px-4 py-3 text-sm font-bold text-purple-200">Ya sé usarlo</button></div>
        </> : paso !== null && <>
          <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Paso {paso + 1} de {PASOS.length}</p>
          <h2 className="mt-2 text-xl font-black">{PASOS[paso].titulo}</h2>
          <p className="mt-2 text-sm leading-relaxed text-purple-100">{PASOS[paso].texto}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={terminar} className="px-2 py-3 text-sm font-bold text-purple-200">Omitir</button><div className="flex gap-2">{paso > 0 && <button type="button" onClick={() => setPaso(paso - 1)} className="rounded-xl border border-purple-400/40 px-4 py-3 text-sm font-bold">Anterior</button>}<button type="button" onClick={() => paso === PASOS.length - 1 ? terminar() : setPaso(paso + 1)} className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-bold">{paso === PASOS.length - 1 ? '¡Entendido!' : 'Siguiente'}</button></div></div>
        </>}
      </div>
    </div>}
  </>;
}
