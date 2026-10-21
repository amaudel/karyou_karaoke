# ADR-0001 — YouTube IFrame Player como única vía de reproducción

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto, Legal
- **Relacionado:** `docs/YOUTUBE-INTEGRATION.md`, ADR-0005, ADR-0018

## Contexto

El producto necesita reproducir pistas de karaoke. Existen tres caminos técnicos posibles:

1. **Reproductor embebido oficial de YouTube** (IFrame Player API).
2. **Extracción de audio/video** de YouTube (descarga o streaming directo de la fuente),
   con reproducción en un reproductor propio.
3. **Contenido licenciado o propio** (archivos o streams con derechos).

`CLAUDE.md` §5 prohíbe explícitamente descargar videos, descargar o extraer audio, almacenar
copias, eliminar branding, ocultar controles, bloquear publicidad, reproducir audio oculto y
usar APIs privadas. Las [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
prohíben además separar los componentes audiovisuales y crear métricas derivadas de API Data.

La opción 2 no es un atajo técnico: es la vía por la que las aplicaciones de karaoke basadas en
YouTube pierden la API y, con frecuencia, reciben requerimientos de terceros. Además, el
contenido de karaoke en YouTube pertenece a sus canales; extraerlo priva al titular de su
monetización.

## Decisión

**Toda reproducción ocurre en el reproductor embebido oficial de YouTube, sin excepción.**
El sistema nunca descarga, almacena, separa ni reencoda contenido audiovisual de YouTube, ni
modifica el reproductor fuera de los parámetros documentados por la API.

Decisiones derivadas, todas obligatorias:

| # | Regla |
|---|---|
| 1 | La base de datos guarda **referencias** (`external_id`), nunca contenido |
| 2 | Prohibido `MediaRecorder`, `captureStream`, Web Audio sobre el iframe, o cualquier lectura del flujo del reproductor |
| 3 | Prohibido interceptar, estilizar o superponer elementos sobre el iframe |
| 4 | Prohibido bloquear, ocultar o alterar la publicidad |
| 5 | Prohibido `controls=0`, `pointer-events: none` o cualquier CSS sobre el player |
| 6 | El `iframe` debe estar visible (≥ 50 %) antes de cualquier reproducción |
| 7 | CI bloquea dependencias de descarga (`ytdl-core`, `youtube-dl`, `pytube` y similares) |

## Consecuencias

### Positivas

- Cumplimiento de los TdU de YouTube y de `CLAUDE.md` §5.
- El contenido se reproduce con branding, controles y monetización del titular.
- Un video que se retira deja de estar disponible para todos de forma automática.
- Cero costo de almacenamiento y de CDN de video.

### Negativas / costos asumidos

- **No se puede prometer "sin publicidad".** Un pre-roll o mid-roll puede interrumpir una
  actuación. Es una limitación real del producto, no un defecto evitable.
- **No hay control sobre la calidad ni la versión de la pista.** Depende de lo que exista en
  YouTube.
- **Autoplay limitado por el navegador**: exige un gesto explícito del operador.
- **La línea de tiempo no es de fidelidad perfecta**: la duración puede verse afectada por
  anuncios (mitigado en `docs/YOUTUBE-INTEGRATION.md` §5.6).
- Dependencia de un tercero para la función central (mitigada por ADR-0018).

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Descargar audio y reproducir con reproductor propio | Viola los TdU de YouTube y `CLAUDE.md` §5. Riesgo existencial: pérdida de la API key y del producto |
| Enmascarar el iframe con CSS para "integrarlo" en el diseño | Prohibido: elimina branding, oculta controles y superpone elementos |
| Usar YouTube Premium institucional para eliminar anuncios | El uso de Premium es personal, no colectivo para terceros en un local. No es una solución legítima |
| Usar APIs privadas o endpoints internos de YouTube | Prohibido por `CLAUDE.md` §5 y frágil por definición |
| Construir solo con contenido licenciado | Es la estrategia correcta a largo plazo (ADR-0018) pero inviable como punto de partida: no existe catálogo propio ni capital para licenciarlo |

## Verificación

| Control | Dónde |
|---|---|
| Lista negra de dependencias en CI | `scripts/check-forbidden-deps` |
| Lista blanca de endpoints de red | Revisión de código + CSP: `frame-src`/`script-src` solo dominios de YouTube |
| Storage limitado a `image/*` | Configuración del bucket |
| Test de intersección de rectángulos del player | Playwright, `tests/e2e/player-overlay.spec.ts` |
| Revisión de PR con checklist de `CLAUDE.md` §5 | Plantilla de pull request |

**Señal de revisión de esta decisión:** si aparece en el backlog cualquier tarea de "descargar",
"cachear audio", "reproducir sin internet" o "quitar anuncios", esta decisión está siendo
erosionada y debe citarse este ADR.
