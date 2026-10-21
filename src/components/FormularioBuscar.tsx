'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const ATAJOS_GENERO = [
  { id: 'favoritos', etiqueta: '⭐ Favoritas' },
  { id: 'ecuatoriana', etiqueta: '🇪🇨 Ecuatoriana' },
  { id: 'vallenato', etiqueta: '🪗 Vallenato' },
  { id: 'salsa', etiqueta: '💃 Salsa' },
  { id: 'bachata', etiqueta: '🎸 Bachata' },
  { id: 'ranchera', etiqueta: '🎺 Ranchera' },
  { id: 'cumbia', etiqueta: '🪘 Cumbia' },
  { id: 'urbano', etiqueta: '🔥 Urbano' },
  { id: 'rock', etiqueta: '⚡ Rock' },
  { id: 'balada', etiqueta: '🎙️ Balada' },
];

export default function FormularioBuscar({ consultaInicial }: { consultaInicial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [consulta, setConsulta] = useState(consultaInicial);

  useEffect(() => {
    setConsulta(consultaInicial);
  }, [consultaInicial]);

  const navegar = (termino: string) => {
    setConsulta(termino);
    startTransition(() => {
      const params = new URLSearchParams();
      if (termino.trim()) {
        params.set('q', termino.trim());
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navegar(consulta);
  };

  const activaNorm = consultaInicial.trim().toLowerCase();

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Canción, artista o género…"
            autoComplete="off"
            aria-label="Buscar canción o artista"
            className="w-full rounded-xl border border-purple-500/35 bg-[#120726]/80 py-3 pr-9 pl-3.5 text-base text-white placeholder:text-purple-300/45 shadow-inner focus:border-pink-400 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
          />
          {consulta && (
            <button
              type="button"
              onClick={() => navegar('')}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full bg-purple-800/60 px-2 py-0.5 text-xs font-bold text-purple-200 transition hover:bg-pink-600 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-3 text-sm sm:px-5 sm:text-base font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Buscando…</span>
            </>
          ) : (
            <>
              <span>🔍 Buscar</span>
            </>
          )}
        </button>
      </form>

      {/* Chips táctiles de géneros con ajuste multilínea para evitar scroll horizontal en celular */}
      <div className="flex flex-wrap items-center gap-1.5">
        {consultaInicial && (
          <button
            type="button"
            onClick={() => navegar('')}
            className="shrink-0 rounded-full border border-pink-500/50 bg-pink-950/50 px-3.5 py-1.5 text-xs font-bold text-pink-200 transition hover:bg-pink-600 hover:text-white"
          >
            ← Ver la cola
          </button>
        )}
        {ATAJOS_GENERO.map((g) => {
          const activo = activaNorm === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => navegar(activo ? '' : g.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                activo
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200 shadow-sm shadow-amber-500/20'
                  : 'border-purple-500/30 bg-purple-950/40 text-purple-200/85 hover:border-purple-400 hover:bg-purple-900/50 hover:text-white'
              }`}
            >
              {g.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
