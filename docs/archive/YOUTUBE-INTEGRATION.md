# YOUTUBE-INTEGRATION.md — Proveedor de video, reproductor y cumplimiento

| Campo | Valor |
|---|---|
| Documento | Integración con YouTube: reproducción, metadatos, cuota y cumplimiento |
| Versión | 0.1 (borrador para revisión) |
| Estado | **Propuesto — no aprobado** |
| Referencias | `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `CLAUDE.md` §5, §16, §17, §21 |
| Documentación externa consultada | [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) · [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality) · [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) |

> **Aviso.** Las políticas y la cuota de YouTube cambian sin previo aviso. Cada afirmación
> normativa de este documento lleva su fuente y debe revalidarse antes de la Fase 1 (§13).

---

## 1. Principios y prohibiciones

### 1.1 Principio rector

> **YouTube es un proveedor de reproducción reemplazable. No es el producto y no es nuestro.**

La aplicación controla catálogo, búsqueda, cola, participantes, sesiones, puntuación, ranking,
favoritos, historial, licencias y UI. Nunca manipula el contenido audiovisual fuera de las
capacidades oficiales del reproductor (`CLAUDE.md` §4).

### 1.2 Prohibiciones y cómo se hacen cumplir

Una prohibición que no tiene un mecanismo de cumplimiento es una intención, no una regla.

| Prohibición (`CLAUDE.md` §5) | Mecanismo de cumplimiento |
|---|---|
| Descargar videos de YouTube | Revisión de dependencias: `ytdl-core`, `youtube-dl`, `pytube` y similares en lista negra de CI |
| Descargar o extraer audio | Idem + prohibición de `MediaRecorder`/`captureStream` sobre el iframe |
| Almacenar copias de video o audio derivado | Storage solo acepta `image/*`; extensión de bucket restringida |
| Eliminar u ocultar branding | Test visual: el contenedor `#yt-player` tiene `overflow: hidden` prohibido y no admite estilos sobre el iframe |
| Ocultar controles para simular reproductor propio | `controls=1` forzado en el adaptador; `disablekb` no se usa para bloquear |
| Bloquear publicidad | Prohibido interceptar el iframe, usar extensiones o leer el DOM de `youtube.com` |
| Reproducir audio oculto | `#yt-player` debe ser visible (≥50 %) antes de cualquier reproducción; test de visibilidad |
| Usar APIs privadas | Lista blanca de endpoints: `www.youtube.com/iframe_api`, `www.youtube.com/youtube/v3/*` |
| Scraping existiendo API oficial | Sin `fetch` a `youtube.com/watch` ni parseo de HTML; revisión de código obligatoria |
| Afirmar análisis vocal inexistente | Lista negra de copy: "afinación", "notas correctas", "precisión melódica", "pitch" en la UI principal |

---

## 2. Abstracción de proveedor

### 2.1 Contrato (normativo)

```ts
// src/ports/video-provider.ts — contrato del dominio. YouTube no aparece aquí.
export type ProviderId = 'youtube' | 'licensed' | 'local_upload';

export interface ProviderCapabilities {
  search: boolean;          // ¿puede buscar en el proveedor?
  metadata: boolean;        // ¿puede entregar metadatos?
  availability: boolean;    // ¿puede verificar reproducibilidad?
  playback: 'iframe_embed' | 'stream' | 'file';
}

export interface VideoCandidate {
  provider: ProviderId;
  externalId: string;
  title: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  canonicalUrl: string;
}

export interface VideoMetadata extends VideoCandidate {
  embeddableStatus: 'unknown' | 'embeddable' | 'blocked' | 'private' | 'deleted' | 'region_blocked' | 'invalid';
  regionBlocked?: string[];
  contentRating?: Record<string, unknown>;
  fetchedAt: Date;
}

export interface Availability {
  playable: boolean;
  reason?: Extract<VideoMetadata['embeddableStatus'], 'blocked' | 'private' | 'deleted' | 'region_blocked' | 'invalid'>;
  checkedAt: Date;
}

/** El player NUNCA recibe un videoId suelto: recibe un descriptor. */
export type PlaybackDescriptor =
  | { kind: 'youtube_iframe'; host: string; videoId: string; params: YouTubePlayerParams }
  | { kind: 'stream'; manifestUrl: string; licenseId?: string }
  | { kind: 'file'; url: string };

