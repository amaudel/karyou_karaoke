# ADR-0020 — Añadir `failed` y `skip_reason` a los estados de cola

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Operaciones
- **Relacionado:** ADR-0006, ADR-0007, `docs/DATABASE.md` §3 y §5.4, `SPEC.md` §14

## Contexto

`SPEC.md` §14 define seis estados para `queue_items`:

```text
waiting · ready · playing · completed · skipped · cancelled
```

`CLAUDE.md` §23 pide preferir enums sobre booleanos ambiguos, lo cual se cumple. El problema no es
la falta de un enum, sino que **los seis estados no cubren un caso que ocurre en todas las fiestas
reales**: el turno que no se puede reproducir porque ninguna fuente de la canción está disponible
en ese momento.

Con los estados actuales, ese caso tiene que registrarse como `skipped`. Y aquí aparece el
problema: `skipped` significa simultáneamente al menos cuatro situaciones distintas:

1. El operador saltó la canción porque el cantante se fue.
2. El cantante canceló a última hora.
3. El video dejó de ser embebible a mitad del show.
4. La red del local se cayó y el reproductor no cargó.

Las consecuencias de confundirlas son concretas y operativas:

| Consecuencia | Detalle |
|---|---|
| **El admin no puede detectar pistas rotas** | El reporte de "canciones que fallaron" sería en realidad "canciones que fallaron o que alguien saltó". La señal se pierde en el ruido y el catálogo no mejora |
| **El scoring no puede distinguir justicia de fallo** | Un turno `failed` no debe penalizar al cantante; un turno abandonado sí. Sin distinción, el motor castiga a quien no pudo cantar por un problema técnico |
| **El historial miente al usuario** | "Saltaste esta canción" cuando en realidad no se pudo reproducir. Es una acusación falsa en la pantalla de resultados |
| **El ranking se contamina** | Un score bajo por fallo técnico compite en el promedio con scores reales |
| **Soporte no puede diagnosticar** | Ante "no funcionó mi canción", no hay forma de saber si fue el video, la red o el operador |

`SPEC.md` §35 ya pide una mitigación para videos eliminados ("verificación, estado `active`,
reporte de usuario, alternativas por canción"). El ADR-0006 añade las alternativas; este ADR añade
la trazabilidad de por qué fallaron todas.

## Decisión

**Se añaden un estado y un enum de motivo a `queue_items`:**

```sql
create type queue_status as enum (
  'waiting', 'ready', 'playing', 'completed', 'skipped', 'cancelled', 'failed'
);

create type skip_reason as enum (
  'unavailable',   -- ninguna fuente reproducible (fallo técnico)
  'operator',      -- el operador decidió saltarla
  'participant',   -- el cantante se fue o se arrepintió
  'timeout',       -- no se presentó en un tiempo razonable
  'error'          -- error inesperado del reproductor
);
```

Reglas:

| # | Regla |
|---|---|
| 1 | `skip_reason` es **obligatorio** cuando `status ∈ (skipped, failed, cancelled)` |
| 2 | `failed` se reserva exclusivamente para fallos técnicos de reproducción; nunca para decisiones humanas |
| 3 | Un turno `failed` **no genera score** y **no aparece en el ranking** |
| 4 | Todo `failed` incrementa `song_sources.fail_count` y registra un `playback_event` de tipo `errored` |
| 5 | La UI muestra mensajes distintos por motivo: *"Esta pista no se pudo reproducir"* (`unavailable`) frente a *"Se pasó al siguiente turno"* (`operator`) |
| 6 | El panel de admin agrupa `failed` + `skip_reason = 'unavailable'` como **reporte de catálogo a reparar** |

Restricción de integridad:

```sql
constraint ck_queue__reason_required check (
  (status in ('skipped', 'failed', 'cancelled') and skip_reason is not null)
  or (status not in ('skipped', 'failed', 'cancelled') and skip_reason is null)
);
```

## Consecuencias

### Positivas

- **Reporte real de catálogo roto.** El admin ve exactamente qué fuentes fallaron, cuántas veces y
  con qué código de error. Es la entrada del trabajo de curación y la salida del sistema de
  reportes de usuarios.
- **El scoring es justo.** Un fallo técnico no produce un score bajo: produce **ningún** score. La
  diferencia entre "no pudo cantar" y "no quiso cantar" deja de ser invisible.
- **El historial no miente.** El participante ve "no se pudo reproducir esta pista" en lugar de un
  reproche falso.
- **El ranking no se contamina** con resultados de turnos que nunca ocurrieron.
- **Soporte tiene datos.** "¿Qué pasó con mi canción?" tiene una respuesta con causa, hora y
  código de error.
- El sistema de fallback del ADR-0006 tiene dónde registrar su resultado: si la fuente primaria
  falla y la secundaria funciona, hay `playback_events.errored` con `queue_item` en `completed`;
  si ambas fallan, el turno es `failed` con motivo `unavailable`.

### Negativas / costos asumidos

- **Un valor más en un enum y un campo más en la tabla.** Costo de implementación bajo.
- Un poco más de disciplina: hay que recordar poblar `skip_reason` en cada transición terminal.
  La restricción `check` lo hace imposible de olvidar, que es exactamente por lo que se añade.
- **Añadir valores a un enum de Postgres no se puede revertir fácilmente** (no se puede eliminar
  un valor sin recrear el tipo). Se asume y se documenta; los cinco motivos son estables.
- La UI debe manejar más casos de mensaje y de color. Es trabajo de diseño, no de arquitectura.
- Un cambio de esquema respecto al `SPEC.md` que debe reflejarse en la documentación de producto
  para que no parezca una desviación.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Usar solo `skipped` (como en `SPEC.md`) | Cuatro causas distintas en un solo estado. El reporte de catálogo roto se vuelve inútil y el scoring castiga fallos técnicos |
| Un booleano `was_technical_failure` | `CLAUDE.md` §23 prohíbe booleanos ambiguos precisamente para este caso. Un booleano no escala cuando aparecen más motivos |
| Un campo de texto libre para el motivo | Sin validación, sin agrupación posible y con datos inconsistentes. El panel de admin no podría agregar nada |
| Guardar el motivo solo en `playback_events` y no en `queue_items` | Habría que hacer un `JOIN` con la tabla de mayor volumen para responder "¿por qué se saltó este turno?", la consulta más frecuente del operador |
| Reutilizar `cancelled` para fallos técnicos | `cancelled` implica una acción humana deliberada. Mezclarlos reproduce el problema original con otro nombre |
| Reintentar indefinidamente en lugar de marcar `failed` | Una fiesta no puede esperar. Se agota el fallback, se marca el turno y el show continúa; el diagnóstico se hace después, con datos |

## Verificación

| Control | Dónde |
|---|---|
| No se puede cerrar un turno sin motivo | Constraint `ck_queue__reason_required` + test |
| Un turno `failed` no genera score | Test de `complete_queue_item`: estado `failed` → no se inserta score |
| Un turno `failed` no aparece en el ranking | Test de la vista `session_leaderboard` |
| El reporte de admin agrupa correctamente | Test de la consulta de "fuentes que fallaron" |
| Los fallos incrementan `fail_count` | Test de integración del flujo de error del reproductor |
| El mensaje de UI varía por motivo | Test de componente |

**Señal de revisión:** si aparecen causas de fallo que no encajan en los cinco motivos, se añade
un valor al enum mediante migración (aditivo y seguro). Si en la práctica `timeout` nunca se usa,
se documenta como reservado en lugar de eliminarlo.
