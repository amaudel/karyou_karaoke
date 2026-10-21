'use client';

import RankingMesas from './RankingMesas';
import Link from 'next/link';

import { useCallback, useEffect, useRef, useState } from 'react';
import AnimacionResultado from './AnimacionResultado';
import { despertar } from '@/lib/sonido.mjs';
import type { ResultadoVista, FilaRankingVista, FilaMesaVista } from '@/app/sala/tipos';

/**
 * Pantalla de espera para TV comercial o familiar.
 *
 * Muestra el branding de KARYOU, un código QR destacado a la izquierda con el código
 * de la sala y las instrucciones de conexión, y una tarjeta de ranking limpia y
 * estilizada a la derecha.
 */
export default function PantallaEspera({
  code,
  modo = 'casa',
  enlace,
  qr,
  ranking,
  rankingMesas,
  resultado,
  resultadoReciente,
  audioListo = false,
  onActivarTV,
}: {
  code: string;
  modo?: 'casa' | 'bar';
  enlace: string;
  qr: string;
  ranking: FilaRankingVista[];
  rankingMesas: FilaMesaVista[];
  resultado: ResultadoVista | null;
  resultadoReciente: boolean;
  audioListo?: boolean;
  onActivarTV?: () => void;
}) {
  const [mostrando, setMostrando] = useState(() => Boolean(resultado && resultadoReciente));
  const [activoLocal, setActivoLocal] = useState(false);
  const audioActivo = audioListo || activoLocal;
  const reveladoRef = useRef<number | null>(null);

  const manejarActivar = useCallback(() => {
    despertar();
    setActivoLocal(true);
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {
      // Ignorar si el navegador de la TV no soporta Fullscreen
    }
    onActivarTV?.();
  }, [onActivarTV]);

  useEffect(() => {
    if (!resultado || !resultadoReciente) return;
    if (reveladoRef.current === resultado.id) return;
    reveladoRef.current = resultado.id;
    setMostrando(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.id, resultadoReciente]);

  if (mostrando && resultado) {
    return (
      <div className="mx-auto max-w-4xl">
        <div
          className="w-full overflow-hidden rounded-2xl border border-purple-500/30 bg-black shadow-2xl"
          style={{ aspectRatio: '16 / 9', minHeight: 220 }}
        >
          <AnimacionResultado
            resultado={resultado}
            ranking={ranking}
            aplausos={0}
            onFin={() => setMostrando(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-8rem)] w-full overflow-hidden rounded-3xl border border-purple-900/40 bg-gradient-to-b from-[#0c071e] via-[#110a28] to-[#070312] p-6 text-white shadow-2xl select-none flex flex-col justify-between">
      {/* ------------------------------------------------ Ambient Lights & Glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-purple-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-pink-500/15 blur-3xl" />

      {modo === 'bar' && rankingMesas.length > 0 && <div className="relative z-10 mb-4"><RankingMesas mesas={rankingMesas} compacto /></div>}
      <div aria-hidden="true" className="karyou-show-spotlight pointer-events-none absolute -top-28 left-1/4 h-64 w-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
      {/* ------------------------------------------------ Branding Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-purple-800/30 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 text-xl shadow-lg shadow-purple-500/30">
            🎤
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-wider uppercase">
              <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
                KARYOU
              </span>
              <span className="ml-2 text-xs font-bold tracking-widest text-purple-400">
                KARAOKE PARTY
              </span>
            </h1>
            <p className="text-xs text-purple-300/70">
              Sistema de Karaoke Interactivo · Control desde Móvil
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-purple-400/30 bg-purple-950/50 px-3 py-2 text-xs font-black text-purple-200">
            {modo === 'bar' ? '🍻 Modo Bar' : '🏠 Modo Casa'}
          </span>
          <Link href={`/sala/${code}/control`} target="_blank" rel="noopener noreferrer"
            className="rounded-xl border border-purple-400/30 px-3 py-2 text-xs font-semibold text-purple-300 hover:text-white hover:bg-purple-900/50">
            ⚙ Anfitrión ↗
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={manejarActivar}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider transition hover:scale-105 ${
              audioActivo
                ? 'border-emerald-400/50 bg-emerald-950/50 text-emerald-300'
                : 'border-pink-400/60 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-pink-500/25 animate-pulse'
            }`}
          >
            <span>
              {audioActivo
                ? '🔊 Audio TV Activo · ⛶ Pantalla Completa'
                : '🔊 Activar Audio TV y Pantalla Completa'}
            </span>
          </button>

          {/* Status Badge */}
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-4 py-1.5 backdrop-blur-md shadow-lg shadow-emerald-950/50">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-bold tracking-wider text-emerald-300 uppercase">
              SALA ACTIVA
            </span>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ Main Grid Layout (Left QR / Right Ranking) */}
      <div className="relative z-10 my-4 grid gap-5 lg:grid-cols-12 lg:items-start">
        
        {/* ============================================== LEFT COLUMN: QR & JOIN UX */}
        <div className="flex flex-col items-center justify-center rounded-3xl border border-purple-500/25 bg-purple-950/20 p-4 text-center shadow-xl backdrop-blur-md lg:col-span-7">
          
          {/* Eyebrow & Title */}
          <div className="mb-4">
            <span className="inline-block rounded-full bg-purple-500/20 px-4 py-1 text-xs font-bold tracking-widest text-purple-300 uppercase border border-purple-400/30 mb-2">
              ÚNETE AL KARAOKE
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Escanea el QR con tu celular
            </h2>
          </div>

          {/* Large Padded QR Frame */}
          <div className="my-2 inline-block rounded-3xl bg-white p-3 shadow-2xl shadow-purple-500/20 border-4 border-purple-300/20 transition-transform duration-300 hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt={`Código QR para unirse a la sala ${code}`}
              width={192}
              height={192}
              className="rounded-2xl"
            />
          </div>

          {/* Room Code Container */}
          <div className="mt-4 w-full max-w-sm rounded-2xl border border-purple-500/30 bg-purple-950/60 p-3 shadow-inner">
            <p className="text-[11px] font-bold tracking-widest text-purple-300 uppercase">
              Código de Sala
            </p>
            <p className="mt-0.5 font-mono text-4xl font-black tracking-[0.35em] text-amber-300 drop-shadow-md">
              {code}
            </p>
          </div>

          {/* UX Step Instruction */}
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-pink-500/30 bg-gradient-to-r from-pink-950/40 via-purple-950/50 to-pink-950/40 px-5 py-3 text-pink-200 shadow-lg">
            <span className="text-2xl">📱</span>
            <div className="text-left">
              <p className="text-sm font-extrabold text-white">
                Elige una canción y agrégala a la cola
              </p>
              <p className="text-xs text-pink-200/80">
                Tu celular es tu control remoto. ¡Sin descargar ninguna aplicación!
              </p>
            </div>
          </div>

          {/* Subtle URL */}
          <p className="mt-4 text-xs font-mono text-purple-300/50">
            O entra en el navegador: <span className="underline text-purple-300/80">{enlace}</span>
          </p>
        </div>

        {/* ============================================== RIGHT COLUMN: RANKING DE LA NOCHE */}
        <div className="flex flex-col rounded-3xl border border-amber-500/30 bg-purple-950/30 p-5 shadow-xl backdrop-blur-md lg:col-span-5">
          
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-purple-800/40 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <h3 className="text-xl font-black tracking-wide text-white uppercase">
                  Ranking de esta Sala
                </h3>
              </div>
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-400/30">
                HOY
              </span>
            </div>

            {/* Ranking List */}
            {ranking.length > 0 ? (
              <ol className="space-y-2.5">
                {ranking.slice(0, 6).map((f) => {
                  const esTop1 = f.posicion === 1;
                  const esTop2 = f.posicion === 2;
                  const esTop3 = f.posicion === 3;

                  return (
                    <li
                      key={f.participant_id}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 border transition-all ${
                        esTop1
                          ? 'bg-gradient-to-r from-amber-500/25 via-yellow-500/15 to-purple-950/50 border-amber-400/60 text-amber-100 shadow-lg shadow-amber-500/10'
                          : esTop2
                          ? 'bg-gradient-to-r from-slate-400/20 to-purple-950/40 border-slate-300/40 text-slate-100'
                          : esTop3
                          ? 'bg-gradient-to-r from-amber-700/20 to-purple-950/40 border-amber-600/40 text-amber-200'
                          : 'bg-purple-950/40 border-purple-500/20 text-purple-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Position Avatar Badge */}
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-black text-sm shadow-md ${
                            esTop1
                              ? 'bg-amber-400 text-purple-950 ring-2 ring-amber-300'
                              : esTop2
                              ? 'bg-slate-300 text-purple-950'
                              : esTop3
                              ? 'bg-amber-600 text-white'
                              : 'bg-purple-900/60 text-purple-300 border border-purple-700/40'
                          }`}
                        >
                          {esTop1 ? '🥇' : esTop2 ? '🥈' : esTop3 ? '🥉' : `#${f.posicion}`}
                        </div>

                        {/* Participant Name */}
                        <span className="truncate font-extrabold text-base text-white">
                          {f.nickname}
                        </span>
                      </div>

                      {/* Score Badge */}
                      <div className="flex items-center gap-1 shrink-0 rounded-full bg-purple-900/60 px-3 py-1 border border-purple-500/30">
                        <span className="font-black text-base tabular-nums text-amber-300">
                          {f.mejor}
                        </span>
                        <span className="text-[11px] font-bold text-purple-300 uppercase">
                          pts
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              /* Empty State */
              <div className="my-auto flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-3 text-5xl animate-bounce">🎤</div>
                <p className="text-lg font-bold text-purple-200">
                  ¡La pista está libre!
                </p>
                <p className="mt-1 max-w-xs text-xs text-purple-300/70">
                  Sé el primero en escanear el QR con tu celular, cantar una canción y adueñarte del puesto #1 del ranking.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          <div className="mt-4 border-t border-purple-800/30 pt-3 text-center">
            <p className="text-xs text-purple-300/60">
              💡 Puntuación recreativa: cuenta cuánto cantaste, las interrupciones y los aplausos.
            </p>
          </div>

        </div>

      </div>

      {/* ------------------------------------------------ Footer Bar */}
      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-purple-800/30 pt-3 text-xs text-purple-300/60">
        <span>© KARYOU Karaoke · Diversión garantizada</span>
        <span>Conecta cualquier teléfono inteligente · No requiere apps</span>
      </footer>
    </div>
  );
}