export interface VideoProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  search(query: { text: string; limit: number; regionCode?: string }): Promise<VideoCandidate[]>;
  getMetadata(externalId: string): Promise<VideoMetadata>;
  checkAvailability(externalId: string): Promise<Availability>;
  getPlaybackDescriptor(source: {
    externalId: string;
    provider: ProviderId;
  }): PlaybackDescriptor;
}
```

`getPlaybackDescriptor` es la pieza que hace real la promesa de `SPEC.md` §36. El día que entre
un proveedor licenciado, se añade un adaptador; la UI, el dominio y la base de datos no cambian.

### 2.2 Lo que el dominio NO puede hacer

| Prohibido en `src/domain/**` | Por qué |
|---|---|
| Importar `YouTubeProvider` | El dominio depende de la interfaz, no de la implementación |
| Conocer `videoId`, `youtube.com` o códigos de error de YouTube | Los códigos son un detalle de infraestructura |
| Decidir si un video es reproducible | Eso es responsabilidad del adaptador |
| Guardar `PlaybackDescriptor` en la base | El descriptor se deriva de `song_sources` en el momento de reproducir |

---

## 3. YouTube Data API v3: uso y presupuesto

### 3.1 Regla de oro

> **Ninguna búsqueda de usuario toca la API de YouTube. Ni una sola.**

### 3.2 Costo y cupo reales (verificado)

| Endpoint | Costo | Cupo diario | Notas |
|---|---|---|---|
| `search.list` | 1 llamada de **bucket propio** | **100 llamadas/día** | No comparte el bucket general |
| `videos.insert` | 1 llamada de bucket propio | 100/día | No lo usamos |
| `videos.list` | **1 unidad** (hasta 50 IDs) | 10,000 unidades/día compartido | El caballo de batalla |
| `playlistItems.list` | **1 unidad** (hasta 50 items) | 10,000 unidades/día compartido | Bootstrap del catálogo |
| `channels.list` | 1 unidad | 10,000 unidades/día compartido | Verificación de canales |
| `captions.list` | 50 unidades | 10,000 unidades/día compartido | No lo usamos |

Fuente: [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) —
*"Projects that enable the YouTube Data API have a default quota allocation of 100 `search.list`
calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints."*
El cupo se reinicia a **medianoche hora del Pacífico**.

Consecuencias que redefinen el diseño:

| Hecho | Consecuencia |
|---|---|
| Solo 100 búsquedas/día en todo el sistema | La búsqueda de YouTube es una **herramienta de administración**, nunca una función de usuario. Se agota en una sola fiesta si se abre al público. |
| `videos.list` cuesta 1 unidad y admite 50 IDs | Refrescar 20,000 fuentes cuesta 400 unidades: **4 % del cupo diario**. La regla de 30 días es perfectamente asumible. |
| `playlistItems.list` cuesta 1 unidad y admite 50 items | 10,000 videos de un canal cuestan 200 unidades. El bootstrap del catálogo es viable. |
| El cupo se reinicia a medianoche PT | Los jobs corren a las **08:30 UTC** (justo después del reinicio), no a medianoche local del negocio. |

### 3.3 Presupuesto asignado

| Consumidor | Endpoint | Presupuesto diario | Corte de circuito |
|---|---|---|---|
| Curación administrativa manual | `search.list` | 20 llamadas | 20 |
| Alta de canciones por ID/URL | `videos.list` | 200 unidades | — |
| Refresco nocturno de metadatos | `videos.list` | 400 unidades | — |
| Bootstrap/importación de playlists | `playlistItems.list` | 300 unidades | — |
| Reserva de emergencia | cualquiera | resto | — |
| **Total vigilado** | | **< 1,000 unidades + 20 búsquedas** | Alerta al 60 %, corte al 80 % |

El corte se implementa con `app.consume_youtube_quota` (`docs/DATABASE.md` §7.3). Al superar el
80 % del presupuesto, la operación falla con `QUOTA_EXHAUSTED` y un mensaje de negocio claro,
en lugar de propagar el error opaco de Google:

> "El buscador de YouTube alcanzó su límite de hoy. El catálogo sigue disponible."

### 3.4 Ledger y observabilidad

`youtube_quota_ledger (day, endpoint, calls, units)`. Panel `/admin/cuota` con:
consumo de hoy, consumo de 30 días, proyección al ritmo actual, y **alerta** cuando el consumo
diario supera el 60 %. Sin esto, el primer aviso de agotamiento es un administrador sin poder
añadir canciones a las 22:00 de un sábado.

---

## 4. Pipeline de metadatos

### 4.1 Alta de una canción (flujo admin)

```text
Admin pega URL o ID de YouTube
        │
        ├─ 1. Parseo estricto: regex de ID de 11 caracteres [A-Za-z0-9_-]{11}
        │     (nunca se acepta una URL arbitraria; el ID se extrae, no se confía)
        │
        ├─ 2. app.consume_youtube_quota('videos.list', 1, 1)
        │
        ├─ 3. GET videos.list?part=snippet,contentDetails,status,statistics&id=…
        │     Costo: 1 unidad
        │
        ├─ 4. Rechazar automáticamente si:
        │     status.embeddable = false          → embeddable_status = 'blocked'
        │     status.privacyStatus ≠ 'public'     → 'private'
        │     status.uploadStatus ≠ 'processed'   → 'invalid'
        │     contentDetails.regionRestriction.allowed excluye EC/región objetivo → 'region_blocked'
        │     404 / video no encontrado           → 'deleted'
        │
        ├─ 5. Duración ISO 8601 (PT#H#M#S) → segundos
        │
        ├─ 6. INSERT en song_sources con metadata_fetched_at = now()
        │
        └─ 7. INSERT en admin_audit_log (acción, actor, antes/después)
```

Campos que se guardan y campos que **no**:

| Se guarda | No se guarda |
|---|---|
| `external_id` (videoId) | Descripción completa del video |
| `title_snapshot`, `channel_title` | Comentarios, miniaturas en alta resolución |
| `thumbnail_url` (URL, no el archivo) | Estadísticas completas (solo lo necesario para ordenar) |
| `duration_seconds`, `embeddable_status`, `region_blocked` | Cualquier dato de usuario de YouTube |
| `metadata_fetched_at`, `content_rating` | Cualquier copia de contenido audiovisual |

Minimización deliberada: menos datos = menos obligaciones de privacidad y menos superficie de
incumplimiento de la regla de 30 días.

### 4.2 Refresco: la regla de los 30 días

**Requisito** ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies) §III.E.4):
los datos de API obtenidos sin autorización de usuario (*Non-Authorized Data*, el caso de una
API key) solo pueden almacenarse un máximo de **30 días calendario**; después hay que
eliminarlos o volver a obtenerlos. Además (§III.E.4.e) hay que hacer un esfuerzo razonable por
mantener los datos almacenados coherentes con los actuales.

```text
job_refresh_song_sources — diario, 08:30 UTC
  ├─ Selecciona fuentes de YouTube con metadata_fetched_at < now() - 25 días
  ├─ Agrupa en lotes de 50 IDs
  ├─ 1 llamada a videos.list por lote (1 unidad)
  ├─ Actualiza: embeddable_status, duration, title_snapshot, channel_title, metadata_fetched_at
  ├─ IDs ausentes en la respuesta → embeddable_status = 'deleted', active = false
  └─ Registra resultado en job_runs

job_purge_stale_metadata — diario, 09:00 UTC
  ├─ Fuentes con metadata_fetched_at < now() - 30 días y provider='youtube'
  ├─ No se pudieron refrescar → active = false (el metadato se conserva solo como histórico interno)
  └─ Nunca se sirven al usuario: RLS ya las oculta
```

**Tercera capa (la que realmente protege):** la política RLS
`song_sources_select_live` (`docs/DATABASE.md` §6.3) oculta automáticamente cualquier fuente
con metadatos de más de 30 días. Si el job falla tres semanas por un cambio de API, el sistema
deja de servir datos vencidos **por sí solo**, sin intervención.

| Capa | Protege contra |
|---|---|
| `metadata_fetched_at` obligatorio | Insertar una fuente sin fecha de control |
| Job de refresco a 25 días | Degradación normal por antigüedad |
| Job de purga a 30 días | Fallo parcial del refresco |
| RLS a 30 días | **Fallo total y silencioso del job** |

### 4.3 Bootstrap del catálogo (la decisión que hace viable el producto)

`SPEC.md` §12 exige un catálogo propio, pero no dice de dónde sale. Con 100 búsquedas diarias,
la curación manual 1×1 es inviable: 300 canciones tardarían semanas de trabajo administrativo.

**Estrategia: cosecha de listas de reproducción vía API oficial.**

```text
Admin identifica canales de karaoke (públicos, monetizados por sus dueños)
        │
        ├─ channels.list?part=contentDetails&id=…       → uploadsPlaylistId (1 unidad)
        │
        ├─ playlistItems.list?part=snippet,contentDetails&playlistId=…&maxResults=50
        │     (1 unidad por página de 50)
        │
        ├─ Filtro automático por heurística de título:
        │     incluir: "karaoke", "instrumental", "playback", "pista", "versión karaoke"
        │     excluir: "tutorial", "reacción", "cover original", "letra", "official video"
        │
        ├─ Deduplicación contra song_sources (provider, external_id) único
        │
        ├─ Agrupación en canciones canónicas (título + artista normalizados)
        │     → cola de revisión, NO inserción directa al catálogo público
        │
        ├─ videos.list en lotes de 50 para verificar embeddable_status y duración
        │
        └─ El admin aprueba en lote (con vista previa incrustada del reproductor)
```

| Aspecto | Decisión |
|---|---|
| Costo | ~50 títulos por unidad. 5,000 videos ≈ 100 unidades + 100 unidades de `videos.list` = **2 % del cupo diario** |
| Curaduría | Nada entra al catálogo público sin aprobación humana. La cosecha **propone**, el admin **dispone** |
| Legalidad | Uso de API oficial, atribución de canal, enlace de vuelta a la fuente, refresco a 30 días, retiro a solicitud del titular |
| Riesgo | Requiere revisión legal (R6 de `ARCHITECTURE.md` §19.1). Documentar el proceso y respetar solicitudes de retiro |
| Alternativa considerada | Búsqueda amplia con `search.list`: descartada por el cupo de 100/día |
| Alternativa futura | Importación CSV + panel de carga masiva para catálogos propios o licenciados |

---

## 5. IFrame Player API: configuración y ciclo de vida

### 5.1 Parámetros del reproductor

```ts
// Adapter normativo. Los parámetros no se improvisan en los componentes.
export const YOUTUBE_PLAYER_DEFAULTS = {
  enablejsapi: 1,
  origin: APP_ORIGIN,          // obligatorio: identifica al cliente
  controls: 1,                 // NUNCA 0
  rel: 0,
  fs: 1,
  playsinline: 1,
  iv_load_policy: 3,           // sin anotaciones (param oficial documentado)
  cc_load_policy: 0,
  disablekb: 0,
  autoplay: 0,                 // NUNCA 1: la reproducción la inicia un gesto
  modestbranding: undefined,   // DEPRECADO: no depender de él
} as const;
```

Prohibido explícitamente:

| Prohibido | Motivo |
|---|---|
| `autoplay=1` | Se inicia la reproducción con `playVideo()` tras gesto del operador. `autoplay=1` recopila datos de reproducción al cargar la página |
| `controls=0` | Ocultar controles incumple las RMF y las políticas |
| `modestbranding=1` como dependencia | Parámetro deprecado; construir la UI sobre él produce una regresión silenciosa |
| CSS sobre el iframe (`filter`, `transform`, `opacity`, `pointer-events: none`) | "You must not make changes to the YouTube player that are not explicitly described by the API documentation" |
| Interceptar el DOM de `youtube.com` | Es una API privada y además cross-origin: solo genera errores |

Host del embed:

| Opción | Cuándo | Efecto real |
|---|---|---|
| `www.youtube.com` (por defecto) | Situación general | Máxima compatibilidad con el JS API |
| `www.youtube-nocookie.com` | Si se exige privacidad reforzada | **No** elimina las cookies al reproducir ni exime de divulgar su uso. No es una solución de cumplimiento por sí sola |

Se expone como `NEXT_PUBLIC_YOUTUBE_EMBED_HOST` para poder cambiar sin desplegar código.

### 5.2 Creación del reproductor

```text
1. Cargar https://www.youtube.com/iframe_api  (una vez por documento)
2. new YT.Player('yt-player', { videoId, playerVars, events })
3. La instancia se crea UNA sola vez por pantalla.
   Los cambios de canción usan loadVideoById() o cueVideoById().
4. Prohibido destruir y recrear el player entre canciones.
```

Recrear el reproductor en cada cambio de canción es el error más común y produce: parpadeo del
branding, acumulación de listeners (una canción cerrada tres veces), pérdida del gesto de
activación de audio y errores intermitentes de embed imposibles de reproducir.

### 5.3 Reglas de reproducción automática (RMF)

Requisitos verificados en [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality):

| Requisito | Implementación |
|---|---|
| La reproducción automática no puede iniciarse hasta que el reproductor sea visible y **más de la mitad** esté en pantalla | `cueVideoById()` en estado de espera; `playVideo()` solo tras el gesto del operador en la pantalla del show |
| Ninguna página o pantalla puede tener **más de un** reproductor que reproduzca automáticamente | La TV renderiza exactamente un `KaraokePlayer`. La búsqueda móvil usa miniaturas y *tap-to-play* |
| Un iframe que inicia reproducción debe medir ≥ 120×70 px | Mínimo de las miniaturas reproducibles |
| El reproductor embebido debe medir ≥ 200×200 px (recomendado 480×270 para 16:9) | `PlayerStage` cumple con margen en TV, desktop y móvil |
| **Sin overlays, marcos ni elementos visuales delante de cualquier parte del reproductor** | `PlayerStage` es una región hermana; test de intersección de rectángulos en CI |
| Sin *mouseovers* ni eventos táctiles sobre el reproductor que inicien acciones | Ningún handler en el contenedor del player |
| Identificación mediante `HTTP Referer` | `Referrer-Policy: strict-origin-when-cross-origin`. Prohibido `no-referrer` y `noreferrer` |

### 5.4 Política de audio y gesto del usuario

Los navegadores bloquean la reproducción con sonido sin interacción previa. La TV muestra un
botón **"Iniciar show"** que:

1. Satisface la política de autoplay del navegador.
2. Da activación de usuario al documento.
3. Es el momento natural para pedir permiso de micrófono (si se aprueba C3).

```text
Instrumentación obligatoria:
  ├─ playVideo() → esperar onStateChange(PLAYING) hasta 6 s
  ├─ Si no llega a PLAYING  → estado "audio_bloqueado"
  ├─ Si no llega a PLAYING  → playVideo() + unMute() + setVolume(100)
  └─ UI: "Toca la pantalla para activar el audio" + reintento tras gesto
```

Este caso es frecuente en Smart TV y navegadores de salón. Debe estar previsto en el diseño,
no parcheado cuando aparezca en la primera fiesta real.

### 5.5 Máquina de estados y eventos

```text
YT.PlayerState → estado interno
  UNSTARTED(-1)  → idle
  ENDED(0)       → ended          → complete_queue_item()
  PLAYING(1)     → playing        → evento 'started' (una sola vez por turno)
  PAUSED(2)      → paused         → evento 'paused' o 'resumed' según comando previo
  BUFFERING(3)   → buffering      → indicador en la UI (no es un error)
  CUED(5)        → cued           → estado de espera, sin reproducción
```

`onStateChange` no distingue una pausa del usuario de una pausa publicitaria. El adaptador
lleva un registro de los comandos que **nosotros** emitimos; solo un `PAUSED` inmediatamente
posterior a un `pauseVideo()` o a un gesto en nuestros controles cuenta como interrupción del
cantante. Un `PAUSED` sin comando previo y con duración corta se atribuye a publicidad.

### 5.6 Anuncios

No se detectan ni se bloquean: no existe API pública para hacerlo, y bloquearlos incumple las
políticas. Consecuencias asumidas y sus mitigaciones:

| Problema | Mitigación |
|---|---|
| Un pre-roll reporta su propia duración vía `getDuration()` | La duración se fija en `max(duraciones observadas)` y solo se reinicia en `loadVideoById`. Nunca se encoge |
| Un mid-roll pausa la reproducción y ensucia la métrica | Pausas sin comando previo y < 3 s no penalizan al cantante |
| `completionRatio` se corrompe | Se calcula contra `song_sources.duration_seconds` (dato conocido), no solo contra `getDuration()` |
| La experiencia se interrumpe a mitad de canción | Se comunica como parte del servicio; **no** se puede prometer "sin anuncios". Un cliente de pago con YouTube Premium no puede usarse para eliminar la publicidad de una pantalla pública: es uso personal, no colectivo |

**Regla de producto:** la página de planes **no** puede prometer "sin publicidad" ni
insinuarlo. Es la promesa comercial más tentadora y la más incumplible.

### 5.7 Respuesta a errores

```ts
const PLAYER_ERROR_MAP: Record<number, {
  status: 'blocked' | 'deleted' | 'invalid' | 'retry' | 'integration';
  userMessage: string;
  logLevel: 'warn' | 'error' | 'fatal';
}> = {
  2:   { status: 'invalid',     userMessage: 'Esta pista tiene un formato que no pudimos reproducir.', logLevel: 'warn' },
  5:   { status: 'retry',       userMessage: 'Hubo un problema al reproducir. Reintentando…',          logLevel: 'warn' },
  100: { status: 'deleted',     userMessage: 'Esta pista ya no está disponible.',                       logLevel: 'warn' },
  101: { status: 'blocked',     userMessage: 'Esta pista no permite reproducción aquí.',                logLevel: 'warn' },
  150: { status: 'blocked',     userMessage: 'Esta pista no permite reproducción aquí.',                logLevel: 'warn' },
  153: { status: 'integration', userMessage: 'No pudimos cargar el reproductor. Avisa al operador.',    logLevel: 'fatal' },
};
```

Mensaje compuesto para el usuario (nunca el código crudo, `CLAUDE.md` §31):

> **101/150:** "Esta pista no permite reproducción aquí. Probamos otra versión."
> **100:** "Esta pista ya no está disponible. Probamos otra versión."
> **Sin alternativa:** "No encontramos una versión reproducible de esta canción. Se pasa al siguiente turno."

Flujo de recuperación (automático, sin intervención del operador):

```text
onError(code)
  ├─ 1. Marcar la fuente: embeddable_status según el mapa, fail_count + 1, last_error_code
  ├─ 2. Registrar playback_event 'errored' + song_report automático
  ├─ 3. Buscar la siguiente fuente viva de la MISMA canción (por priority)
  │      ├─ Existe → loadVideoById y reintentar. El show no se detiene.
  │      └─ No existe → queue_item.status = 'failed', skip_reason = 'unavailable'
  ├─ 4. Notificar al operador en la UI (mensaje no bloqueante)
  └─ 5. Error 153 → alerta a Sentry (es un fallo de identificación, no de contenido)
```

**El error 153 es especial:** indica falta de identificación del cliente ante YouTube, no un
problema del video. Si aparece, algo rompió el `Referer` o el `origin`. Debe generar alerta
inmediata porque degrada la integración entera, y su causa habitual es una cabecera de
seguridad mal configurada.

---

## 6. Requisitos de cumplimiento (checklist verificable)

Cada requisito tiene una ubicación y una verificación. Sin verificación, no es un requisito.

### 6.1 Trato con YouTube

| # | Requisito | Dónde se implementa | Cómo se verifica | Fuente |
|---|---|---|---|---|
| C-01 | Enlace visible a los TdU de YouTube (`https://www.youtube.com/t/terms`) | Footer del sitio + FAQ + pantalla de resultado | Test E2E que comprueba el enlace | Developer Policies §III.A.1 |
| C-02 | Los TdU propios declaran que el usuario acepta los TdU de YouTube | `/legal/terminos` | Revisión legal | §III.A.1 |
| C-03 | Política de privacidad que menciona que la app **usa YouTube API Services** | `/legal/privacidad` | Revisión legal | §III.A.2.b |
| C-04 | Enlace a la política de privacidad de Google (`http://www.google.com/policies/privacy`) | `/legal/privacidad` | Test E2E | §III.A.2.c |
| C-05 | Divulgación de cookies y almacenamiento en el dispositivo, incluida publicidad de terceros | `/legal/privacidad` + banner de consentimiento donde la ley lo exija | Revisión legal | §III.A.2.f, §III.A.2.g |
| C-06 | Explicación de cómo solicitar el borrado de datos almacenados | `/legal/privacidad` + `/cuenta/datos` | Test manual | §III.E.4.g |
| C-07 | Borrado de datos de usuario a solicitud en **≤ 7 días** | RPC `delete_user_data` + job | Test de integración | §III.E.4.g |
| C-08 | Almacenamiento de API Data **≤ 30 días** | `metadata_fetched_at` + job + RLS | Test pgTAP `09_compliance_30_days` | §III.E.4.c-d |
| C-09 | Mantener los datos almacenados coherentes con los actuales | Job de refresco a 25 días | Monitor de fuentes vencidas | §III.E.4.e |
| C-10 | No usar API Data para crear métricas derivadas; divulgar las métricas propias mostradas junto a datos de YouTube | El score es telemetría propia; etiqueta *"Puntuación de {appName}"* | Revisión de UI | §III.E.4.h |
| C-11 | Identificar a YouTube como fuente del contenido | Atribución por tarjeta de resultado: título del canal + icono de YouTube + enlace | Test visual | §III.F.2.a |
| C-12 | Si se mezclan resultados de varias fuentes, identificar cuáles vienen de YouTube | El catálogo hoy es 100 % YouTube; al añadir proveedores, etiqueta por ítem | Test visual (fase futura) | §III.F.2.a |
| C-13 | No presentar contenido ajeno como si viniera de YouTube | Fuentes licenciadas etiquetadas | Revisión de UI | §III.F.2.b |
| C-14 | No interferir con la atribución que entrega el reproductor | Sin overlays ni CSS sobre el iframe | Test de intersección de rectángulos | §III.F.2.c |
| C-15 | **No cobrar al usuario por ver contenido en el reproductor embebido** | Matriz de planes (§7 de este documento) | **Revisión legal + revisión de la matriz de entitlements** | §III.F.3.a |
| C-16 | No exigir acciones ajenas a YouTube para ver o continuar viendo | Ningún "comparte para seguir". Registro/nickname sí está permitido | Revisión de flujos | §III.F.3.b |
| C-17 | No incentivar interacción con YouTube (likes, suscripciones) con recompensas | Sin mecánicas de ese tipo | Revisión de producto | §III.F.4 |
| C-18 | Identificación por `HTTP Referer`; no suprimirla | `Referrer-Policy: strict-origin-when-cross-origin` | Test de cabeceras + alerta de error 153 | RMF |
| C-19 | Reproductor ≥ 200×200 px (recomendado 480×270) | `PlayerStage` | Test E2E de dimensiones | RMF |
| C-20 | Miniaturas que inician reproducción ≥ 120×70 px | Tarjetas de catálogo | Test E2E de dimensiones | RMF |
| C-21 | Máx. un reproductor con reproducción automática por pantalla | Un solo `KaraokePlayer` en la TV | Revisión + test | RMF |
| C-22 | La reproducción automática espera a que > 50 % del reproductor sea visible | `playVideo()` tras gesto; nunca autoplay al montar | Test E2E | RMF |
| C-23 | No modificar atributos del reproductor fuera de lo documentado | Lista blanca de parámetros en el adaptador | Revisión de código | RMF |
| C-24 | No usar scraping ni APIs privadas | Lista blanca de endpoints; revisión de dependencias | Test de dependencias prohibidas | Developer Policies §III.D |
| C-25 | Atribución: mostrar el canal del video y enlace de vuelta a la fuente | Tarjeta de canción + pantalla de resultado | Revisión de UI | RMF / Branding Guidelines |
| C-26 | Respetar las directrices de marca de YouTube (sin usar la marca en el nombre del producto) | Nombre y dominio configurables, sin "YouTube" en la marca | Revisión legal | Branding Guidelines |

### 6.2 La restricción que obliga a rediseñar el modelo de negocio

> **C-15.** *"API Clients must not charge users fees for watching content in an embedded
> YouTube player."* — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) §III.F.3.a

`SPEC.md` §6.2 describe el plan FREE con *"sesiones limitadas, historial reducido, sin
personalización, máximo pequeño de participantes"*. Tres de esas cuatro restricciones son
funciones de software legítimas. La primera —**sesiones limitadas**— es la que se puede leer
como "paga para poder cantar", y es la que hay que redactar y diseñar con cuidado.

| Diseño | Veredicto |
|---|---|
| Cobrar por canción reproducida | **Prohibido**. Es literalmente una tarifa por ver contenido |
| Cobrar por minuto de reproducción | **Prohibido** |
| Bloquear la reproducción a mitad del show para mostrar un upsell | **Prohibido** y además destruye el producto |
| Mostrar publicidad propia encima o al lado para forzar el pago | Riesgo alto; puede considerarse obstrucción de la atribución |
| Limitar el número de **eventos organizados** simultáneamente | Defendible, si se comunica como capacidad del software |
| Cobrar por marca, reportes, modo operador, participantes, pantallas | **Permitido y recomendado** |
| Mantener un plan gratuito plenamente funcional para reproducir | **Recomendado**: elimina la lectura de "cobro por ver" |

**Recomendación arquitectónica:** los entitlements deben nombrar capacidades de software
(`maxConcurrentScreens`, `customBranding`, `operatorMode`, `reports`), y **ningún** entitlement
debe llamarse `canPlay`, `playbackLimit` ni nada que restrinja la reproducción. Si un
entitlement así aparece en `plan_features`, es una señal de alarma en la revisión de código.

---

## 7. Sellado de la frontera con el resto del sistema

### 7.1 Qué ve el dominio

| El dominio conoce | El dominio ignora |
|---|---|
| `VideoProvider` (interfaz) | `YT.Player`, `iframe_api` |
| `PlaybackDescriptor` (unión discriminada) | `videoId` suelto |
| `embeddableStatus` (enum propio) | Códigos numéricos de error de YouTube |
| `Availability` | `status.embeddable` de la Data API |
| `ScoreSignal` (telemetría normalizada) | `getDuration()`, `getCurrentTime()` |

### 7.2 Traducción de telemetría

El adaptador traduce el mundo de YouTube a un vocabulario propio. El motor de scoring nunca ve
una API de YouTube:

```ts
// Salida del adaptador, entrada del ScoringService (normativo)
export interface PlaybackTelemetry {
  queueItemId: string;
  startedAt: Date;             // hora de servidor
  endedAt: Date;
  positionSeconds: number;     // última posición reportada
  durationSeconds: number;     // duración estabilizada (max observado)
  knownDurationSeconds: number;// de song_sources: fuente independiente
  pauseCount: number;          // solo pausas atribuibles al cantante
  seekBackCount: number;
  endedNaturally: boolean;
  bufferingMs: number;
  errorCount: number;
}
```

`knownDurationSeconds` es la clave de integridad: comparar la duración reportada por el cliente
contra un dato que el cliente no controla permite detectar telemetría manipulada o corrompida
por publicidad, sin necesidad de confiar en el cliente.

### 7.3 Pruebas del adaptador

| Tipo | Qué se prueba | Cómo |
|---|---|---|
| Contrato | `YouTubeProvider` cumple `VideoProvider` | Test de tipos |
| Metadatos | Conversión de respuestas de API a `VideoMetadata` | Fixtures grabados (nunca llamadas reales en CI) |
| Duración | `PT1H2M3S` → 3723 s; `PT4M5S` → 245 s; `P0D` → null | Unitario |
| Embeddable | Mapeo de `status.embeddable`, `privacyStatus`, `regionRestriction` | Fixtures |
| Errores | Mapa completo de códigos → estado + mensaje | Unitario |
| Cuota | `consume_youtube_quota` corta al 80 % | Integración con BD local |
| Anti-regresión | El adaptador no expone `videoId` fuera de `PlaybackDescriptor` | Test de frontera de capas |

**CI nunca llama a la API real de YouTube.** Consumiría cuota compartida y haría los tests
dependientes de la red y de la disponibilidad de terceros. Se usan fixtures grabados.

---

## 8. Divulgación al usuario

### 8.1 Textos obligatorios

| Ubicación | Contenido mínimo |
|---|---|
| Footer del sitio | Enlace a los TdU de YouTube y a la política de privacidad propia |
| `/legal/terminos` | El usuario acepta los TdU de YouTube al usar la aplicación |
| `/legal/privacidad` | Uso de YouTube API Services; enlace a la política de privacidad de Google; datos recogidos (nickname, telemetría de reproducción, metadatos de catálogo); uso de cookies por parte de YouTube; publicidad de terceros en el reproductor; cómo solicitar el borrado (≤ 7 días) |
| `/faq` | **La puntuación inicial es recreativa y no constituye una medición profesional de afinación vocal** (`SPEC.md` §17.7) |
| Tarjeta de canción | Canal de origen + enlace de vuelta a YouTube |
| Pantalla de resultado | "Puntuación de {appName}" (deja claro que la métrica es propia) |
| `/precios` | La licencia de software **no** sustituye licencias musicales, de comunicación pública ni obligaciones del establecimiento (`SPEC.md` §5.3) |

### 8.2 Frases prohibidas

Lista negra verificada por lint de copy y por revisión de PR:

| Prohibido | Motivo |
|---|---|
| "Afinación detectada: 96 %" | Afirmación técnica falsa |
| "Notas correctas", "Precisión melódica", "Estás afinado" | Idem |
| "Análisis de voz profesional", "Evaluación vocal real" | Idem |
| "Sin publicidad", "Sin anuncios" | Imposible de cumplir: no se pueden bloquear anuncios |
| "Descarga", "Offline" | Viola los TdU |
| "Score aleatorio", "simulado", "fake" en la UI principal | Destruye la experiencia de juego (`CLAUDE.md` §19) |
| "YouTube Karaoke", "Karaoke de YouTube" como nombre de producto | Riesgo de marca (§C-26) |

**La línea que hay que caminar:** en la experiencia principal, el score es un juego y se
presenta como tal; en la documentación, es un hecho declarado. Ambas cosas a la vez, sin
mentir en ninguna de las dos.

---

## 9. Camino de salida de YouTube (estrategia, no plan inmediato)

`SPEC.md` §36 y §35 piden una arquitectura desacoplada. Este es el plan concreto:

| Fase | Acción | Esfuerzo | Cuándo |
|---|---|---|---|
| Hoy | `VideoProvider` + `song_sources` con `provider` | Ya incluido en el diseño | Fase 1 |
| Fase 4 | Adaptador de contenido licenciado (`kind: 'stream'`) | ~1 sprint | Si hay demanda comercial |
| Fase 4 | Carga de contenido propio del local (`kind: 'file'`) | ~1 sprint | Cliente comercial con su propio catálogo |
| Futuro | Migración de catálogo: `song_sources` por proveedor sin tocar `songs` | Trivial (ya normalizado) | — |

Por qué importa: el tier Commercial sobre YouTube es el punto jurídicamente más frágil del
plan (R1, R2 y R6 de `ARCHITECTURE.md` §19). Preparar la abstracción hoy cuesta un `INSERT` y
un adaptador. No prepararla cuesta reescribir el núcleo cuando el primer cliente comercial
pregunte por sus licencias musicales.

---

## 10. Observabilidad de la integración

| Señal | Objetivo | Acción si se desvía |
|---|---|---|
| Errores 101/150 por turno | < 2 % | Revisar curación del catálogo; priorizar refresco |
| Errores 153 | 0 | **Alerta inmediata**: se rompió el `Referer` o el `origin` |
| Errores 100 (eliminados) | < 1 % | Refresco nocturno; bajar `priority` de la fuente |
| Consumo de cuota diario | < 60 % | Alerta al 60 %, corte al 80 % |
| Fuentes con metadatos > 29 días | 0 | Job fallando: revisar `job_runs` |
| Timeout de `cueVideoById` | < 1 % | Revisar red del local; precarga del siguiente turno |
| Tasa de "audio_bloqueado" | Reportada por dispositivo | Revisar UX del gesto de activación en TV |
| Latencia de metadata de `videos.list` | < 500 ms p95 | Degradar: no bloquear la operación del admin |

Todo error del reproductor se registra con `session_id`, `queue_item_id`, código y dispositivo
— **sin** datos personales del cantante más allá del `participant_id` interno.

---

## 11. Estrategia de precarga y degradación

```text
Precarga (mejora la experiencia sin violar ninguna regla):
  ├─ En cuanto un turno entra en 'playing', el adaptador ejecuta
  │  cueVideoById() de la SIGUIENTE canción en una instancia OCULTA… ✗ PROHIBIDO
  │  → una segunda instancia de player violaría C-21 y C-22.
  ├─ Alternativa válida: preconnect/prefetch de recursos y aviso a la TV
  │  para que cueVideoById del siguiente turno ocurra en la MISMA instancia
  │  en cuanto el turno actual termina.
  └─ La precarga de metadatos y miniaturas sí es libre (no es un player).

Degradación:
  ├─ Realtime caído      → polling del snapshot cada 5 s + aviso al operador
  ├─ YouTube lento       → indicador "cargando pista" (no error)
  ├─ Fuente bloqueada    → fallback automático por priority
  ├─ Sin alternativa     → turno 'failed' + skip_reason, el show continúa
  └─ YouTube inaccesible → la aplicación sigue operativa: cola, ranking e
                           historial funcionan; el operador ve el aviso
```

**Nota crítica sobre la precarga:** la tentación de crear una segunda instancia del reproductor
para precargar la siguiente canción es fuerte y está **prohibida** (C-21, C-22). El diseño del
show debe asumir 1–3 segundos de transición entre turnos usando la **misma** instancia.

---

## 12. Riesgos específicos de YouTube

| # | Riesgo | P | I | Mitigación | Residual |
|---|---|---|---|---|---|
| Y1 | Cupo de 100 búsquedas/día agotado | 4 | 4 | Catálogo-first; ledger con corte al 80 %; caché de 7 días | Medio |
| Y2 | Google cambia la política de cuota sin aviso | 3 | 5 | Ledger por endpoint aislado en una función; degradar catálogo, no el producto; suscripción al RSS de revisión de los TdU | Medio |
| Y3 | Suspensión de la API key por incumplimiento de C-15 | 3 | 5 | Rediseño de la matriz de planes; revisión legal previa | **Alto si no se corrige** |
| Y4 | Video borrado o privatizado a mitad de una fiesta | 4 | 2 | Refresco nocturno + fallback + `failed` con motivo | Bajo |
| Y5 | Bloqueo regional de un video | 2 | 3 | `regionRestriction` al alta; validación periódica | Bajo |
| Y6 | Autoplay bloqueado en una Smart TV concreta | 4 | 3 | Botón de gesto + detección + reintento; **pruebas en hardware real** | Medio |
| Y7 | Anuncio mid-roll durante una actuación | 5 | 2 | No mitigable. Asumido y comunicado; el score no penaliza | Medio (aceptado) |
| Y8 | Cambio incompatible en la IFrame API | 2 | 4 | Adaptador aislado: el cambio se contiene en un archivo | Bajo |
| Y9 | Error 153 por configuración de cabeceras | 2 | 4 | `Referrer-Policy` fija; alerta inmediata; test de cabeceras en CI | Bajo |
| Y10 | El catálogo por cosecha de playlists se considera abuso | 2 | 4 | API oficial, atribución, refresco a 30 días, retiro a solicitud, revisión legal | Medio |

---

## 13. Verificación pendiente antes de la Fase 1

Debe revalidarse contra la documentación vigente y registrarse el resultado en un ADR:

| # | Afirmación a verificar | Dónde |
|---|---|---|
| 1 | Cupo de `search.list`: 100 llamadas/día en bucket propio, 1 de cuota por llamada | Quota Calculator |
| 2 | `videos.list` y `playlistItems.list`: 1 unidad, 10,000/día compartido | Quota Calculator |
| 3 | Reinicio del cupo a medianoche hora del Pacífico | Quota Calculator |
| 4 | Regla de 30 días calendario para *Non-Authorized Data* | Developer Policies §III.E.4.c-d |
| 5 | Prohibición de cobrar por ver contenido en un reproductor embebido | Developer Policies §III.F.3.a |
| 6 | Contenido obligatorio de la política de privacidad (7 puntos) | Developer Policies §III.A.2 |
| 7 | Prohibición de overlays sobre cualquier parte del reproductor | Required Minimum Functionality |
| 8 | Requisito de identificación por `HTTP Referer` y recomendación de `strict-origin-when-cross-origin` | Required Minimum Functionality |
| 9 | Un solo reproductor con reproducción automática por pantalla; visibilidad > 50 % | Required Minimum Functionality |
| 10 | Tamaños mínimos: 200×200 (recomendado 480×270) y miniaturas 120×70 | Required Minimum Functionality |
| 11 | Significado exacto del error **153** | Referencia del IFrame Player API |
| 12 | Vigencia de `modestbranding` | Referencia de parámetros del reproductor |
| 13 | Requisito de mostrar canal y enlace de vuelta | RMF / Branding Guidelines |
| 14 | Umbral de "alto número de requests" que exige credenciales adicionales para el embed | Required Minimum Functionality / Developer Policies §Usage and Quotas |

Los puntos 4, 5, 7, 8 y 11 son los que más impactan la arquitectura. **Ninguno debe darse por
sentado al iniciar la Fase 1.**
