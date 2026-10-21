# ADR-0009 — Sin overlays sobre el reproductor: regiones hermanas en la pantalla TV

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Diseño, Cumplimiento
- **Relacionado:** ADR-0001, `docs/YOUTUBE-INTEGRATION.md` §5.3, `docs/ARCHITECTURE.md` §2.4

## Contexto

`SPEC.md` §10 pide una pantalla TV con reproductor, canción actual, cantante, siguiente
cantante, cola resumida, QR, identidad del evento, barra de progreso y estado de reproducción.
La forma natural de diseñar eso en la web es **superponer** una capa de UI sobre el video: es la
estética que tienen las interfaces de karaoke y de streaming.

Al verificar los requisitos de YouTube aparece una restricción que elimina esa opción por
completo. De [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality):

> *"You must not display overlays, frames, or other visual elements in front of any part of a
> YouTube embedded player, including player controls. Similarly, you must not use overlays,
> frames or other visual elements to obscure any part of an embedded player, including player
> controls."*

Y adicionalmente:

> *"A page or screen must not have more than one YouTube player that automatically plays content
> simultaneously."*

No es una recomendación de diseño: es una condición de uso de la API. Además, la restricción es
técnicamente correcta: un `div` superpuesto con `z-index` puede interceptar clics y bloquear los
controles del reproductor, lo que constituye obstrucción aunque la intención sea estética.

## Decisión

**La pantalla TV se compone de regiones hermanas que nunca se superponen. El área del
reproductor es intocable.**

```text
┌──────────────────────────────────────────────┬───────────────────────┐
│                                              │  CANTANDO AHORA       │
│   <div id="yt-player">   caja 16:9           │  Andrés               │
│                                              │                       │
│   Ningún elemento se dibuja encima.          │  SIGUIENTE            │
│   Sin position:absolute. Sin ::after.        │  María — Selena       │
│   Sin pointer-events. Sin filter/transform.  │                       │
│                                              │  COLA                 │
│                                              │  1. Luis  2. Ana      │
├──────────────────────────────────────────────┤                       │
│  Barra de estado (fuera del stage)           │  QR + código de sala   │
└──────────────────────────────────────────────┴───────────────────────┘
```

Reglas obligatorias:

| # | Regla |
|---|---|
| 1 | `PlayerStage` es un contenedor con `overflow: hidden` sobre **su propio** contenido, y ningún hijo posicionado fuera de su caja |
| 2 | Ningún elemento de la aplicación puede tener `position: absolute/fixed` que intersecte el rectángulo de `#yt-player` |
| 3 | Prohibido `z-index` sobre o dentro del contenedor del player |
| 4 | Prohibido CSS sobre el `iframe`: `filter`, `transform`, `opacity`, `pointer-events`, `clip-path` |
| 5 | La animación de scoring (`analyzing` → reveal), el contador, el mensaje y el ranking viven en `ShowPanel`, **fuera** del stage |
| 6 | Exactamente **un** `KaraokePlayer` en la pantalla TV. La búsqueda móvil usa miniaturas con *tap-to-play*, nunca autoplay |
| 7 | El "Iniciar show" es un elemento hermano, no un overlay sobre el reproductor |
| 8 | El modo fullscreen usa la pantalla completa del navegador, no un `position: fixed` que cubra el player |

**Verificación automatizada obligatoria:** un test Playwright obtiene el `boundingBox()` de
`#yt-player` y de **todos** los demás elementos visibles con área, y falla el build si alguno
interseca. Un `z-index` mal puesto rompe CI, no la relación con Google.

## Consecuencias

### Positivas

- Cumplimiento verificable de forma automática, no por disciplina de revisión visual.
- **Mejor legibilidad desde lejos.** Los datos del show están en un panel lateral con contraste
  alto, en lugar de superpuestos sobre video con luminancia variable. En una TV a 3 metros, un
  panel sólido con texto grande se lee mejor que un chip translúcido sobre video.
- La animación de scoring no tapa la canción ni los controles, y el cantante siempre puede
  pausar o saltar.
- El diseño es robusto ante cambios del reproductor: no dependemos de las dimensiones internas
  del iframe.

### Negativas / costos asumidos

- **El área del reproductor es menor** que si la UI fuera superpuesta. Con 16:9 en 1920×1080 y un
  panel de 420 px, el video queda en ~1500×844: sigue siendo un tamaño excelente para una TV,
  pero es una decisión de diseño forzada.
- **Se pierde el lenguaje visual "karaoke"** de texto sobre el video (letras, brillos,
  indicadores). Hay que compensar con el panel lateral bien diseñado. Es una restricción de
  cumplimiento, no una preferencia.
- La barra de progreso no puede estar sobre el video: va debajo del stage o en el panel. Menos
  intuitiva que superpuesta, pero correcta.
- La lista de la cola compite por espacio con la identidad del evento. Requiere jerarquía visual
  disciplinada.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Overlay translúcido sobre el video (estilo karaoke clásico) | Incumple los requisitos de YouTube. Riesgo de suspensión de la API key |
| Overlay solo en los bordes del video, sin cubrir los controles | La norma prohíbe elementos **delante de cualquier parte** del reproductor, no solo de los controles. Un borde superpuesto sigue siendo un overlay |
| Segundo reproductor pequeño para previsualizar la siguiente canción | Viola explícitamente "no more than one YouTube player that automatically plays simultaneously". Solo sería admisible sin reproducción automática (una miniatura), y una miniatura ya cumple esa función |
| Reproductor en pantalla completa y UI en una segunda ventana | Mala experiencia en Smart TV; el usuario no puede ver el QR ni la cola; complica el fullscreen |
| Ocultar el video y mostrar solo la UI durante la animación de scoring | Ocultar el reproductor durante la reproducción puede interpretarse como manipulación del player. Además rompe la continuidad visual del show |
| Renderizar nuestro propio `<video>` con la URL del stream | Es extracción de contenido: viola los TdU y `CLAUDE.md` §5 |

## Verificación

| Control | Dónde | Falla si |
|---|---|---|
| Intersección de rectángulos | `tests/e2e/player-overlay.spec.ts` | Cualquier elemento visible interseca `#yt-player` |
| Un solo player en la TV | Test que cuenta `iframe[src*="youtube"]` | Se detecta más de uno |
| Sin CSS sobre el iframe | Test que inspecciona `getComputedStyle` del iframe | `filter`/`transform`/`opacity` ≠ valores por defecto |
| Dimensiones mínimas | Test que valida ≥ 480×270 | El stage es más pequeño |
| Sin autoplay al montar | Test que verifica `player.getPlayerState()` tras la carga | El estado es `PLAYING` sin gesto previo |
| Miniaturas ≥ 120×70 | Test de las tarjetas de canción | Una tarjeta reproducible es más pequeña |

**Señal de revisión:** si Google publica una API de overlays para desarrolladores (existe un
formulario de solicitud de aprobación para modificar la UI del reproductor), esta decisión se
revisa — pero solo con aprobación **por escrito** de YouTube, nunca por interpretación propia.
