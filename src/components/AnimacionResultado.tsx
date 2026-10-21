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
  const esRevancha = (() => { try { return JSON.parse(resultado?.detail || '{}').perfil === 'revancha'; } catch { return false; } })();
  const diferencia = esRevancha && typeof resultado?.revanchaAnterior === 'number'
    ? resultado.total - resultado.revanchaAnterior : null;


  return (
    <section className="karyou-score-screen karyou-score-showcase" aria-label="Resultado de karaoke">
      <div className="karyou-showcase-glow" aria-hidden="true" />
      {revelado && resultado?.total >= 90 && (
        <div className="karyou-showcase-sparks" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="animar-confeti" style={{ left: `${(i * 17 + 7) % 95}%`, animationDelay: `${i * 110}ms` }}>
              {['✦', '★', '🎉', '✧'][i % 4]}
            </span>
          ))}
        </div>
      )}

      <header className="karyou-showcase-header">
        <div className="karyou-showcase-overline">
          {esRevancha && revelado ? '🔥 LA REVANCHA' : '★ KARYOU · KARAOKE PARTY'}
        </div>
        <h2 title={resultado?.nickname ?? 'Cantante'}>{resultado?.nickname ?? 'Cantante'}</h2>
        <p className="karyou-showcase-song" title={`${resultado?.song_title ?? 'Canción'} · ${resultado?.artist ?? 'Artista'}`}>
          🎵 {resultado?.song_title ?? 'Canción'} · {resultado?.artist ?? 'Artista'}
          {resultado?.mesa ? `  ·  🪑 ${resultado.mesa}` : ''}
        </p>
      </header>

      {!revelado ? (
        <div className="karyou-showcase-analysis">
          <div className="karyou-showcase-equalizer" aria-hidden="true">
            {[1,2,3,4,3,2,1,4,2,3,1,4].map((eq,i) => (
              <span key={i} className={`animar-eq-${eq}`} style={{ animationDelay: `${i * 70}ms` }} />
            ))}
          </div>
          <p>{FRASES[frase]}</p>
          <div className="karyou-showcase-progress"><div className="animar-progreso" /></div>
          {aplausos > 0 && <p className="karyou-showcase-cheers">👏 {aplausos} aplausos</p>}
        </div>
      ) : (
        <>
          <div className="karyou-showcase-stage">
            <div className="karyou-showcase-metrics" aria-label="Indicadores recreativos">
              {[
                { nombre:'RITMO', valor:resultado.rhythm, icono:'🥁' },
                { nombre:'ENERGÍA', valor:resultado.energy, icono:'⚡' },
                { nombre:'INTERPRETACIÓN', valor:resultado.interpretation, icono:'🎭' },
              ].map(item => (
                <div className="karyou-showcase-metric" key={item.nombre}>
                  <span aria-hidden="true">{item.icono}</span>
                  <div><p>{item.nombre}</p><strong>{item.valor}</strong></div>
                </div>
              ))}
            </div>
            <div className="karyou-showcase-award" aria-hidden="true">
              <div className="karyou-award-aura" />
              <svg className="karyou-award-svg" viewBox="0 0 240 288" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
                <defs>
                  <linearGradient id="karyou-award-gold" x1="36" y1="20" x2="204" y2="260" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFF3AC" /><stop offset=".24" stopColor="#F59E0B" />
                    <stop offset=".56" stopColor="#FDE68A" /><stop offset=".82" stopColor="#B45309" />
                    <stop offset="1" stopColor="#FFF2B0" />
                  </linearGradient>
                  <linearGradient id="karyou-award-dark" x1="100" y1="65" x2="159" y2="183" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#4B175D" /><stop offset=".56" stopColor="#200C37" /><stop offset="1" stopColor="#6B2086" />
                  </linearGradient>
                </defs>
                <circle cx="120" cy="128" r="105" stroke="url(#karyou-award-gold)" strokeWidth="3" opacity=".7" />
                <circle cx="120" cy="128" r="93" stroke="#B94AFF" strokeWidth="2" opacity=".8" />
                <path d="M120 25l17 34 38 5-27 26 6 38-34-18-34 18 6-38-27-26 38-5 17-34Z" fill="#791CC2" fillOpacity=".42" stroke="#E879F9" strokeWidth="4" />
                <rect x="88" y="55" width="64" height="106" rx="32" fill="url(#karyou-award-gold)" />
                <rect x="94" y="61" width="52" height="92" rx="26" fill="url(#karyou-award-dark)" stroke="#FDE68A" strokeWidth="2"/>
                {Array.from({ length: 9 }, (_, i) => (
                  <path key={i} d={`M100 ${78 + i * 7} Q120 ${69 + i * 7} 140 ${78 + i * 7}`}
                    stroke="#FBBF24" strokeWidth="3.5" strokeLinecap="round" opacity=".9"/>
                ))}
                <path d="M82 126v10c0 22 17 40 38 40s38-18 38-40v-10" stroke="url(#karyou-award-gold)" strokeWidth="8" strokeLinecap="round"/>
                <path d="M120 176v39" stroke="url(#karyou-award-gold)" strokeWidth="9" strokeLinecap="round"/>
                <path d="M93 217h54" stroke="url(#karyou-award-gold)" strokeWidth="9" strokeLinecap="round"/>
                <path d="M83 230h74l13 19H70l13-19Z" fill="url(#karyou-award-gold)" />
                <path d="M59 253h122l12 20H47l12-20Z" fill="#45115D" stroke="#FBBF24" strokeWidth="4"/>
                <path d="M120 101l7 12 13 2-10 9 2 13-12-6-12 6 2-13-10-9 13-2 7-12Z" fill="#FDE68A"/>
                <path d="M29 112l4 10 10 3-10 4-4 10-4-10-10-4 10-3 4-10ZM209 79l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#FDE68A"/>
              </svg>
              <span className="karyou-award-caption">LA ESTRELLA ERES TÚ</span>
            </div>
            <div className="karyou-showcase-main-score">
              <p>PUNTUACIÓN FINAL</p>
              <strong aria-live="polite" className={`bg-gradient-to-b ${colorGradiente} bg-clip-text text-transparent ${fase === 'total' || fase === 'mensaje' ? 'karyou-score-reveal' : ''}`}>
                {fase === 'subpuntajes' ? '—' : fase === 'mensaje' ? resultado.total : contador}
              </strong>
              <span>{fase === 'subpuntajes' ? 'PREPARANDO LA NOTA' : (BADGE_TIER[resultado.tier] ?? '¡A SEGUIR CANTANDO!')}</span>
            </div>
          </div>
          <footer className="karyou-showcase-footer karyou-showcase-footer-neon">
            <p className="karyou-showcase-message">
              {fase === 'subpuntajes' ? '✨ PREPARANDO LA REVELACIÓN…' : fase === 'total' || fase === 'mensaje'
                ? resultado.total === 100 ? '👑 ¡LEYENDA DEL KARAOKE!'
                  : resultado.total === 99 ? '🏆 ¡ACTUACIÓN EXTRAORDINARIA!'
                  : MENSAJES[resultado.tier] ?? '🎤 ¡SIGUE CANTANDO!'
                : ''}
            </p>
            {fase === 'mensaje' && diferencia !== null && (
              <p className="karyou-showcase-extra">{resultado.revanchaAnterior} → {resultado.total} puntos · {diferencia > 0 ? `¡SUBISTE ${diferencia}!` : diferencia === 0 ? '¡EMPATE!' : '¡SIGUE LA FIESTA!'}</p>
            )}
            {fase === 'mensaje' && diferencia === null && mio && (
              <p className="karyou-showcase-extra">🏆 {mio.posicion === 1 ? '¡NUEVO #1 EN EL RANKING!' : `PUESTO #${mio.posicion} DE LA NOCHE`}</p>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
