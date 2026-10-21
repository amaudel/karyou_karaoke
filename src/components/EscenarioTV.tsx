'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import KaraokeStage, { type CancionEnEscenario, type Telemetria } from './KaraokeStage';
import PanelTV from './PanelTV';
import AnimacionResultado from './AnimacionResultado';
import { despertar } from '@/lib/sonido.mjs';
import type { EstadoVista, ResultadoVista, FilaRankingVista, FilaMesaVista } from '@/app/sala/tipos';

/** Segundos tras los cuales la TV salta sola un turno desatendido en Modo Bar si hay cola detrás. */
const SEGUNDOS_AUTOSALTO_TV_BAR = 75;

/**
 * Coordina la pantalla: el reproductor, el panel y la revelación del resultado.
 *
 * Existe porque decidir CUÁNDO se muestra la animación es estado de cliente: el
 * servidor manda el resultado y su antigüedad, pero la secuencia dura unos segundos
 * y termina cuando termina, no cuando llega el siguiente sondeo.
 *
 * La nota que se celebra es SIEMPRE la que calculó y guardó el servidor. Aquí no se
 * puntúa nada: en cuanto el vídeo termina se cierra el turno (la Server Action
 * re-renderiza la página sola) y el resultado llega por props para animarlo.
 */
export default function EscenarioTV({
  code,
  cancion,
  estado,
  resultado,
  resultadoReciente,
  ranking,
  rankingMesas,
  aplausos,
  oyentes,
  qr,
  enlace,
  onCantar,
  onTerminar,
  onDescartar,
}: {
  code: string;
  cancion: CancionEnEscenario;
  estado: EstadoVista;
  resultado: ResultadoVista | null;
  resultadoReciente: boolean;
  ranking: FilaRankingVista[];
  rankingMesas: FilaMesaVista[];
  aplausos: number;
  oyentes: number;
  qr: string;
  enlace: string;
  onCantar?: () => void;
  onTerminar?: (telemetria: Telemetria) => void;
  onDescartar?: () => void;
}) {
  const [mostrando, setMostrando] = useState(false);
  const [audioListo, setAudioListo] = useState(false);

  /** El último resultado ya revelado, para no repetirlo en cada sondeo. */
  const reveladoRef = useRef<number | null>(null);
  /** Último turno ausente saltado automáticamente en Modo Bar. */
  const autoSaltadoRef = useRef<number | null>(null);

  const reproduciendoRemoto = Boolean(
    cancion && estado.sonando && estado.sonando.video_id === cancion.videoId,
  );

  useEffect(() => {
    if (!resultado || !resultadoReciente) return;
    if (reveladoRef.current === resultado.id) return;

    reveladoRef.current = resultado.id;
    setMostrando(true);
    // La dependencia es el ID, no el objeto: el sondeo trae un objeto nuevo con el
    // mismo contenido cada 2 segundos y relanzaría el efecto sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.id, resultadoReciente]);

  // Mejora 2: Si el siguiente cantante le da Play desde su celular mientras sigue la
  // animación de puntaje del turno anterior, cerramos la animación al instante para no
  // tapar el video mientras ya está sonando.
  useEffect(() => {
    if (reproduciendoRemoto && mostrando) {
      setMostrando(false);
    }
  }, [reproduciendoRemoto, mostrando]);

  // Mejora 4 (TV): En Modo Bar, si un cliente lleva 75s sin darle Play y hay más
  // personas esperando detrás en la cola, la TV pasa automáticamente al siguiente turno.
  useEffect(() => {
    if (estado.modo !== 'bar') return;
    if (estado.sonando) return;
    const primero = estado.esperando[0];
    if (!primero || estado.esperando.length < 2) return;
    if (estado.segundosEnPantalla < SEGUNDOS_AUTOSALTO_TV_BAR) return;
    if (autoSaltadoRef.current === primero.id) return;

    autoSaltadoRef.current = primero.id;
    onDescartar?.();
  }, [
    estado.modo,
    estado.sonando,
    estado.esperando,
    estado.segundosEnPantalla,
    onDescartar,
  ]);

  const activarTV = useCallback(() => {
    despertar();
    setAudioListo(true);
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {
      // Algunos navegadores de Smart TV no soportan Fullscreen API.
    }
  }, []);

  const manejarCantar = useCallback(() => {
    setMostrando(false);
    setAudioListo(true);
    onCantar?.();
  }, [onCantar]);

  return (
    <KaraokeStage
      cancion={cancion}
      reproduciendoRemoto={reproduciendoRemoto}
      onCantar={onCantar ? manejarCantar : undefined}
      onTerminar={onTerminar}
      onDescartar={onDescartar}
      reemplazo={
        mostrando && resultado ? (
          <AnimacionResultado
            resultado={resultado}
            ranking={ranking}
            aplausos={aplausos}
            onFin={() => setMostrando(false)}
          />
        ) : null
      }
      panel={
        <PanelTV
          code={code}
          modo={estado.modo}
          segundosEnPantalla={estado.segundosEnPantalla}
          sonando={estado.sonando}
          esperando={estado.esperando}
          aplausos={aplausos}
          oyentes={oyentes}
          ranking={ranking}
          rankingMesas={rankingMesas}
          qr={qr}
          enlace={enlace}
          onDescartar={onDescartar}
          onActivarTV={activarTV}
        />
      }
    />
  );
}
