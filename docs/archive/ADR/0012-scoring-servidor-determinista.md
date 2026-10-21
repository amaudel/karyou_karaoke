# ADR-0012 — Scoring calculado en servidor, determinista y con seed

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto
- **Relacionado:** ADR-0019, `docs/ARCHITECTURE.md` §11, `docs/DATABASE.md` §7.2, `CLAUDE.md` §17–§20

## Contexto

`CLAUDE.md` §19 es explícito en tres puntos que se refuerzan entre sí:

1. *"Nunca implementar el score como un simple número aleatorio generado en la UI."*
2. *"Si `ended` llega dos veces no generar dos scores."*
3. Los subpuntajes deben correlacionarse con el total y la distribución debe evitar que todos
   saquen 90+.

Y el `SPEC.md` §17 pide que la puntuación *"se sienta como una evaluación auténtica"* sin
afirmar análisis vocal inexistente.

Un score calculado en el cliente tiene dos problemas definitivos: es falsificable (cualquiera
puede abrir la consola y enviar 100) y sus pesos viven en el bundle, por lo que ajustar la
distribución requiere un despliegue.

Un score generado con `Math.random()` en el servidor tiene otro problema: no es reproducible,
no es auditable, y repetir la misma canción produce resultados incoherentes que delatan el
mecanismo.

## Decisión

**El score se calcula en el servidor, dentro de la RPC que cierra el turno, con un generador
pseudoaleatorio sembrado de forma determinista.**

```text
complete_queue_item(queue_item_id, telemetry)  [SECURITY DEFINER]
  ├─ 1. ¿Ya existe score para este queue_item?  → devolver el existente (idempotencia)
  ├─ 2. Bloquear el queue_item (FOR UPDATE)
  ├─ 3. Validar actor: screen client emparejado o dueño de la sesión
  ├─ 4. Validar la ventana de reproducción contra playback_events
  ├─ 5. app.compute_performance_score(item, telemetry)   ← motor en la base
  ├─ 6. INSERT en scores ON CONFLICT (queue_item_id) DO NOTHING
  └─ 7. Cerrar turno + avanzar session_playback a 'analyzing'
```

Elementos normativos:

| # | Elemento | Implementación |
|---|---|---|
| 1 | **Idempotencia** | `UNIQUE (queue_item_id)` en `scores` + `ON CONFLICT DO NOTHING`. Es un invariante de base de datos, no una comprobación en código |
| 2 | **Seed determinista** | `HMAC-SHA256(SCORING_SECRET, session_id ‖ participant_id ‖ song_source_id ‖ attempt_no)` |
| 3 | **PRNG explícito** | `src/domain/scoring/entropy.ts`. `Math.random()` prohibido por lint en todo el repositorio |
| 4 | **Coherencia total ↔ subpuntajes** | Se calcula `total` primero; los subpuntajes se derivan como `clamp(total + δᵢ)` con `\|δᵢ\| ≤ 4` del mismo PRNG |
| 5 | **Trazabilidad** | Se persisten `engine_version`, `seed_hash` (sha256 del seed, no el seed) e `inputs` (jsonb) |
| 6 | **Anti-manipulación** | Validación de ventana temporal y de telemetría contra `song_sources.duration_seconds`, que el cliente no controla |
| 7 | **Calibración medida** | Test de 100,000 simulaciones con semillas fijas que verifica la distribución objetivo |

Distribución objetivo (medida, no supuesta):

| Banda | Rango | Frecuencia objetivo |
|---|---|---|
| Bajo | 50–69 | < 3 % (solo abandono real) |
| Normal | 70–79 | ~25 % |
| Bueno | 80–89 | ~40 % |
| Excelente | 90–96 | ~28 % |
| Excepcional | 97–100 | ~4 % (techo duro del 6 %) |

`completionRatio < 0.5` acota el total a ≤ 69: la única señal honesta disponible sin micrófono
(terminar vs. abandonar) debe dominar el resultado.

## Consecuencias

### Positivas

- **No falsificable desde el cliente.** Los pesos y el secreto viven en el servidor. Un cliente
  que manipula telemetría puede mover unos pocos puntos, no fabricar un 100.
