# ADR-0008 — Estado de reproducción autoritativo en servidor con CAS por revisión

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura
- **Relacionado:** ADR-0007, ADR-0009, ADR-0012, `docs/ARCHITECTURE.md` §3.6, `docs/DATABASE.md` §5.4

## Contexto

El show tiene un estado que debe ser coherente para todos los que lo observan: la TV, los
móviles de los invitados, el panel del operador y el ranking. Ese estado incluye qué canción
suena, quién canta, si está pausada, en qué fase (reproduciendo, analizando, resultado) y
cuánto falta.

Cuatro hechos lo complican:

1. **El reproductor de YouTube vive en el navegador de la TV.** Solo el cliente conoce la
   posición exacta, el buffering y el estado real del player.
2. **El cliente es un actor no confiable.** Puede mentir, tener un bug, quedarse dormido con la
   pestaña en segundo plano o reconectarse con estado viejo.
3. **Hay más de un observador.** Si el estado solo viviera en la TV, los móviles no podrían
   mostrar "cantando ahora" ni el operador sabría qué está pasando.
4. **`ended` puede llegar duplicado** (reconexión, reintento, doble evento) y no puede generar
   dos scores (`CLAUDE.md` §18).

## Decisión

**El estado del show vive en la tabla `session_playback` (una fila por sesión) y el servidor es
la autoridad. El cliente TV es un sensor y un actuador, no la fuente de verdad.**

```sql
session_playback (
  session_id            uuid primary key,
  state                 playback_state,     -- idle|preparing|playing|paused|analyzing|result
  current_queue_item_id uuid,
  revision              integer not null default 0,   -- CAS optimista
  started_at            timestamptz,
  accumulated_pause_ms  integer,
  updated_by_client_id  uuid,
  updated_at            timestamptz not null default now()
)
```

Reglas:

| # | Regla |
|---|---|
| 1 | Toda transición pasa por RPC: `start_queue_item`, `set_playback_state`, `complete_queue_item` |
| 2 | Toda escritura usa **compare-and-swap**: `UPDATE ... WHERE revision = p_expected_revision`, e incrementa `revision` |
| 3 | Las transiciones válidas se validan en el RPC (`idle → prepared → playing → analyzing → result → idle`). No hay saltos |
| 4 | Solo un `session_client` con `kind='screen'`, emparejado y con latido reciente, puede escribir el estado de esa sesión |
| 5 | La telemetría se acota: `position ≤ duration × 1.05`, `duration` dentro de ±20 % de `song_sources.duration_seconds`, se descartan valores negativos o no finitos |
| 6 | La TV reconcilia con `get_session_snapshot()` al montar y al reconectar; los deltas de Realtime llevan `revision` y se descartan si `revision <= revision_aplicada` |

Las transiciones de `state` son **explícitas y validadas**: no se admite `idle → completed` ni
`result → playing` sin pasar por `preparing`. Una máquina de estados sin validación de
transiciones es solo un campo de texto.

## Consecuencias

### Positivas

- **Todos los observadores ven lo mismo** y pueden reconstruir el estado desde el servidor tras
  cualquier caída de red. Una TV que se reinicia vuelve al show en curso en lugar de quedar
  desincronizada.
- **Un cliente obsoleto no puede corromper el show.** Con dos pantallas abiertas, la que tiene
  estado viejo falla el CAS y se reconcilia, en lugar de retroceder la máquina de estados.
- **La idempotencia del cierre de turno es alcanzable**: el RPC puede comprobar de forma
  autoritativa si el turno ya se cerró (ADR-0012 y el `UNIQUE (queue_item_id)` de `scores`).
- El operador puede intervenir desde su móvil (saltar, pausar) y la TV reacciona: el estado no
  pertenece a la pantalla.
- El estado es auditable: `revision`, `updated_by_client_id` y `updated_at` permiten reconstruir
  qué pasó en un incidente.

### Negativas / costos asumidos

- **Latencia adicional** entre la acción en la TV y su reflejo en los móviles. Se acepta porque
  el camino crítico (reproducir) es local a la TV: `playVideo()` no espera al servidor.
- El diseño de escritura es más verboso: cada transición necesita su RPC con validación.
- **Requiere disciplina en el cliente**: hay que implementar la reconciliación por `revision` y
  el descarte de deltas obsoletos. Si se ignora, aparecen estados fantasma difíciles de depurar.
- La tabla es un punto caliente por sesión: se escribe en cada transición. A esta escala
  (unas decenas de escrituras por sesión y noche) es irrelevante, y el índice parcial
  `ix_playback__state_live` está pensado para la consulta del operador, no para escritura.
- Un cliente malicioso que consiga emparejarse como pantalla podría gobernar el show. Mitigado
  por el emparejamiento aprobado por el dueño (`pair_screen`) y por el `UNIQUE` de un solo
  cliente de pantalla activo por sesión.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Estado del show solo en el cliente TV | Los móviles y el operador no pueden mostrarlo; cualquier recarga de la TV pierde el show; imposible de auditar |
| Estado derivado de `queue_items` + `playback_events` sin tabla propia | Cada lectura exige agregar la telemetría completa. La TV tendría que calcular el estado, con lo que volvería a ser la autoridad de facto |
| Redis / almacén en memoria para el estado del show | Un servicio más, sin persistencia ante caída, y el estado del show es lo último que debería perderse. Además hay que sincronizarlo con la base de todos modos |
| Realtime Presence como fuente de verdad | Presence modela "quién está conectado", no "qué está pasando". Se pierde al reconectar y no es transaccional |
| "Última escritura gana" sin `revision` | Es el camino directo al show corrupto de forma no reproducible. Con dos pantallas o una reconexión, el estado retrocede sin que nadie lo note |
| Broadcast del estado desde la TV sin persistir | Nada sobrevive a una recarga; imposible reconstruir tras un incidente; los invitados que llegan tarde no ven nada |

## Verificación

| Control | Dónde |
|---|---|
| Transiciones inválidas rechazadas | `supabase/tests/11_playback_transitions.sql` |
| CAS: escritura con `revision` obsoleta falla | Test de integración con dos clientes simulados |
| Solo la pantalla emparejada escribe | Test pgTAP con un participante que no es cliente de pantalla |
| `ended` duplicado no genera dos scores | Test idempotente de `complete_queue_item` |
| La TV se recupera tras reconexión | Test E2E: recarga la página a mitad de canción → el estado se reconcilia |
| Telemetría fuera de rango se descarta | Test unitario de las validaciones |

**Señal de revisión:** si la latencia de Realtime resulta insuficiente para la sincronización de
la cola en redes de local, se evalúa un canal Broadcast dedicado solo para el estado del show,
manteniendo `session_playback` como fuente de verdad.
