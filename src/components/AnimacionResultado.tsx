'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { tic, revelar, resultado as sonidoResultado } from '@/lib/sonido.mjs';
import type { ResultadoVista, FilaRankingVista } from '@/app/sala/tipos';

const FRASES = [
  '🎙️ Preparando el resultado recreativo…',
  '🎵 Sumando las señales del show…',
  '👏 Contando los aplausos de la sala…',
  '⭐ Calculando tu puntaje…',
];

const MENSAJES: Record<string, string> = {
  under: '🔥 ¡ESTO MERECE UNA REVANCHA!',
  normal: '🎤 ¡BUEN INTENTO, SIGUE BRILLANDO!',
  good: '👏 ¡GRAN PRESENTACIÓN!',
  excellent: '🌟 ¡TE LUCISTE EN EL ESCENARIO!',
  exceptional: '🏆 ¡ACTUACIÓN EXTRAORDINARIA!',
};

const COLOR_TIER: Record<string, string> = {
  under: 'from-gray-400 to-slate-200 text-gray-300',
  normal: 'from-blue-400 to-cyan-200 text-cyan-300',
  good: 'from-emerald-400 to-teal-200 text-emerald-400',
  excellent: 'from-purple-400 to-pink-300 text-purple-300',
  exceptional: 'from-amber-300 via-yellow-200 to-amber-500 text-amber-300',
};

const BADGE_TIER: Record<string, string> = {
  exceptional: '🔥 ÍDOLO DEL KARAOKE 🔥',
  excellent: '🌟 ESTRELLA DE LA NOCHE 🌟',
  good: '🎉 GRAN SHOWMAN 🎉',
  normal: '🎤 BUEN INTENTO 🎤',
  under: '🎶 ÁNIMO CANTANTE 🎶',
};

/** Los cuatro tramos, en milisegundos. Inicio rápido (~0.5s) y celebración final extendida (~4.5s). */
const TIEMPOS = { analisis: 650, subpuntajes: 900, total: 1400, mensaje: 2200 };

type Fase = 'analizando' | 'subpuntajes' | 'total' | 'mensaje';

