# Architecture Decision Records (ADR)

Registro de decisiones de arquitectura de la plataforma de karaoke. Cada ADR documenta **una**
decisión, su contexto, sus consecuencias y las alternativas descartadas.

## Por qué existen

Una decisión sin registro se vuelve una opinión. En seis meses nadie recordará por qué la cola
usa `numeric` en lugar de `integer`, por qué los invitados tienen identidad anónima, o por qué
está prohibido poner un `z-index` sobre el reproductor. Un ADR convierte esas decisiones en
conocimiento transferible y, sobre todo, evita que se deshagan por desconocimiento.

## Estados

| Estado | Significado |
|---|---|
| **Propuesto** | Escrito y a la espera de revisión. **No implementar todavía.** |
| **Aceptado** | Aprobado. Se implementa y se defiende en revisiones de código. |
| **Rechazado** | Evaluado y descartado. Se conserva para no volver a discutirlo. |
| **Reemplazado por ADR-XXXX** | Superado. No se elimina: la historia importa. |

## Plantilla

```markdown
# ADR-XXXX — Título en una línea

- **Estado:** Propuesto
- **Fecha:** YYYY-MM-DD
- **Decisores:** …
- **Relacionado:** ADR-YYYY, docs/ARCHITECTURE.md §N

## Contexto
Qué problema existe, qué restricciones aplican, qué se verificó.

## Decisión
Qué se decide, en una frase, y cómo se implementa.

## Consecuencias
### Positivas
### Negativas / costos asumidos

## Alternativas consideradas
Cada una con el motivo concreto del descarte.

## Verificación
Cómo se comprueba que la decisión se respeta, y qué señal indicaría que debe revisarse.
```

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-youtube-iframe-player-unico.md) | YouTube IFrame Player como única vía de reproducción | Propuesto |
| [0002](0002-monolito-modular-nextjs.md) | Monolito modular en Next.js con fronteras de capas verificadas | Propuesto |
| [0003](0003-supabase-rls-control-acceso.md) | Supabase + RLS como control de acceso principal | Propuesto |
| [0004](0004-invitados-auth-anonimo.md) | Invitados mediante Supabase Anonymous Auth | Propuesto |
| [0005](0005-catalogo-propio-busqueda.md) | Catálogo propio como única fuente de búsqueda de usuarios | Propuesto |
| [0006](0006-songs-song-sources.md) | `songs` → `song_sources`: N fuentes reproducibles por canción | Propuesto |
| [0007](0007-cola-sort-key-fraccional.md) | Orden de cola por `sort_key` fraccional con advisory lock | Propuesto |
| [0008](0008-estado-playback-servidor-cas.md) | Estado de reproducción autoritativo en servidor con CAS por revisión | Propuesto |
| [0009](0009-sin-overlays-player-tv.md) | Sin overlays sobre el reproductor: regiones hermanas en la TV | Propuesto |
| [0010](0010-referrer-policy-obligatoria.md) | `Referrer-Policy: strict-origin-when-cross-origin` obligatoria | Propuesto |
| [0011](0011-licencia-por-pantallas-concurrentes.md) | Límite de licencia por pantallas concurrentes, no por dispositivos | Propuesto |
| [0012](0012-scoring-servidor-determinista.md) | Scoring calculado en servidor, determinista y con seed | Propuesto |
| [0013](0013-bootstrap-catalogo-playlists.md) | Bootstrap del catálogo con `playlistItems.list`, no `search.list` | Propuesto |
| [0014](0014-regla-30-dias-metadatos.md) | Regla de 30 días en tres capas: columna, job y RLS | Propuesto |
| [0015](0015-realtime-snapshot-mas-deltas.md) | Realtime por `postgres_changes` + snapshot RPC como base | Propuesto |
| [0016](0016-auth-cookies-httponly.md) | Sesión en cookies httpOnly vía `@supabase/ssr` | Propuesto |
| [0017](0017-activacion-manual-licencias.md) | Activación manual de licencias con modelo de pagos agnóstico | Propuesto |
| [0018](0018-planes-sin-cobro-por-reproduccion.md) | Planes que no cobran por reproducción + camino de salida de YouTube | Propuesto |
| [0019](0019-senal-vocal-en-mvp.md) | Adelantar la señal de actividad vocal al MVP | Propuesto |
| [0020](0020-estados-cola-failed-skip-reason.md) | Añadir `failed` y `skip_reason` a los estados de cola | Propuesto |

## Convenciones

- Un ADR se escribe **antes** de implementar la decisión.
- Un ADR no se edita para cambiar la decisión: se escribe uno nuevo que la reemplaza.
- Los ADR afectados por una decisión se actualizan solo en su campo `Estado` y en el índice.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md` y `docs/YOUTUBE-INTEGRATION.md` referencian los ADR;
  si un documento contradice a un ADR, gana el ADR y el documento se corrige.
