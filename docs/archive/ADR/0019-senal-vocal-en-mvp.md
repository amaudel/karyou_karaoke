# ADR-0019 — Adelantar la señal de actividad vocal al MVP

- **Estado:** Propuesto — **requiere decisión de producto (C3)**
- **Fecha:** 2026-09-15
- **Decisores:** Producto, Arquitectura
- **Relacionado:** ADR-0012, `docs/ARCHITECTURE.md` §11.4, `SPEC.md` §17.8, §19

## Contexto

`SPEC.md` §17.2 enumera las señales disponibles para el scoring del MVP: porcentaje completado,
pausas, abandono, historial, dificultad, racha y variación pseudoaleatoria con seed. §17.8 deja
el micrófono para la Fase 2.

Al analizar esas señales con honestidad aparece un problema de producto que no se resuelve con
mejor código:

> **Un cantante que no toca nada completa la canción siempre.**

En una sesión real, el invitado aprieta "cantar" y el video se reproduce hasta el final sin
intervención. `completionRatio` ≈ 1, `interruptionCount` = 0, `endedNaturally` = true. **Casi
todos los turnos producen exactamente las mismas señales.** Toda la varianza tendría que venir
del PRNG, que es precisamente el "número aleatorio" que `CLAUDE.md` §19 prohíbe.

El resultado previsible es una experiencia que se siente arbitraria tras la tercera canción:
"otra vez 84, otra vez 86". El ranking pierde significado y el diferenciador del producto
—"puntuación divertida" según `SPEC.md` §3— se convierte en su punto más débil.

Al mismo tiempo, `SPEC.md` §17.8 ya describe la solución y §19 la sitúa en la Fase 2: analizar
**actividad vocal** (presencia de voz, tiempo cantado, intensidad, continuidad, estabilidad).
Eso **no es pitch detection**: es análisis de energía y actividad sobre la señal de micrófono,
sin referencia musical y sin afirmar afinación.

## Decisión

**Se adelanta la captura de señal de actividad vocal al MVP, con alcance reducido y sin
referencia musical.**

```ts
export interface VoiceActivitySignal {
  voicedRatio: number;      // 0..1  fracción del tiempo con voz detectada
  energyMean: number;       // 0..1  intensidad media durante el tiempo cantado
  energyStability: number;  // 0..1  1 = intensidad sostenida, 0 = errática
  continuityScore: number;  // 0..1  continuidad (penaliza silencios largos)
  segmentsActive: number;   // número de tramos con voz
}
```

Implementación:

| Aspecto | Decisión |
|---|---|
| Tecnología | Web Audio API (`getUserMedia` + `AnalyserNode`) en el cliente. No se envía audio a ningún servidor |
| Procesamiento | Solo RMS y detección de actividad por umbral en el cliente. Se agrega por ventanas de 250 ms |
| Privacidad | **El audio nunca sale del dispositivo.** Solo se envían cinco números agregados por turno |
| Permiso | Se solicita en el gesto de "Iniciar show" de la TV. Si se deniega, el motor opera en modo telemetría |
| Honestidad | Se mide **actividad vocal**, que es un hecho verificable. Nunca se afirma afinación, notas ni comparación con la melodía |
| UI | Sin cambios de contrato: el `ScoreResult` sigue teniendo `rhythm`, `energy`, `interpretation`. Se documenta internamente qué señal alimenta cada uno |
| Motor | Los insumos entran como `ScoreSignalProvider` enchufable; añadir señales nuevas no cambia el contrato de salida (ADR-0012) |

Configuración por sesión: `sessions.settings.voice_scoring = 'off' | 'optional' | 'required'`.
Por defecto `optional`: si el operador no quiere micrófono, el show funciona igual.

## Consecuencias

### Positivas

- **El score tiene una base real y honesta.** "Cantaste el 87 % de la canción con energía
  sostenida" es una afirmación verdadera y verificable. No es una medición profesional de
  afinación y no se presenta como tal.
- **La varianza existe de verdad.** Cantar a media voz, dejar de cantar en el coro o cantar con
  energía produce resultados distintos. La distribución objetivo de `SPEC.md` §17.3 se alcanza
  porque los usuarios **hacen cosas distintas**, no porque el PRNG lo decida.
- **El ranking adquiere significado.** Gana quien canta más y mejor sostenido, no quien tuvo mejor
  suerte con el generador.
