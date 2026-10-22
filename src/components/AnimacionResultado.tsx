'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ParticulasResultado from './ParticulasResultado';
import { letraArcade } from '@/domain/scoring/rangos-visuales.mjs';
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

/** 8.7 segundos de espectáculo; se interrumpe si comienza la siguiente canción. */
const TIEMPOS = { analisis: 1400, subpuntajes: 1800, total: 2300, mensaje: 3200 };

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
  const [barrasVisibles, setBarrasVisibles] = useState(false);

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
    }, 650);
    return () => window.clearInterval(id);
  }, [fase]);

  // Animar las métricas una sola vez al entrar al tramo (sin valores inventados).
  useEffect(() => {
    if (fase !== 'subpuntajes') return;
    const id = window.setTimeout(() => setBarrasVisibles(true), 50);
    return () => window.clearTimeout(id);
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

  /** Ticks discretos durante el conteo: la biblioteca de sonidos ya gestiona
   * el desbloqueo de audio. No añadimos un segundo AudioContext ni CDN. */
  useEffect(() => {
    if (fase !== 'total') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let veces = 0;
    const id = window.setInterval(() => {
      if (++veces <= 8) tic();
    }, 275);
    return () => window.clearInterval(id);
  }, [fase]);

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
  const insignia = letraArcade(resultado?.total ?? 0);
  const diferencia = esRevancha && typeof resultado?.revanchaAnterior === 'number'
    ? resultado.total - resultado.revanchaAnterior : null;


  return (
    <section className="karyou-score-screen karyou-score-showcase" aria-label="Resultado de karaoke">
      <div className="karyou-showcase-glow" aria-hidden="true" />
      {fase === "mensaje" && resultado && <ParticulasResultado total={resultado.total} />}
      {fase === 'mensaje' && (resultado?.total ?? 0) >= 90 && (
        <div className="karyou-showcase-sparks karyou-particles-photo" aria-hidden="true">
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
                  <div className="karyou-arcade-stat"><p>{item.nombre}</p><strong>{item.valor}</strong><div className="karyou-arcade-bar" aria-hidden="true"><span style={{ width: barrasVisibles ? `${Math.max(0, Math.min(100, item.valor))}%` : '0%' }} /></div></div>
                </div>
              ))}
            </div>
            <div className="karyou-showcase-award" aria-hidden="true">
              <div className="karyou-award-aura" />
              <Image
                className="karyou-award-art"
                src="/images/karyou/trofeo-microfono.webp"
                alt=""
                width={819}
                height={821}
                priority
              />
              <Image
                className="karyou-award-podium"
                src="/images/karyou/podio.webp"
                alt=""
                width={965}
                height={417}
              />
            </div>
            <div className="karyou-showcase-main-score">
              <p>PUNTUACIÓN FINAL</p>
              <strong aria-live="polite" className={`bg-gradient-to-b ${colorGradiente} bg-clip-text text-transparent ${fase === 'total' || fase === 'mensaje' ? 'karyou-score-reveal' : ''}`}>
                {fase === 'subpuntajes' ? '—' : fase === 'mensaje' ? resultado.total : contador}
              </strong>
              <span>{fase === 'subpuntajes' ? 'PREPARANDO LA NOTA' : (BADGE_TIER[resultado.tier] ?? '¡A SEGUIR CANTANDO!')}</span>
              {fase === 'mensaje' && (
                <div className={`karyou-rank-seal karyou-rank-seal-${insignia}`} aria-label={`Sello de rango ${insignia}`}>
                  <span className="karyou-rank-seal-rays" aria-hidden="true" />
                  <span className="karyou-rank-seal-ring">
                    <span className="karyou-rank-seal-crown" aria-hidden="true">♛</span>
                    <span className="karyou-rank-seal-title">RANGO</span>
                    <span className="karyou-rank-seal-letter">{insignia}</span>
                    <span className="karyou-rank-seal-laurels" aria-hidden="true">❧ ✦ ❧</span>
                  </span>
                </div>
              )}
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
