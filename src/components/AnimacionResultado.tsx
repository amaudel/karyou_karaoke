'use client';

import { useEffect, useRef, useState } from 'react';
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
    <section className="karyou-score-screen relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#130923] via-[#1c0d36] to-[#080414] text-center text-white" aria-label="Resultado de karaoke">
      <div aria-hidden="true" className="karyou-score-glow pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(168,85,247,0.22),transparent_65%)]" />
      {revelado && resultado?.total === 100 && <div aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-xl border-4 border-amber-300/60" />}
      {revelado && (resultado?.tier === 'exceptional' || resultado?.tier === 'excellent') && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="animar-confeti absolute text-base"
              style={{ left: `${(i * 17 + 5) % 95}%`, top: '-18px', animationDelay: `${i * 120}ms` }}>
              {['✦', '★', '🎉', '✧'][i % 4]}
            </span>
          ))}
        </div>
      )}
      <div className="karyou-score-content relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center gap-[clamp(3px,1.2cqh,10px)] px-[clamp(8px,2cqw,24px)] py-[clamp(5px,1.3cqh,14px)]">
        <div className="w-full min-w-0 shrink-0">
          <p className="text-[clamp(9px,1.65cqh,12px)] font-black uppercase tracking-[0.15em] text-amber-300">
            {esRevancha && revelado ? '🔥 RESULTADO DE LA REVANCHA' : (resultado?.tier ? BADGE_TIER[resultado.tier] : '🎙️ TU MOMENTO EN EL ESCENARIO')}
          </p>
          <h2 className="mt-0.5 truncate text-[clamp(19px,5cqh,39px)] font-black leading-tight tracking-tight" title={resultado?.nickname ?? 'Cantante'}>
            {resultado?.nickname ?? 'Cantante'}
          </h2>
          {resultado?.mesa && <p className="text-[clamp(10px,1.8cqh,13px)] font-bold text-amber-200">🪑 {resultado.mesa}</p>}
          <p className="mx-auto max-w-[92%] truncate text-[clamp(10px,1.95cqh,14px)] text-purple-200/80" title={`${resultado?.song_title ?? 'Canción'} · ${resultado?.artist ?? 'Artista'}`}>
            🎵 {resultado?.song_title ?? 'Canción'} · {resultado?.artist ?? 'Artista'}
          </p>
        </div>

        {!revelado ? (
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <div className="flex h-12 items-end gap-1.5" aria-hidden="true">
              {[1,2,3,4,3,2,1,4,2,3].map((eq, i) => <span key={i} className={`w-2 rounded-t bg-pink-400 animar-eq-${eq}`} style={{ animationDelay: `${i * 75}ms` }} />)}
            </div>
            <p className="text-[clamp(13px,2.5cqh,19px)] font-bold text-purple-200">{FRASES[frase]}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-purple-950/80"><div className="animar-progreso h-full rounded-full bg-gradient-to-r from-purple-500 to-amber-300" /></div>
            {aplausos > 0 && <p className="text-sm text-amber-300">👏 {aplausos} aplausos</p>}
          </div>
        ) : (
          <>
            <div className="grid w-full max-w-[490px] shrink-0 grid-cols-3 gap-[clamp(4px,1.3cqw,12px)]">
              {[
                { nombre: 'Ritmo', valor: resultado.rhythm, icono: '🥁' },
                { nombre: 'Energía', valor: resultado.energy, icono: '⚡' },
                { nombre: 'Interpretación', valor: resultado.interpretation, icono: '🎭' },
              ].map((item) => (
                <div key={item.nombre} className="rounded-xl border border-purple-400/25 bg-purple-900/35 px-1 py-[clamp(3px,0.9cqh,9px)]">
                  <p className="text-[clamp(12px,2.2cqh,18px)]" aria-hidden="true">{item.icono}</p>
                  <p className="text-[clamp(8px,1.55cqh,11px)] font-black uppercase tracking-wide text-purple-200">{item.nombre}</p>
                  <p className="text-[clamp(17px,4cqh,29px)] font-black leading-tight tabular-nums">{item.valor}</p>
                </div>
              ))}
            </div>

            <div className="flex min-h-0 shrink-0 flex-col items-center justify-center">
              <p className="text-[clamp(8px,1.55cqh,11px)] font-bold uppercase tracking-[0.22em] text-purple-300">Puntuación final</p>
              <p aria-live="polite" className={`karyou-score-number bg-gradient-to-b ${colorGradiente} bg-clip-text text-[clamp(56px,15cqh,114px)] font-black leading-none text-transparent tabular-nums ${fase === 'total' || fase === 'mensaje' ? 'karyou-score-reveal' : ''}`}>
                {fase === 'subpuntajes' ? '—' : fase === 'mensaje' ? resultado.total : contador}
              </p>
            </div>

            {(fase === 'total' || fase === 'mensaje') && (
              <div className="flex w-full min-w-0 max-w-[94%] shrink-0 flex-col items-center gap-[clamp(2px,0.5cqh,6px)]">
                <p className="text-balance text-[clamp(13px,3.1cqh,23px)] font-black leading-tight text-amber-200">
                  {resultado.total === 100 ? '👑 ¡LEYENDA DEL KARAOKE!' : resultado.total === 99 ? '🏆 ¡ACTUACIÓN EXTRAORDINARIA!' : MENSAJES[resultado.tier] ?? '🎤 ¡SIGUE CANTANDO!'}
                </p>
                {fase === 'mensaje' && diferencia !== null && (
                  <p className="rounded-full border border-orange-400/40 bg-orange-950/50 px-3 py-1 text-[clamp(10px,1.9cqh,14px)] font-black text-orange-100">
                    {resultado.revanchaAnterior} → {resultado.total} · {diferencia > 0 ? `¡SUBISTE ${diferencia}!` : diferencia === 0 ? '¡EMPATE!' : '¡SIGUE LA FIESTA!'}
                  </p>
                )}
                {fase === 'mensaje' && mio && (
                  <p className="text-[clamp(10px,1.85cqh,13px)] font-bold text-purple-200">
                    🏆 {mio.posicion === 1 ? '¡NUEVO #1 EN EL RANKING!' : `PUESTO #${mio.posicion} DE LA NOCHE`}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
