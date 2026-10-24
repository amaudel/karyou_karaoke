'use client';

import AnuncioBar, {type PromocionBar} from './AnuncioBar';
import Link from 'next/link';

import { useCallback, useEffect, useRef, useState } from 'react';
import AnimacionResultado from './AnimacionResultado';
import AnimacionResultadoPremium from './AnimacionResultadoPremium';
import { despertar, activarAudio } from '@/lib/sonido.mjs';
import type { ResultadoVista, FilaRankingVista, FilaMesaVista } from '@/app/sala/tipos';

/**
 * Pantalla de espera para TV comercial o familiar.
 *
 * La vista de TV ocupa el viewport completo, sin scroll. En modo bar muestra
 * Batalla de Mesas a la izquierda y QR escaneable a la derecha. En modo casa
 * sustituye la batalla por el ranking individual, sin alterar la lógica de sala.
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
  promociones = [],
  audioListo = false,
  onActivarTV,
  onInicioCelebracion,
  usarCeremoniaPremium = false,
}: {
  code: string;
  modo?: 'casa' | 'bar';
  enlace: string;
  qr: string;
  ranking: FilaRankingVista[];
  rankingMesas: FilaMesaVista[];
  resultado: ResultadoVista | null;
  resultadoReciente: boolean;
  promociones?: PromocionBar[];
  audioListo?: boolean;
  onActivarTV?: () => void;
  onInicioCelebracion?: (turnoId: number) => Promise<unknown>;
  usarCeremoniaPremium?: boolean;
}) {
  const [mostrando, setMostrando] = useState(() => Boolean(resultado && resultadoReciente));
  const [activoLocal, setActivoLocal] = useState(false);
  const audioActivo = audioListo || activoLocal;
  const reveladoRef = useRef<number | null>(null);

  const manejarActivar = useCallback(() => {
    despertar();
    activarAudio(); // El navegador ya recibió una interacción real.
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

  // El contenedor general de la web tiene padding para móviles. La pantalla
  // de espera de la TV cubre todo el viewport y no admite scroll vertical.
  useEffect(() => {
    const anteriorBody = document.body.style.overflow;
    const anteriorHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anteriorBody;
      document.documentElement.style.overflow = anteriorHtml;
    };
  }, []);

  if (mostrando && resultado) {
    return (
      <div className="mx-auto max-w-4xl">
        <div
          className="w-full overflow-hidden rounded-2xl border border-purple-500/30 bg-black shadow-2xl"
          style={{ aspectRatio: '16 / 9', minHeight: 220 }}
        >
          {usarCeremoniaPremium ? <AnimacionResultadoPremium
            key={resultado.id}
            resultado={resultado}
            patrocinio={promociones.find(p=>p.placement==='resultado') ?? null}
            onInicio={() => onInicioCelebracion?.(resultado.queue_item_id)}
            onFin={() => setMostrando(false)}
          /> : <AnimacionResultado
            resultado={resultado}
            ranking={ranking}
            aplausos={0}
            onInicio={() => onInicioCelebracion?.(resultado.queue_item_id)}
            onFin={() => setMostrando(false)}
          />}
        </div>
      </div>
    );
  }

  return (
    <div data-karyou-espera-tv="dos-columnas"
      className="fixed inset-0 z-[100] box-border grid h-screen w-screen grid-rows-[auto_minmax(0,1fr)] gap-[clamp(8px,1.6vh,18px)] overflow-hidden bg-gradient-to-br from-[#080d30] via-[#10124a] to-[#070e30] p-[clamp(10px,1.7vh,22px)] text-white select-none"
      style={{ height: '100dvh' }}>
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-0 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />

      {/* Cabecera compacta, en una sola zona, sin mover la batalla debajo del QR. */}
      <header className="relative z-10 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-blue-300/15 pb-[clamp(6px,1.1vh,12px)]">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <div className="flex h-[clamp(38px,5vw,58px)] w-[clamp(38px,5vw,58px)] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-[clamp(22px,2.6vw,33px)] shadow-lg shadow-fuchsia-500/20">
            🎤
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="text-[clamp(23px,2.4vw,36px)] font-black leading-none tracking-tight text-white">KARYOU</h1>
              <span className="text-[clamp(10px,.95vw,14px)] font-black tracking-widest text-pink-200">KARAOKE PARTY</span>
            </div>
            <p className="mt-1 text-[clamp(10px,.93vw,13px)] text-blue-100/75">Sistema de Karaoke Interactivo · Control desde Móvil</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={manejarActivar}
            className={'rounded-full border px-[clamp(9px,1vw,16px)] py-2 text-[clamp(10px,.85vw,13px)] font-extrabold uppercase transition focus-visible:outline-2 ' +
              (audioActivo
                ? 'border-emerald-400/50 bg-emerald-950/60 text-emerald-300'
                : 'border-pink-400/60 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-600/30')}>
            {audioActivo ? '🔊 Audio TV activo · ⛶ Pantalla completa' : '🔊 Activar audio TV y pantalla completa'}
          </button>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-400/50 bg-emerald-950/50 px-3 py-2 text-[clamp(10px,.85vw,13px)] font-black text-emerald-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            SALA ACTIVA
          </span>
          <span className="whitespace-nowrap rounded-full border border-blue-300/35 bg-blue-900/50 px-3 py-2 text-[clamp(10px,.85vw,13px)] font-extrabold">
            {modo === 'bar' ? '🍻 Modo Bar' : '🏠 Modo Casa'}
          </span>
          <Link href={'/sala/' + code + '/control'} target="_blank" rel="noopener noreferrer"
            className="whitespace-nowrap rounded-full border border-blue-300/35 bg-blue-900/50 px-3 py-2 text-[clamp(10px,.85vw,13px)] font-extrabold text-blue-100 hover:bg-blue-800/60">
            ⚙ Anfitrión ↗
          </Link>
        </div>
      </header>

      {/* Cada panel puede encogerse en altura; el contenido nunca crea scroll. */}
      <div className="relative z-10 grid min-h-0 min-w-0 grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] gap-[clamp(8px,1.4vw,22px)]">
        {/* Izquierda: batalla de mesas en bar, ranking individual en casa. */}
        <section aria-label={modo === 'bar' ? 'Batalla de mesas' : 'Ranking de la sala'}
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[clamp(16px,2vw,28px)] border border-purple-300/40 bg-gradient-to-br from-indigo-700/55 via-blue-900/60 to-violet-800/40 p-[clamp(12px,1.7vw,26px)] shadow-xl">
          <div className="min-w-0 shrink-0">
            <h2 className="flex items-center gap-2 text-[clamp(21px,2.5vw,37px)] font-black leading-tight tracking-tight text-amber-300">
              <span aria-hidden="true">🏆</span>
              {modo === 'bar' ? 'BATALLA DE MESAS' : 'RANKING DE LA NOCHE'}
            </h2>
            <p className="mt-2 text-[clamp(11px,1.05vw,16px)] leading-snug text-blue-100/85">
              {modo === 'bar'
                ? 'Promedio de canciones válidas · mínimo 3 para entrar al podio'
                : 'Las mejores puntuaciones de la sala'}
            </p>
          </div>

          <ol className="mt-[clamp(10px,2vh,22px)] flex min-h-0 flex-col gap-[clamp(6px,1.3vh,14px)] overflow-hidden" aria-label="Clasificación actual">
            {modo === 'bar'
              ? rankingMesas.slice(0, 4).map((fila, indice) => (
                <li key={fila.mesa.toLocaleLowerCase('es')} className="flex min-h-[clamp(60px,11vh,95px)] shrink items-center gap-3 rounded-2xl border border-blue-300/30 bg-gradient-to-r from-indigo-600/65 to-blue-600/40 px-[clamp(10px,1.3vw,18px)] py-2 shadow-inner">
                  <span aria-label={'Posición ' + (indice + 1)} className={'flex h-[clamp(34px,3.5vw,46px)] w-[clamp(34px,3.5vw,46px)] shrink-0 items-center justify-center rounded-full text-lg font-black ' +
                    (indice === 0 ? 'bg-amber-300 text-indigo-950' : indice === 1 ? 'bg-slate-200 text-indigo-950' : 'bg-indigo-300 text-indigo-950')}>
                    {indice + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[clamp(15px,1.6vw,24px)] font-black leading-tight">{fila.mesa}</p>
                    <p className="mt-1 truncate text-[clamp(10px,1vw,14px)] text-blue-100/80">
                      {fila.canciones} {fila.canciones === 1 ? 'actuación' : 'actuaciones'}{!fila.elegible && ' · Provisional'}
                    </p>
                  </div>
                  <strong className="shrink-0 rounded-xl border border-indigo-300/25 bg-indigo-950/35 px-2.5 py-2 text-[clamp(15px,1.7vw,25px)] font-black tabular-nums text-amber-300">
                    {fila.media} <span className="text-[.67em]">pts</span>
                  </strong>
                </li>
              ))
              : ranking.slice(0, 4).map((fila, indice) => (
                <li key={fila.participant_id} className="flex min-h-[clamp(60px,11vh,95px)] shrink items-center gap-3 rounded-2xl border border-blue-300/30 bg-gradient-to-r from-indigo-600/65 to-blue-600/40 px-[clamp(10px,1.3vw,18px)] py-2">
                  <span className={'flex h-[clamp(34px,3.5vw,46px)] w-[clamp(34px,3.5vw,46px)] shrink-0 items-center justify-center rounded-full text-lg font-black ' +
                    (indice === 0 ? 'bg-amber-300 text-indigo-950' : 'bg-slate-200 text-indigo-950')}>{fila.posicion}</span>
                  <span className="min-w-0 flex-1 truncate text-[clamp(15px,1.6vw,24px)] font-black">{fila.nickname}</span>
                  <strong className="shrink-0 rounded-xl bg-indigo-950/35 px-3 py-2 text-[clamp(15px,1.7vw,25px)] font-black text-amber-300">{fila.mejor} pts</strong>
                </li>
              ))}
          </ol>

          {(modo === 'bar' ? rankingMesas.length === 0 : ranking.length === 0) && (
            <div className="mt-5 rounded-2xl border border-blue-300/20 bg-indigo-900/35 p-4 text-center">
              <p className="text-lg font-extrabold">{modo === 'bar' ? '¡Que empiece la batalla!' : '¡La pista está libre!'}</p>
              <p className="mt-1 text-sm text-blue-100/75">Escanea el QR, elige una canción y participa.</p>
            </div>
          )}

          {modo === 'bar' && promociones.some(p => p.placement === 'espera') && (
            <div className="mt-auto min-h-0 shrink-0 pt-2">
              <AnuncioBar promociones={promociones} ubicacion="espera" mini />
            </div>
          )}
          <p className="mt-auto shrink-0 pt-2 text-[clamp(10px,.88vw,13px)] text-blue-100/55">
            {modo === 'bar' && rankingMesas.length > 4 ? 'Se muestran las primeras 4 mesas · ' : ''}
            Puntuación recreativa · KARYOU Karaoke Party
          </p>
        </section>

        {/* Derecha: QR y acceso, siempre visibles y escaneables a distancia. */}
        <section aria-label="Únete al karaoke" className="flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-[clamp(16px,2vw,28px)] border border-blue-400/45 bg-gradient-to-br from-blue-900/70 to-indigo-950/60 p-[clamp(10px,1.5vw,23px)] text-center shadow-xl">
          <span className="shrink-0 rounded-full border border-purple-300/50 bg-purple-600/40 px-5 py-1.5 text-[clamp(11px,1.2vw,17px)] font-black tracking-wider text-white">ÚNETE AL KARAOKE</span>
          <h2 className="mt-[clamp(8px,2vh,20px)] shrink-0 text-[clamp(20px,2.5vw,38px)] font-black leading-tight tracking-tight">
            Escanea el QR con tu celular
          </h2>
          <div className="mt-[clamp(8px,2vh,20px)] shrink min-h-0 rounded-[20px] border-4 border-white/20 bg-white p-[clamp(6px,1vw,12px)] shadow-[0_0_35px_rgba(85,142,255,.32)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={'Código QR para entrar a la sala ' + code} width={260} height={260}
              className="block aspect-square max-h-full max-w-full rounded-lg object-contain"
              style={{ width: 'min(25vw, 38vh, 300px)', height: 'auto' }} />
          </div>
          <div className="mt-[clamp(8px,1.6vh,16px)] shrink-0">
            <p className="text-[clamp(10px,.95vw,14px)] font-bold uppercase tracking-widest text-blue-200/75">Código de sala</p>
            <p className="font-mono text-[clamp(22px,2.4vw,33px)] font-black leading-tight tracking-[.15em] text-amber-300">{code}</p>
          </div>
          <p className="mt-[clamp(5px,1vh,12px)] shrink-0 text-[clamp(11px,1.1vw,16px)] leading-snug text-blue-100/85">
            Busca canciones desde tu celular y agrégalas a la cola. ¡Sin descargar apps!
          </p>
          <p className="mt-1 w-full shrink-0 truncate font-mono text-[clamp(9px,.82vw,12px)] text-blue-200/60" title={enlace}>{enlace}</p>
        </section>
      </div>
    </div>
  );
}
