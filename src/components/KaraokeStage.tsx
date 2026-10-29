'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { reportarPistaBloqueada } from '@/app/actions';
import { MarcoYouTube } from './MarcoYouTube.mjs';

/* ------------------------------------------------------------------ tipos YT */

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (el: string | HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/* ------------------------------------------------------------------ estados */

type EstadoEscenario =
  | 'cargando'
  | 'listo'
  | 'reproduciendo'
  | 'pausado'
  | 'cargando_pista'
  | 'terminado'
  | 'error';

/**
 * Mensajes para el usuario. NUNCA se muestra el código crudo de YouTube:
 * un «YT.Player Error 101» no le dice nada a nadie.
 */
const ERRORES: Record<number, { mensaje: string; reintentable: boolean }> = {
  2: { mensaje: 'Esta pista tiene un formato que no pudimos reproducir.', reintentable: false },
  5: { mensaje: 'Hubo un problema al reproducir.', reintentable: true },
  100: { mensaje: 'Esta pista ya no está disponible.', reintentable: false },
  101: { mensaje: 'Esta pista no permite reproducción aquí.', reintentable: false },
  150: { mensaje: 'Esta pista no permite reproducción aquí.', reintentable: false },
  153: {
    mensaje: 'No pudimos cargar el reproductor. Es un problema de configuración, no de la pista.',
    reintentable: true,
  },
};

const ERROR_GENERICO = { mensaje: 'No pudimos reproducir esta pista.', reintentable: true };

/* -------------------------------------------------------- carga de la API YT */

let apiPromesa: Promise<void> | null = null;

/** Carga https://www.youtube.com/iframe_api una sola vez por documento. */
function cargarApiYouTube(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromesa) return apiPromesa;

  apiPromesa = new Promise<void>((resolve) => {
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      anterior?.();
      resolve();
    };

    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return apiPromesa;
}

/* ------------------------------------------------------------------ formato */

function mmss(segundos: number | null | undefined): string {
  if (!segundos || segundos <= 0 || !Number.isFinite(segundos)) return '—';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* --------------------------------------------------------------- telemetría */

/**
 * Lo que el reproductor sabe de la actuación.
 *
 * Es lo que alimenta el motor de puntuación. El servidor no se fía de estos
 * números: los acota con su propio reloj y con la duración conocida de la pista.
 * Aun así se reportan, porque son la única fuente de pausas y saltos.
 */
export type Telemetria = {
  /** Pausas que hizo el cantante, no las de un anuncio. */
  pausas: number;
  /** Retrocesos y adelantos grandes: no cantó ese tramo. */
  saltos: number;
  posicionFinal: number;
  /** La mayor duración observada. Nunca se encoge: un anuncio reporta la suya. */
  duracionObservada: number;
  terminoNatural: boolean;
};

/* --------------------------------------------------------------- componente */

export type CancionEnEscenario = {
  videoId: string;
  titulo: string;
  artista: string;
  canal: string;
  /** Duración conocida, de la base de datos. Es la referencia estable. */
  duracion: number | null;
  vocalClass: string;
};

const ID_REPRODUCTOR = 'yt-player';

export default function KaraokeStage({
  cancion,
  panel,
  pie,
  reemplazo,
  onCantar,
  onTerminar,
  onDescartar,
  reproduciendoRemoto = false,
  celebracionRestanteMs = 0,
}: {
  cancion: CancionEnEscenario;
  /** Contenido del panel lateral. Si no se pasa, no se dibuja ninguno. */
  panel?: React.ReactNode;
  /** Estadísticas de TV fuera del reproductor, debajo de los controles. */
  pie?: React.ReactNode;
  /**
   * Sustituye al reproductor en su caja mientras está presente.
   *
   * El reproductor NO se desmonta: deja de mostrarse con `hidden`, así que la
   * instancia de YouTube y su estado sobreviven y no hay que recrearlos en cada
   * canción. Y como no se dibuja nada DELANTE del reproductor —porque el
   * reproductor no está en pantalla—, no se incumple la prohibición de superponer
   * elementos sobre él.
   */
  reemplazo?: React.ReactNode;
  /** Se llama al pulsar Cantar, antes de reproducir. Para avisar al servidor. */
  onCantar?: () => Promise<{ok:boolean;error?:string}>;
  /** Se llama cuando el video termina solo, con lo que el reproductor observó. */
  onTerminar?: (telemetria: Telemetria) => void;
  /** Se llama para descartar el turno sin penalizar cuando la pista falla en TV. */
  onDescartar?: () => void;
  /** Indica si el turno fue iniciado remotamente desde el móvil del cantante. */
  reproduciendoRemoto?: boolean;
  /** Cuenta regresiva controlada desde el servidor, no el cliente. */
  celebracionRestanteMs?: number;
}) {
  const playerRef = useRef<YTPlayer | null>(null);
  const [playerListo, setPlayerListo] = useState(false);

  const [estado, setEstado] = useState<EstadoEscenario>('cargando');
  const [error, setError] = useState(ERROR_GENERICO);
  const [posicion, setPosicion] = useState(0);

  /** Evita disparar play remoto o notificar inicio de turno más de una vez por canción. */
  const reproducidoRemotoIdRef = useRef<string | null>(null);
  const notificadoCantarIdRef = useRef<string | null>(null);

  // El manejador de estado vive dentro del efecto de montaje, que solo corre una
  // vez (el reproductor no se recrea). Sin este ref, `onTerminar` quedaría
  // congelado en el valor que tenía al montar y el turno no se cerraría.
  const alTerminarRef = useRef(onTerminar);
  useEffect(() => {
    alTerminarRef.current = onTerminar;
  }, [onTerminar]);

  const bloqueoRef = useRef(celebracionRestanteMs > 0);
  useEffect(() => { bloqueoRef.current = celebracionRestanteMs > 0; }, [celebracionRestanteMs]);

  const alCantarRef = useRef(onCantar);
  useEffect(() => {
    alCantarRef.current = onCantar;
  }, [onCantar]);
  const [avisoAudio, setAvisoAudio] = useState(false);
  const [ocultada, setOcultada] = useState(false);

  /**
   * Lo observado durante el turno. La duración se guarda como máximo y nunca se
   * encoge: mientras suena un anuncio, `getDuration()` devuelve la del anuncio, y
   * quedarse con ese valor corrompería el cálculo del avance.
   */
  const telemetriaRef = useRef({
    pausas: 0,
    saltos: 0,
    posicionFinal: 0,
    duracionObservada: 0,
    posicionPrevia: 0,
  });

  const reiniciarTelemetria = useCallback(() => {
    telemetriaRef.current = {
      pausas: 0,
      saltos: 0,
      posicionFinal: 0,
      duracionObservada: 0,
      posicionPrevia: 0,
    };
  }, []);

  const videoIdActual = cancion?.videoId ?? '';
  const videoIdRef = useRef(videoIdActual);
  useEffect(() => {
    videoIdRef.current = videoIdActual;
  }, [videoIdActual]);

  const reproduciendoRemotoRef = useRef(reproduciendoRemoto);
  useEffect(() => {
    reproduciendoRemotoRef.current = reproduciendoRemoto;
  }, [reproduciendoRemoto]);

  const duracion = cancion?.duracion ?? null;

  /* ------------------------------------------------ creación del reproductor */

  useEffect(() => {
    let destruido = false;
    let instancia: YTPlayer | null = null;

    (async () => {
      await cargarApiYouTube();
      if (destruido || !window.YT || !document.getElementById(ID_REPRODUCTOR)) return;

      // El reproductor se crea UNA sola vez. Recrearlo en cada cambio de canción
      // acumula listeners, parpadea el branding y pierde la activación de audio
      // que el navegador concede tras el primer gesto del usuario.
      const idInicial = videoIdRef.current;
      const player = new window.YT.Player(ID_REPRODUCTOR, {
        width: '100%',
        height: '100%',
        ...(idInicial ? { videoId: idInicial } : {}),
        playerVars: {
          enablejsapi: 1,
          // `origin` identifica al cliente ante YouTube. Requisito de la API.
          origin: window.location.origin,
          // NUNCA controls: 0. Ocultar los controles incumple las condiciones de uso.
          controls: 1,
          rel: 0,
          fs: 1,
          playsinline: 1,
          iv_load_policy: 3,
          // NUNCA autoplay: 1. La reproducción la inicia un gesto del usuario y,
          // además, el autoplay recopila datos de reproducción al cargar la página.
          autoplay: 0,
        },
        events: {
          onReady: () => {
            if (destruido) return;
            playerRef.current = player;
            setPlayerListo(true);
            setEstado('listo');
            const idListo = videoIdRef.current;
            if (!idListo) return;
            if (!reproduciendoRemotoRef.current && idInicial !== idListo) {
              try {
                player.cueVideoById(idListo);
              } catch {
                // Ignorar si aún no está listo.
              }
            }
          },
          onStateChange: (evento: { data: number }) => {
            if (destruido) return;
            const S = window.YT!.PlayerState;
            if (evento.data === S.PLAYING) {
              // Los controles nativos de YouTube NO pueden eludir la protección.
              if (bloqueoRef.current) {
                try { player.pauseVideo(); } catch { /* reproductor desapareciendo */ }
                setEstado('listo');
                return;
              }
              setEstado('reproduciendo');
              setAvisoAudio(false);
              const idActual = videoIdRef.current;
              if (idActual) {
                reproducidoRemotoIdRef.current = idActual;
                if (!reproduciendoRemotoRef.current && notificadoCantarIdRef.current !== idActual) {
                  notificadoCantarIdRef.current = idActual;
                  void Promise.resolve(alCantarRef.current?.()).then((respuesta) => {
                    if (respuesta && !respuesta.ok) {
                      try { player.pauseVideo(); } catch { /* reproductor no disponible */ }
                      setEstado('listo');
                    }
                  }).catch(() => {
                    try { player.pauseVideo(); } catch { /* reproductor no disponible */ }
                    setEstado('listo');
                  });
                }
              }
            } else if (evento.data === S.PAUSED) {
              setEstado('pausado');
            } else if (evento.data === S.BUFFERING) {
              setEstado('cargando_pista');
            } else if (evento.data === S.ENDED) {
              setEstado('terminado');
              // Avisa al servidor con lo observado: en la pantalla de TV esto
              // cierra el turno, calcula la puntuación y deja pasar al siguiente.
              const te = telemetriaRef.current;
              alTerminarRef.current?.({
                pausas: te.pausas,
                saltos: te.saltos,
                posicionFinal: te.posicionFinal,
                duracionObservada: te.duracionObservada,
                terminoNatural: true,
              });
            } else if (evento.data === S.CUED) {
              setEstado('listo');
            }
          },
          onError: (evento: { data: number }) => {
            if (destruido) return;

            const idActual = videoIdRef.current;
            if (!idActual) return;
            // El código queda en la consola para poder diagnosticar. La interfaz
            // muestra un mensaje en español: un «YT.Player Error 101» no le dice
            // nada a quien está intentando cantar.
            console.warn(
              `[reproductor] YouTube devolvió el código ${evento.data} para ${idActual}. ` +
                `origin=${window.location.origin} ` +
                'Códigos: 2=parámetro inválido · 5=error HTML5 · 100=no existe · ' +
                '101/150=inserción no permitida · 153=falta identificación (Referer)',
            );

            setError(ERRORES[evento.data] ?? ERROR_GENERICO);
            setEstado('error');

            // 101 y 150 significan que el titular de los derechos bloqueó la
            // inserción. Es lo único que lo detecta: la API marca estos videos como
            // embeddable = true. Se registra para que dejen de ofrecerse.
            if (evento.data === 101 || evento.data === 150) {
              reportarPistaBloqueada(idActual, evento.data)
                .then(() => setOcultada(true))
                .catch(() => {
                  // Que falle el registro no debe afectar a lo que ve el usuario.
                });
            }
          },
        },
      });

      instancia = player;
    })();

    return () => {
      destruido = true;
      try {
        (playerRef.current ?? instancia)?.destroy();
      } catch {
        // Puede no haberse llegado a crear.
      }
      playerRef.current = null;
    };
    // Se crea una sola vez a propósito: los cambios de canción usan loadVideoById.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------- cambio de canción */

  // En la pantalla de TV el turno cambia sin recargar la página, así que el
  // reproductor tiene que cargar el video nuevo. Si reproduciendoRemoto está activo,
  // arranca de una vez con loadVideoById. Si no, lo deja preparado con cueVideoById.
  const videoCargadoRef = useRef<string>(videoIdActual);
  useEffect(() => {
    if (!playerListo) return;
    const player = playerRef.current;
    if (!player) return;

    if (!videoIdActual) {
      videoCargadoRef.current = '';
      reproducidoRemotoIdRef.current = null;
      notificadoCantarIdRef.current = null;
      try {
        player.pauseVideo();
      } catch {
        // Ignorar si aún no estaba listo.
      }
      setEstado('listo');
      setPosicion(0);
      return;
    }

    if (videoCargadoRef.current === videoIdActual) return;
    videoCargadoRef.current = videoIdActual;
    reproducidoRemotoIdRef.current = null;
    notificadoCantarIdRef.current = null;

    reiniciarTelemetria();
    setOcultada(false);
    setPosicion(0);
    setAvisoAudio(false);

    try {
      if (!reproduciendoRemotoRef.current) {
        player.cueVideoById(videoIdActual);
        setEstado('listo');
      }
    } catch {
      // Si falla, el botón Cantar lo intentará de nuevo.
    }
  }, [videoIdActual, playerListo, reiniciarTelemetria]);

  /* ------------------------------------------- reproducción remota (móvil) */

  useEffect(() => {
    if (!reproduciendoRemoto || !videoIdActual || !playerListo) return;
    const player = playerRef.current;
    if (!player) return;

    // Se ejecuta una única vez por canción cuando llega la orden de Play desde el celular.
    // Nunca incluye `estado` en dependencias para no provocar bucles al cambiar a BUFFERING/PAUSED.
    if (reproducidoRemotoIdRef.current === videoIdActual) return;
    reproducidoRemotoIdRef.current = videoIdActual;
    notificadoCantarIdRef.current = videoIdActual;

    reiniciarTelemetria();
    setAvisoAudio(false);
    setEstado('cargando_pista');
    try {
      player.loadVideoById(videoIdActual);
    } catch {
      setAvisoAudio(true);
    }
  }, [reproduciendoRemoto, videoIdActual, playerListo, reiniciarTelemetria]);

  /* -------------------------------------------------------------- progreso */

  useEffect(() => {
    if (estado !== 'reproduciendo') return;
    const id = window.setInterval(() => {
      try {
        const player = playerRef.current;
        if (!player) return;

        const t = player.getCurrentTime();
        const d = player.getDuration();
        const te = telemetriaRef.current;

        if (Number.isFinite(d) && d > te.duracionObservada) te.duracionObservada = d;

        // Un salto de más de dos segundos entre dos muestras no es reproducción:
        // es alguien moviendo la barra. Da igual hacia atrás o hacia adelante —
        // en los dos casos se saltó ese tramo sin cantarlo.
        if (te.posicionPrevia > 0 && Math.abs(t - te.posicionPrevia) > 2.5) {
          te.saltos += 1;
        }
        te.posicionPrevia = t;
        te.posicionFinal = t;

        setPosicion(t);
      } catch {
        // El reproductor puede estar destruyéndose.
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [estado]);

  /* ------------------------------------------- detección de audio bloqueado */

  useEffect(() => {
    if (estado !== 'cargando_pista') return;
    const id = window.setTimeout(() => {
      const actual = playerRef.current?.getPlayerState();
      // Si seis segundos después de pedir reproducción el reproductor sigue sin
      // arrancar, el navegador bloqueó el audio. Es frecuente en Smart TV y hay
      // que preverlo, no parchearlo cuando aparezca en la primera fiesta.
      if (actual !== window.YT?.PlayerState.PLAYING) {
        setAvisoAudio(true);
        setEstado('listo');
      }
    }, 6000);
    return () => window.clearTimeout(id);
  }, [estado]);

  /* ------------------------------ comprobación de superposición (desarrollo) */

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    // De esta regla depende que el reproductor siga siendo usable: nada puede
    // dibujarse encima. Un z-index mal puesto tapa los controles de YouTube y
    // rompe la reproducción. Solo el navegador real conoce la geometría, así que
    // la comprobación se hace aquí.
    const id = window.setTimeout(() => {
      const reproductor = document.getElementById(ID_REPRODUCTOR);
      if (!reproductor) return;

      const pr = reproductor.getBoundingClientRect();
      if (pr.width === 0 || pr.height === 0) return;

      const culpables: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        if (reproductor.contains(el) || el.contains(reproductor)) continue;

        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;

        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;

        const cruza =
          !(r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom);
        if (cruza) culpables.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`);
      }

      if (culpables.length > 0) {
        console.error(
          '[reproductor] Hay elementos superpuestos al reproductor. Tapan los controles de ' +
            'YouTube y rompen la reproducción. Revisa el layout:',
          culpables,
        );
      }
    }, 3000);

    return () => window.clearTimeout(id);
  }, []);

  /* --------------------------------------------------------------- acciones */

  const cantar = useCallback(() => {
    if (!playerRef.current || celebracionRestanteMs > 0) return;
    const reanudando = estado === 'pausado';
    if (!reanudando) {
      reiniciarTelemetria();
    }
    if (videoIdActual) {
      reproducidoRemotoIdRef.current = videoIdActual;
      notificadoCantarIdRef.current = videoIdActual;
    }
    setAvisoAudio(false);
    setEstado('cargando_pista');
    // Avisa al servidor antes de arrancar: en la TV esto marca quién está cantando.
    // Preserva el gesto de Play para políticas de autoplay de Smart TV, pero si
    // el servidor niega el inicio por celebración concurrente, se pausa al instante.
    void Promise.resolve(onCantar?.()).then(respuesta => {
      if (respuesta && !respuesta.ok) {
        try { playerRef.current?.pauseVideo(); } catch { /* vídeo detenido */ }
        setEstado('listo');
      }
    }).catch(() => {
      try { playerRef.current?.pauseVideo(); } catch { /* vídeo detenido */ }
      setEstado('listo');
    });
    try {
      if (reanudando || !videoIdActual) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.loadVideoById(videoIdActual);
      }
    } catch {
      setEstado('error');
    }
  }, [estado, onCantar, videoIdActual, reiniciarTelemetria, celebracionRestanteMs]);

  const pausar = useCallback(() => {
    // Se cuenta solo la pausa explícita del cantante. Una pausa publicitaria no
    // genera este evento porque no pasa por nuestros controles.
    telemetriaRef.current.pausas += 1;
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // Ignorar: pausar un reproductor que se está destruyendo no es un problema.
    }
  }, []);

  const reiniciar = useCallback(() => {
    // Una nota ya guardada no puede repetirse en la TV sin un turno nuevo.
    if (onCantar || celebracionRestanteMs > 0) return;
    const player = playerRef.current;
    if (!player) return;
    reiniciarTelemetria();
    try {
      player.seekTo(0, true);
      setPosicion(0);
      setEstado('cargando_pista');
      player.playVideo();
    } catch {
      setEstado('error');
    }
  }, [reiniciarTelemetria, onCantar, celebracionRestanteMs]);

  /* ----------------------------------------------------------------- render */

  const progreso = duracion && duracion > 0 ? Math.min(posicion / duracion, 1) : 0;
  const enMarcha = estado === 'reproduciendo' || estado === 'cargando_pista';

  return (
    <div className={`grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] ${pie ? 'karyou-tv-stage' : ''}`}>
      {/* ------------------------------------------------- columna izquierda */}
      <div className="karyou-stage-columna space-y-4">
        {/* Caja del reproductor. NADA se superpone a esta región: ni la barra de
            progreso, ni el estado, ni avisos. Todo eso va debajo, como hermano.
            La comprobación de desarrollo avisa si algo la cruza. */}
        <div
          className="w-full overflow-hidden rounded-2xl border border-purple-500/30 bg-black shadow-2xl"
          style={{ aspectRatio: '16 / 9', minHeight: 220 }}
        >
          {/* YouTube REEMPLAZA el nodo #yt-player por un iframe. El marco externo
              permanece bajo control de React: lo ocultamos cuando hay puntuación,
              sin superponer anuncios ni resultados sobre el video de YouTube. */}
          <MarcoYouTube oculto={Boolean(reemplazo)} />
          {reemplazo}
        </div>

          {/* Controles y progreso: fuera del reproductor a propósito. */}
          <div className="karyou-stage-controles space-y-3 rounded-2xl border border-purple-500/25 bg-purple-950/30 p-4 sm:p-5 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-purple-950/80 border border-purple-700/30"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progreso * 100)}
                aria-label="Progreso de la canción"
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 transition-[width] duration-500 ease-linear"
                  style={{ width: `${progreso * 100}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-purple-200/80">
                {mmss(posicion)} / {mmss(duracion)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {!enMarcha && estado !== 'terminado' && (
                  <button
                    type="button"
                    onClick={cantar}
                    disabled={estado === 'cargando' || celebracionRestanteMs > 0}
                    className="rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 px-6 py-3 font-extrabold text-white shadow-lg transition hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-pink-400/50 disabled:opacity-50"
                  >
                    {celebracionRestanteMs > 0 ? '🔒 Celebrando…' : estado === 'cargando' ? 'Cargando…' : '🎤 Cantar'}
                  </button>
                )}

                {enMarcha && (
                  <button
                    type="button"
                    onClick={pausar}
                    className="rounded-xl border border-purple-400/40 bg-purple-900/40 px-5 py-3 font-bold text-purple-100 transition hover:bg-purple-800/50 focus:outline-none focus:ring-4 focus:ring-purple-400/50"
                  >
                    ⏸ Pausar
                  </button>
                )}

                {estado === 'pausado' && (
                  <button
                    type="button"
                    onClick={cantar}
                    disabled={celebracionRestanteMs > 0}
                    className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-extrabold text-white shadow-lg transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-pink-400/50"
                  >
                    ▶ Continuar
                  </button>
                )}

                {estado === 'terminado' && !onCantar && celebracionRestanteMs <= 0 && (
                  <button
                    type="button"
                    onClick={reiniciar}
                    className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-extrabold text-white shadow-lg transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-pink-400/50"
                  >
                    🔄 Cantar otra vez
                  </button>
                )}

                {!onCantar && (
                  <Link
                    href="/catalogo"
                    className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-4 py-3 text-sm font-bold text-purple-200 transition hover:border-purple-400 hover:bg-purple-900/40 focus:outline-none focus:ring-4 focus:ring-purple-400/50"
                  >
                    ← Volver al catálogo
                  </Link>
                )}
              </div>

              <p aria-live="polite" className="text-sm font-semibold text-purple-300/80">
                {estado === 'cargando' && 'Preparando el reproductor…'}
                {estado === 'listo' &&
                  !avisoAudio &&
                  (celebracionRestanteMs > 0
                    ? '🏆 Celebrando. La canción se habilitará en breve.'
                    : reproduciendoRemoto
                      ? 'Iniciando reproducción…'
                      : 'Listo. Pulsa Cantar en la TV o dale Play desde tu celular.')}
                {estado === 'cargando_pista' && 'Cargando la pista…'}
                {estado === 'reproduciendo' && '🎶 Cantando en vivo'}
                {estado === 'pausado' && 'En pausa.'}
                {estado === 'terminado' && '¡Terminaste!'}
              </p>
            </div>

            {avisoAudio && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-sm animate-aparecer">
                <p className="font-bold text-amber-300">
                  🔊 El navegador de la TV requiere un toque para el audio.
                </p>
                <p className="mt-1 text-amber-200/80">
                  Toca la pantalla o presiona el botón para desbloquear el sonido y reproducir.
                </p>
                <button
                  type="button"
                  onClick={cantar}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 px-4 py-2 text-xs font-black text-white shadow-md hover:scale-105 active:scale-95"
                >
                  ▶ Activar y Reproducir en TV
                </button>
              </div>
            )}

            {estado === 'error' && (
              <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-3.5 text-sm">
                <p className="font-bold text-red-300">{error.mensaje}</p>
                <p className="mt-1 text-red-200/80">
                  {onDescartar
                    ? 'Puedes pasar al siguiente turno sin afectar el puntaje del participante.'
                    : 'Prueba otra versión de esta canción desde el catálogo.'}
                </p>
                {ocultada && (
                  <p className="mt-2 text-xs text-red-200/60">
                    Anotado: esta pista no volverá a aparecer en la búsqueda.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {error.reintentable && (
                    <button
                      type="button"
                      onClick={cantar}
                      className="rounded-xl border border-purple-500/40 bg-purple-900/40 px-4 py-2 font-bold text-white hover:bg-purple-800/50 focus:outline-none focus:ring-4 focus:ring-white/50"
                    >
                      Reintentar
                    </button>
                  )}
                  {onDescartar && (
                    <button
                      type="button"
                      onClick={onDescartar}
                      className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 font-bold text-white shadow-md hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/50"
                    >
                      Pasar al siguiente turno →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {pie}
        </div>

        {/* ---------------------------------------------------- panel lateral */}
        {/*
          El panel es una región HERMANA del reproductor, nunca superpuesta. Quien lo
          pase decide su contenido —la ficha de la canción, o la cola en la pantalla de
          TV— pero no puede meterlo dentro de la caja del reproductor.
        */}
        {panel && <aside className="karyou-stage-panel space-y-4">{panel}</aside>}
      </div>
  );
}