- **Idempotencia garantizada por la base de datos.** `ended` duplicado, reconexión, doble clic y
  reintento de red producen un único score. Un duplicado corrompería el ranking de la noche.
- **Auditable y reproducible.** Con `engine_version`, `seed_hash` e `inputs` se puede recalcular
  un score histórico para investigar un sesgo, sin afectar el ranking ya mostrado.
- **Ajustar la distribución no requiere desplegar.** Los pesos son configurables; las
  constantes viven en la función SQL.
- **La coherencia total/subpuntajes es estructural.** Al derivar los subpuntajes del total, es
  imposible mostrar "Ritmo 51 / Energía 99 / Total 93".
- La distribución se **mide** en CI: si un cambio de pesos aplana la curva, el test falla.

### Negativas / costos asumidos

- **La lógica de scoring vive en SQL (`plpgsql`).** Es menos ergonómico de testear y de
  refactorizar que TypeScript puro. Mitigación: el algoritmo se replica en el dominio TS como
  implementación de referencia y un test de paridad compara ambos sobre 1,000 semillas fijas.
- El motor en la base recibe menos herramientas (sin `async`, sin librerías) y hay que ser
  disciplinado con la aritmética.
- **Acopla el scoring al motor de base de datos.** Aceptable: el cálculo es aritmética simple y
  Postgres es la dependencia central del sistema.
- Un score calculado en el servidor exige un viaje de red antes de poder mostrar el resultado.
  Con ~50 ms típicos y una animación de 4–6 s planificada, es irrelevante.
- Hay que gestionar `SCORING_SECRET` como secreto crítico: si se filtra, un atacante podría
  predecir resultados (no fabricarlos, porque el cálculo sigue siendo del servidor).

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Score en el cliente | Falsificable en 10 segundos con la consola del navegador. Prohibido explícitamente por `CLAUDE.md` §19 |
| Score en el servidor con `Math.random()` | No reproducible, no auditable y sin coherencia entre repeticiones. `CLAUDE.md` §20 lo prohíbe |
| Seed basado en `Date.now()` o en un contador global | Repetir la misma canción en la misma sesión daría resultados incomparables. El seed compuesto permite que "repetir la misma canción no genere resultados absurdos" (`SPEC.md` §17.2) |
| Motor de scoring en un microservicio aparte | Salto de red en el camino crítico y un despliegue más que mantener, sin beneficio a esta escala |
| Guardar el score y calcularlo en el cliente solo para mostrar | El score guardado es la fuente de verdad del ranking; calcularlo de nuevo en el cliente abre la puerta a discrepancias entre lo mostrado y lo persistido |
| Distribución uniforme 50–100 | El 40 % de los resultados serían 95+, y el ranking perdería todo significado. `SPEC.md` §17.3 lo descarta |
| Introducir aleatoriedad pura para "más emoción" | Es exactamente lo que `CLAUDE.md` §19 y §20 prohíben y lo que destruye la percepción de autenticidad |

## Verificación

| Control | Dónde |
|---|---|
| Idempotencia | `supabase/tests/11_playback_transitions.sql`: dos `complete_queue_item` → 1 score, el segundo devuelve `already_completed = true` |
| Distribución | `scripts/calibrate-scoring.ts` + test de CI: 100,000 simulaciones dentro de ±3 pp de cada banda; 97+ ≤ 6 % |
| Coherencia de subpuntajes | Test: para todo resultado, `\|sub - total\| ≤ 4` |
| Determinismo | Test: misma seed → mismo resultado, 1,000 iteraciones |
| Paridad SQL ↔ TS | Test que compara ambos motores sobre 1,000 semillas |
| Ningún `Math.random()` | Regla de lint en todo el repositorio salvo `entropy.ts` |
| Un cliente no puede insertar scores | `supabase/tests/05_rls_scores_test.sql` |
| Telemetría imposible se rechaza | Test unitario de las validaciones de rango |

**Señal de revisión:** si se aprueba el ADR-0019 (señal vocal real), los pesos deben recalibrarse
con los nuevos insumos, el test de distribución debe rehacerse y `engine_version` debe
incrementarse para distinguir los scores de cada motor.
