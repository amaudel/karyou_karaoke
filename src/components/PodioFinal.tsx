'use client';

import Link from 'next/link';
import type { FilaMesaVista, FilaRankingVista } from '@/app/sala/tipos';

const MEDALLAS = ['🥇', '🥈', '🥉'];

export default function PodioFinal({ code, modo, ranking, rankingMesas }: {
  code: string;
  modo: 'casa' | 'bar';
  ranking: FilaRankingVista[];
  rankingMesas: FilaMesaVista[];
}) {
  const mesasValidas = rankingMesas.filter((m) => m.elegible).slice(0, 3);
  return (
    <main className="relative mx-auto min-h-[90vh] max-w-6xl overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-b from-[#110727] via-[#210d39] to-[#090414] p-5 text-center text-white sm:p-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #eab30866, transparent 65%)' }} />
      <div className="relative z-10">
        <div className="mb-2 text-sm font-extrabold uppercase tracking-[0.4em] text-amber-200">Karyou Karaoke</div>
        <h1 className="animar-score-pop text-4xl font-black text-amber-300 sm:text-6xl">🏆 ¡GRAN FINAL!</h1>
        <p className="mt-3 text-base text-purple-200">El aplauso final es para quienes hicieron brillar esta noche.</p>
        <div className={`mt-8 grid gap-5 ${modo === 'bar' ? 'lg:grid-cols-2' : ''}`}>
          {modo === 'bar' && (
            <section className="rounded-3xl border border-amber-400/30 bg-purple-950/70 p-5">
              <h2 className="mb-3 text-xl font-black text-amber-200">🍻 Podio por mesas</h2>
              {mesasValidas.length ? (
                <ol className="space-y-3">
                  {mesasValidas.map((m, i) => (
                    <li key={m.mesa} className="animar-aparecer flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4"
                      style={{ animationDelay: `${i * 180}ms` }}>
                      <span className="text-3xl">{MEDALLAS[i]}</span>
                      <div className="min-w-0 flex-1 text-left"><p className="truncate text-lg font-black">{m.mesa}</p>
                        <p className="text-xs text-amber-100/75">{m.canciones} actuaciones válidas</p></div>
                      <span className="text-2xl font-black tabular-nums text-amber-300">{m.media}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="rounded-xl bg-purple-900/40 p-5 text-purple-200">Ninguna mesa alcanzó tres actuaciones válidas para el podio.</p>}
            </section>
          )}
          <section className="rounded-3xl border border-fuchsia-400/30 bg-purple-950/70 p-5">
            <h2 className="mb-3 text-xl font-black text-pink-200">🎤 Estrellas de la noche</h2>
            {ranking.length ? <ol className="space-y-3">
              {ranking.slice(0, 3).map((r, i) => (
                <li key={r.participant_id} className="animar-aparecer flex items-center gap-3 rounded-2xl border border-pink-300/25 bg-pink-500/10 p-4" style={{ animationDelay: `${i * 180}ms` }}>
                  <span className="text-3xl">{MEDALLAS[i]}</span>
                  <div className="min-w-0 flex-1 text-left"><p className="truncate text-lg font-black">{r.nickname}</p>
                    <p className="text-xs text-pink-100/75">{r.canciones} canciones · mejor actuación</p></div>
                  <span className="text-2xl font-black tabular-nums text-pink-300">{r.mejor}</span>
                </li>
              ))}
            </ol> : <p className="rounded-xl bg-purple-900/40 p-5 text-purple-200">Esta noche no se registraron puntuaciones.</p>}
          </section>
        </div>
        <p className="mt-7 text-sm font-semibold text-amber-100/80">🎉 ¡GRACIAS POR CANTAR Y APLAUDIR!</p>
        <p className="mt-1 text-xs text-purple-300/70">Puntuaciones recreativas · Sala {code}</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl border border-purple-400/50 px-5 py-3 text-sm font-black text-purple-100 hover:bg-purple-800/50">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
