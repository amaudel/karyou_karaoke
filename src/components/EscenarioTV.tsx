'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { debeRevelarResultado, nuevaCancionInterrumpeResultado } from '@/domain/tv/revelacion-resultado.mjs';
import KaraokeStage, { type CancionEnEscenario, type Telemetria } from './KaraokeStage';
import PanelTV from './PanelTV';
import EstadisticasTV from './EstadisticasTV';
import AnimacionResultado from './AnimacionResultado';
import AnimacionResultadoPremium from './AnimacionResultadoPremium';
import type {PromocionBar} from './AnuncioBar';
import { despertar, activarAudio } from '@/lib/sonido.mjs';
import CuentaRegresivaCelebracion from './CuentaRegresivaCelebracion';
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
  tieneRevancha,
  promociones = [],
  aplausos,
  oyentes,
  qr,
  enlace,
  onCantar,
  onTerminar,
  onInicioCelebracion,
  onDescartar,
  usarCeremoniaPremium = false,
}: {
  code: string;
  cancion: CancionEnEscenario;
  estado: EstadoVista;
  resultado: ResultadoVista | null;
  resultadoReciente: boolean;
  ranking: FilaRankingVista[];
  rankingMesas: FilaMesaVista[];
  tieneRevancha: boolean;
  promociones?: PromocionBar[];
  aplausos: number;
  oyentes: number;
  qr: string;
  enlace: string;
  onCantar?: () => Promise<{ok:boolean;error?:string}>;
  onTerminar?: (telemetria: Telemetria) => Promise<ResultadoVista | null>;
  onInicioCelebracion?: (turnoId: number) => Promise<unknown>;
  onDescartar?: () => void;
  usarCeremoniaPremium?: boolean;
}) {
  const router = useRouter();
  const [mostrando, setMostrando] = useState(false);
  const [audioListo, setAudioListo] = useState(false);
  // Guardar en el cliente el resultado confirmado, también con canciones en cola.
  const [resultadoActivo, setResultadoActivo] = useState<ResultadoVista | null>(null);

  /** El último resultado ya revelado, para no repetirlo en cada sondeo. */
  const reveladoRef = useRef<number | null>(null);
  /** Último turno ausente saltado automáticamente en Modo Bar. */
  const autoSaltadoRef = useRef<number | null>(null);
  const sonandoId = estado.sonando?.id ?? null;
  const sonandoIdRef = useRef(sonandoId);
  useEffect(() => { sonandoIdRef.current = sonandoId; }, [sonandoId]);

  const reproduciendoRemoto = Boolean(
    cancion && estado.sonando && estado.sonando.video_id === cancion.videoId,
  );

  // Si llega el mismo score enriquecido por router.refresh, conservar el estado
  // de la animación (no desmontarla ni iniciar de nuevo el contador).
  const puntuacionVisible = resultadoActivo?.id === resultado?.id
    ? resultado
    : resultadoActivo;

  // Ruta alternativa: cuando se cierra desde el celular o el administrador,
  // el sondeo muestra el resultado una sola vez, siempre que NO haya empezado
  // otra actuación. La cola pendiente por sí sola no bloquea la celebración.
  useEffect(() => {
    if (!debeRevelarResultado({
      resultado,
      reciente: resultadoReciente,
      ultimoMostradoId: reveladoRef.current,
      turnoSonandoId: sonandoId,
    })) return;
    if (!resultado) return;
    reveladoRef.current = resultado.id;
    setResultadoActivo(resultado);
    setMostrando(true);
    // Mantener dependencias primitivas: el sondeo recibe objetos nuevos cada 2 s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.id, resultadoReciente, sonandoId]);

  // Solo un turno DISTINTO que ya empezó puede cancelar la celebración.
  // El estado tardío 'singing' del mismo turno que acaba de terminar NO la oculta.
  useEffect(() => {
    if (mostrando && nuevaCancionInterrumpeResultado({
      resultadoActivo: puntuacionVisible,
      turnoSonandoId: sonandoId,
    })) {
      setMostrando(false);
    }
  }, [mostrando, sonandoId, puntuacionVisible?.queue_item_id]);

  // Camino principal: al terminar YouTube, la Server Action devuelve la nota
  // persistida sin esperar al siguiente refresh (que puede llegar tarde).
  const manejarTerminar = useCallback(async (telemetria: Telemetria) => {
    try {
      const guardado = await onTerminar?.(telemetria);
      if (guardado && debeRevelarResultado({
        resultado: guardado,
        reciente: true,
        ultimoMostradoId: reveladoRef.current,
        turnoSonandoId: sonandoIdRef.current,
      })) {
        reveladoRef.current = guardado.id;
        setResultadoActivo(guardado);
        setMostrando(true);
      }
    } catch (error) {
      console.error('[Karyou TV] No se pudo confirmar la puntuación:', error);
    } finally {
      // Actualizar cola/ranking aun si la nota llegó por el canal inmediato.
      router.refresh();
    }
  }, [onTerminar, router]);

  // Mejora 4 (TV): En Modo Bar, si un cliente lleva 75s sin darle Play y hay más
  // personas esperando detrás en la cola, la TV pasa automáticamente al siguiente turno.
  useEffect(() => {
    if (estado.modo !== 'bar') return;
    // La ceremonia, también la premium, no debe descartarse por auto-salto.
    if (mostrando || estado.celebracionRestanteMs > 0) return;
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
    mostrando,
    estado.celebracionRestanteMs,
    estado.esperando,
    estado.segundosEnPantalla,
    onDescartar,
  ]);

  const activarTV = useCallback(() => {
    despertar();
    activarAudio(); // Desbloquear el sonido en ESTE gesto de la TV.
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

  const manejarCantar = useCallback(async () => {
    if (estado.celebracionRestanteMs > 0) {
      return {ok:false, error:'CELEBRACION_EN_CURSO'};
    }
    const respuesta = await onCantar?.();
    if (respuesta?.ok) {
      setMostrando(false);
      setAudioListo(true);
    }
    return respuesta ?? {ok:false,error:'TURNO_NO_EXISTE'};
  }, [onCantar, estado.celebracionRestanteMs]);

  return (
    <KaraokeStage
      cancion={cancion}
      reproduciendoRemoto={reproduciendoRemoto}
      celebracionRestanteMs={estado.celebracionRestanteMs}
      onCantar={onCantar ? manejarCantar : undefined}
      onTerminar={onTerminar ? manejarTerminar : undefined}
      onDescartar={onDescartar}
      reemplazo={
        mostrando && puntuacionVisible ? (
          usarCeremoniaPremium ? (
            <AnimacionResultadoPremium
              key={puntuacionVisible.id}
              resultado={puntuacionVisible}
              patrocinio={promociones.find(p=>p.placement==='resultado') ?? null}
              siguienteEnCola={estado.esperando.length>0}
              onInicio={() => onInicioCelebracion?.(puntuacionVisible.queue_item_id)}
              onFin={() => setMostrando(false)}
            />
          ) : <AnimacionResultado
            key={puntuacionVisible.id}
            resultado={puntuacionVisible}
            ranking={ranking}
            aplausos={aplausos}
            patrocinio={promociones.find(p=>p.placement==='resultado') ?? null}
            onInicio={() => onInicioCelebracion?.(puntuacionVisible.queue_item_id)}
            onFin={() => setMostrando(false)}
          />
        ) : estado.celebracionRestanteMs > 0 ? (
          <CuentaRegresivaCelebracion restanteMs={estado.celebracionRestanteMs} grande />
        ) : null
      }
      pie={<EstadisticasTV mesas={rankingMesas} ranking={ranking} modo={estado.modo} />}
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
          tieneRevancha={tieneRevancha}
          promociones={promociones}
          qr={qr}
          enlace={enlace}
          onDescartar={onDescartar}
          onActivarTV={activarTV}
        />
      }
    />
  );
}