- **Es la base natural de la Fase 3** (pitch detection): el pipeline de captura, agregación y
  transporte ya estará construido y probado.
- La privacidad se preserva: el audio no se transmite ni se almacena, solo agregados numéricos.
  Esto es una ventaja de cumplimiento, no solo una postura ética.

### Negativas / costos asumidos

- **Un sprint adicional** de trabajo en el MVP (captura, permisos, agregación, calibración de
  umbrales, pruebas en dispositivos reales).
- **Requiere permiso de micrófono**, que algunos usuarios denegarán. Mitigado con el modo
  `optional` y con no penalizar la ausencia de señal.
- **Los umbrales dependen del hardware y del entorno.** Un micrófono de Smart TV capta el audio
  del propio altavoz; el ruido de un bar es muy distinto al de una sala. La calibración inicial
  automática (medir el ruido de fondo antes de la primera canción) es necesaria, no opcional.
- **Riesgo de eco y realimentación**: sin auriculares, el micrófono capta la pista de karaoke.
  Mitigación: la señal se usa como **indicador de actividad relativa**, con calibración de fondo y
  sin pretender aislar la voz. Es suficiente para el objetivo, que no es medir afinación.
- **No es un micrófono profesional.** Los resultados no serán comparables entre dispositivos.
  Aceptable para una puntuación recreativa, e inconsistente con presentarla como medición.
- Hay que documentar en la política de privacidad el acceso al micrófono y su finalidad, y añadirlo
  a `Permissions-Policy: microphone=(self)`.
- Si el micrófono falla a mitad de canción, el motor debe degradar limpiamente al modo telemetría
  y **no** penalizar al cantante.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Mantener solo telemetría de reproducción + PRNG (plan actual del `SPEC.md`) | Señales casi constantes → toda la varianza es aleatoria → viola `CLAUDE.md` §19 y el producto se siente arbitrario. Es la razón principal de este ADR |
| Pitch detection en el MVP | Requiere **referencia musical propia o autorizada**. No se puede extraer audio de YouTube (`SPEC.md` §19, `CLAUDE.md` §5). Bloqueado por una dependencia externa, no por esfuerzo |
| Dejar el scoring como un juego puramente declarado ("es solo diversión") | Destruye el diferenciador. `SPEC.md` §17.1 pide explícitamente que se sienta como una evaluación auténtica |
| Aplausos de la audiencia desde el móvil | Señal real y barata, pero depende de que los invitados participen activamente. Se recomienda como **complemento** (`audienceBoost`), no como sustituto |
| Un botón de "esfuerzo" o "ánimo" que el cantante pulsa | Se corrompe en cuanto alguien entiende la mecánica: basta pulsar siempre el máximo |
| Medir la duración de la canción como proxy de esfuerzo | No distingue a quien canta de quien se fue. Un video de 5 minutos siempre da el mismo resultado |
| Posponer a la Fase 2 como indica `SPEC.md` | Válido, pero implica lanzar el MVP con un motor que se sentirá arbitrario, y corregirlo después es un cambio de percepción, no de código: los usuarios ya habrán formado su opinión |

## Verificación

| Control | Dónde |
|---|---|
| **El audio no sale del dispositivo** | Test que inspecciona el payload de telemetría: solo cinco números. Revisión de código de red |
| Sin afirmaciones de afinación en la UI ni en la API | Lista negra de copy + revisión de nombres de campos |
| Degradación sin micrófono | Test: permiso denegado → el score se calcula en modo telemetría, sin penalización |
| Calibración de ruido de fondo | Test con audio sintético (silencio, ruido constante, voz simulada) |
| Distribución recalibrada | `scripts/calibrate-scoring.ts` con las nuevas señales: cada banda dentro de ±3 pp |
| Fallo del micrófono a mitad de canción | Test: el motor degrada y la canción termina sin error visible |
| Divulgación en la política de privacidad | Checklist legal |
| `Permissions-Policy: microphone=(self)` | Test de cabeceras |

**Señal de revisión:** si en pruebas reales la señal de actividad resulta demasiado ruidosa para
aportar valor (por ejemplo, el micrófono de la TV capta la pista y no distingue la voz), la
decisión se revierte y el MVP se lanza con el motor de telemetría, documentando la limitación en
la FAQ. **Este es el único ADR cuyo resultado depende de una prueba empírica** y por eso debe
validarse en la Fase 0 con hardware real, antes de comprometer el sprint.