export default function AnimacionResultado({
  resultado,
  ranking,
  aplausos,
  onFin,
}: {
  resultado: ResultadoVista | null;
  ranking: FilaRankingVista[];
  aplausos: number;
  onFin: () => void;
}) {
  const [fase, setFase] = useState<Fase>('analizando');
  const [frase, setFrase] = useState(0);
  const [contador, setContador] = useState(0);

  const alFinRef = useRef(onFin);
  useEffect(() => {
    alFinRef.current = onFin;
  }, [onFin]);

  /* ------------------------------------------------------------- los tramos */

  useEffect(() => {
    const temporizadores: number[] = [];
    let acumulado = TIEMPOS.analisis;
    temporizadores.push(window.setTimeout(() => setFase('subpuntajes'), acumulado));
    acumulado += TIEMPOS.subpuntajes;
    temporizadores.push(window.setTimeout(() => setFase('total'), acumulado));
    acumulado += TIEMPOS.total;
    temporizadores.push(window.setTimeout(() => setFase('mensaje'), acumulado));
    acumulado += TIEMPOS.mensaje;
    temporizadores.push(window.setTimeout(() => alFinRef.current(), acumulado));

    return () => temporizadores.forEach((id) => window.clearTimeout(id));
  }, []);

  /** Las frases del análisis, con un chasquido en cada una. */
  useEffect(() => {
    if (fase !== 'analizando') return;
    tic();
    const id = window.setInterval(() => {
      setFrase((f) => (f + 1) % FRASES.length);
      tic();
    }, 450);
    return () => window.clearInterval(id);
  }, [fase]);

  /** El sonido de cada tramo. */
  useEffect(() => {
    if (fase === 'subpuntajes') revelar();
    if (fase === 'total' && resultado) sonidoResultado(resultado.tier);
    // Depende del tramo y de la BANDA, no del objeto `resultado`: el sondeo manda un
    // objeto nuevo con el mismo contenido cada 2,5 s y repetiría los sonidos durante
    // toda la animación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, resultado?.tier]);

  /** El contador sube hasta el total con desaceleración. */
  useEffect(() => {
    const total = resultado?.total;
    if (total === undefined) return;
    if (fase !== 'total' && fase !== 'mensaje') return;
    const inicio = performance.now();
    const duracion = TIEMPOS.total * 0.8;
    let raf = 0;

    const paso = (ahora: number) => {
      const t = Math.min(1, Math.max(0, (ahora - inicio) / duracion));
      setContador(Math.round(total * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);

    const seguro = window.setTimeout(() => setContador(total), duracion + 40);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(seguro);
    };
    // Depende del ID del resultado, no del objeto: con el objeto, cada sondeo
    // reiniciaba `inicio` y el contador volvía a 0 a mitad de la animación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, resultado?.id]);

  const colorGradiente = resultado ? COLOR_TIER[resultado.tier] ?? 'from-purple-400 to-indigo-200 text-purple-300' : 'from-purple-400 to-indigo-200 text-purple-300';
  const mio = resultado ? ranking.find((r) => r.participant_id === resultado.participant_id) : undefined;
  const revelado = fase !== 'analizando' && resultado !== null;
  const esTop = Boolean(mio && mio.posicion <= 3);
  const esRevancha = (() => { try { return JSON.parse(resultado?.detail || '{}').perfil === 'revancha'; } catch { return false; } })();
  const diferencia = esRevancha && typeof resultado?.revanchaAnterior === 'number'
    ? resultado.total - resultado.revanchaAnterior : null;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0618] via-[#120b29] to-[#080312] px-8 py-6 text-center select-none">
      
      {resultado?.total === 100 && revelado && <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-[10px] border-amber-300/50 animate-pulse" />}
      {/* ------------------------------------------------ Luces de Escenario / Disco */}
      <div className="animar-disco pointer-events-none absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-purple-600/20 via-pink-500/10 to-transparent blur-3xl" />
      <div className="animar-disco pointer-events-none absolute -right-40 -bottom-40 h-[600px] w-[600px] rounded-full bg-gradient-to-tl from-amber-500/20 via-indigo-600/10 to-transparent blur-3xl" style={{ animationDirection: 'reverse' }} />
      
      {/* Confeti Flotante */}
      {revelado && (resultado.tier === 'exceptional' || resultado.tier === 'excellent' || esTop) && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="animar-confeti absolute text-xl"
              style={{
                left: `${(i * 6.5) % 100}%`,
                top: `-20px`,
                animationDelay: `${(i % 5) * 350}ms`,
                animationDuration: `${2.5 + (i % 3) * 0.5}s`,
              }}
            >
              {['🎉', '✨', '⭐', '🎤', '🔥', '🎵', '💫'][i % 7]}
            </div>
          ))}
        </div>
      )}

      {esRevancha && revelado && (
        <div className="relative z-10 mb-3 rounded-full border-2 border-orange-300/70 bg-orange-950/60 px-6 py-2 text-lg font-black text-amber-200 animar-score-pop">
          🔥 ¡RESULTADO DE LA REVANCHA!
        </div>
      )}
      {/* ------------------------------------------------ Cabecera del Cantante */}
      <div className="relative z-10 max-w-2xl">
        <div className="inline-block rounded-full bg-purple-950/60 px-4 py-1 border border-purple-500/30 text-xs font-semibold tracking-widest text-purple-300 uppercase shadow-lg shadow-purple-900/20 mb-2">
          {resultado?.tier ? (BADGE_TIER[resultado.tier] ?? 'RESULTADO DEL SHOW') : 'CALCULANDO RESULTADO…'}
        </div>
        
        <h2 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-md sm:text-5xl">
          {resultado?.nickname ?? 'Cantante'}
        </h2>
        
        {resultado?.mesa && <p className="mt-1 text-sm font-bold text-amber-300">🪑 {resultado.mesa}</p>}
        <p className="mt-1 truncate text-base text-purple-200/70">
          🎵 <span className="font-semibold text-purple-100">{resultado?.song_title ?? 'Canción'}</span> · {resultado?.artist ?? 'Artista'}
        </p>
      </div>

      {/* ------------------------------------------------ Fase 1: Analizando con Ecualizador */}
      {!revelado && (
        <div className="relative z-10 mt-8 w-full max-w-lg flex flex-col items-center">
          
          {/* Ecualizador Gráfico Animado */}
          <div className="flex h-16 items-end justify-center gap-2 mb-6 px-4 py-2 rounded-xl bg-purple-950/30 border border-purple-800/20 backdrop-blur-md">
            {[1, 2, 3, 4, 3, 2, 1, 4, 2, 3, 1, 4].map((eqClass, i) => (
              <div
                key={i}
                className={`w-2.5 rounded-t-sm bg-gradient-to-t from-purple-600 via-pink-500 to-amber-400 animar-eq-${eqClass}`}
                style={{ animationDelay: `${i * 75}ms` }}
              />
            ))}
          </div>

          <p aria-live="polite" className="text-xl font-medium tracking-wide text-purple-200 animate-pulse">
            {FRASES[frase]}
          </p>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-purple-950/80 border border-purple-700/30 p-0.5">
            <div className="animar-progreso h-full w-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 shadow-lg shadow-pink-500/50" />
          </div>

          {aplausos > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-1.5 border border-amber-400/30 text-amber-300 text-sm font-semibold animate-bounce">
              <span>👏</span>
              <span>¡{aplausos} {aplausos === 1 ? 'persona ovacionó el show!' : 'personas ovacionaron el show!'}</span>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Fase 2 y 3: Revelación Épica */}
      {revelado && (
        <div className="relative z-10 mt-6 flex flex-col items-center">
          
          {/* Subpuntajes Tarjetas Neón */}
          <div className="flex justify-center gap-6 sm:gap-8">
            {[
              { nombre: 'Ritmo', valor: resultado.rhythm, icono: '🥁', retardo: 0 },
              { nombre: 'Energía', valor: resultado.energy, icono: '⚡', retardo: 200 },
              { nombre: 'Interpretación', valor: resultado.interpretation, icono: '🎭', retardo: 400 },
            ].map((m) => (
              <div
                key={m.nombre}
                className="animar-aparecer flex flex-col items-center rounded-2xl bg-purple-950/40 border border-purple-500/25 px-5 py-3 shadow-xl backdrop-blur-md min-w-[100px]"
                style={{ animationDelay: `${m.retardo}ms` }}
              >
                <span className="text-lg mb-0.5">{m.icono}</span>
                <p className="text-[11px] font-bold tracking-wider text-purple-300 uppercase">
                  {m.nombre}
                </p>
                <p className="mt-1 text-3xl font-black text-white tabular-nums">{m.valor}</p>
              </div>
            ))}
          </div>

          {/* Gran Revelación del Puntaje Principal */}
          <div className="relative mt-6 flex flex-col items-center">
            
            {/* Trofeo de Galardón para TOP 3 o High Tier */}
            {esTop && (
              <div className="animar-aparecer mb-1 flex items-center justify-center">
                <Image
                  src="/images/trophy.jpg"
                  alt="Trofeo Karaoke"
                  width={110}
                  height={110}
                  className="rounded-full border-2 border-amber-400/80 shadow-2xl shadow-amber-500/40 object-cover"
                />
              </div>
            )}

            <p className="text-xs font-bold tracking-[0.35em] text-purple-300/80 uppercase mb-1">
              PUNTUACIÓN FINAL
            </p>

            {/* Número Gigante Estilo Neón */}
            <div className="relative">
              <p className={`text-[6rem] sm:text-[7rem] leading-none font-black tabular-nums bg-gradient-to-b ${colorGradiente} bg-clip-text text-transparent animar-neon ${fase === 'total' || fase === 'mensaje' ? 'animar-score-pop' : ''}`}>
                {fase === 'subpuntajes' ? '—' : fase === 'mensaje' ? resultado.total : contador}
              </p>
            </div>

            {/* Mensaje de Logro y Posición en Ranking */}
            {(fase === 'total' || fase === 'mensaje') && (
              <div className="animar-aparecer mt-3 flex flex-col items-center">
                <p className={`text-3xl font-black tracking-wide bg-gradient-to-r ${colorGradiente} bg-clip-text text-transparent drop-shadow-lg`}>
                  {resultado.total === 100 ? '👑 ¡LEYENDA DEL KARAOKE!' : resultado.total === 99 ? '🏆 ¡ACTUACIÓN EXTRAORDINARIA!' : MENSAJES[resultado.tier] ?? ''}
                </p>
                
                {fase === 'mensaje' && diferencia !== null && (
                  <div className="mt-3 rounded-xl border border-orange-400/50 bg-orange-950/50 px-5 py-2 text-base font-black text-orange-100">
                    {resultado.revanchaAnterior} → {resultado.total} puntos · {diferencia > 0 ? `¡SUBISTE ${diferencia}!` : diferencia === 0 ? '¡EMPATE!' : '¡SIGUE LA FIESTA!'}
                  </div>
                )}
                {fase === 'mensaje' && mio && (
                  <div className="mt-3 flex items-center gap-2 rounded-full bg-amber-500/20 px-5 py-2 border border-amber-400/40 text-amber-200 font-extrabold text-base shadow-lg shadow-amber-900/30">
                    <span>🏆</span>
                    <span>
                      {mio.posicion === 1
                        ? '¡NUEVO #1 EN EL RANKING!'
                        : `PUESTO #${mio.posicion} DE LA NOCHE`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

