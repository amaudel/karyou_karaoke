# ADR-0015 — Realtime por `postgres_changes` + snapshot RPC como base

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura
- **Relacionado:** ADR-0008, `docs/ARCHITECTURE.md` §2.3 y §14.2

## Contexto

El producto es inherentemente multiusuario en tiempo real: cuando un invitado pide una canción,
la TV debe mostrarlo; cuando termina una actuación, todos los móviles deben ver el resultado y
el ranking actualizado. El objetivo de latencia es < 1 s.

Las opciones:

1. **Supabase Realtime `postgres_changes`**: cambios de tabla difundidos a los suscriptores,
  con RLS aplicada.
2. **Supabase Realtime Broadcast (canales privados)**: mensajes enviados explícitamente desde
  el servidor o desde triggers, con autorización por `realtime.messages`.
3. **Polling**: el cliente consulta cada N segundos.
4. **WebSocket propio** con un servicio aparte.

Restricciones reales:

- **Realtime no es un bus de eventos de alto rendimiento.** Publicar una tabla caliente se
  amplifica a todos los suscriptores.
- **`playback_events` es de alta frecuencia** (posición, buffering, latidos). Publicarla sería
  un desperdicio de ancho de banda y de conexiones.
- Un cliente que se suscribe sin haber leído el estado actual **no puede reconstruir la cola**
  solo con deltas: si llega tarde, ve una cola incompleta.
- Hay un límite de conexiones concurrentes por plan, y cada TV y cada móvil consume una.

## Decisión

**Dos mecanismos complementarios, ninguno suficiente por sí solo:**

```text
ESTADO BASE  → get_session_snapshot(session_code)  [RPC, un solo viaje]
               devuelve jsonb con: sesión + session_playback + cola + participantes
               + top-5 del ranking + server_now()
                    │
                    ├── se ejecuta al montar la TV
                    ├── se ejecuta al reconectar
                    └── se ejecuta por polling cada 5 s si Realtime está caído

DELTAS       → Supabase Realtime postgres_changes, filtrado por session_id
               Solo 4 tablas:
                 public.queue_items
                 public.session_playback
                 public.scores
                 public.participants
                    │
                    └── el cliente aplica un reducer puro por `revision`
```

Reglas obligatorias:

| # | Regla |
|---|---|
| 1 | **Snapshot primero, deltas después.** Nunca construir estado solo con deltas |
| 2 | Solo 4 tablas publicadas. `playback_events` **no** se publica |
| 3 | Todas las suscripciones llevan `filter: session_id=eq.{id}` |
| 4 | Un canal por sesión, no un canal por usuario |
| 5 | El reducer del cliente es **puro y testeable sin navegador**: `(estado, evento) → estado` |
| 6 | Idempotencia client-side: se descarta todo delta con `revision <= revision_aplicada` |
| 7 | **Degradación obligatoria:** si el WebSocket cae, polling del snapshot cada 5 s y aviso visible al operador |
| 8 | El tiempo se calcula con `server_now()` del snapshot más estimación de RTT. Nunca `Date.now()` contra timestamps de servidor sin corregir el desfase |

## Consecuencias

### Positivas

- **Menos código y menos infraestructura.** No hay servicio de mensajería, no hay broker, no hay
  contratos de eventos que versionar.
- **La corrección no depende del orden de llegada de los eventos.** El snapshot es autoritativo y
  los deltas son una optimización; si se pierden, el polling los reemplaza.
- **RLS aplica a Realtime**: un invitado no puede suscribirse a los cambios de una sesión ajena.
  El control de acceso es el mismo que en el resto del sistema (ADR-0003).
- **El reducer puro es testeable**: los casos de reconexión, eventos duplicados y eventos fuera de
  orden se prueban en unit tests, no en una fiesta real.
- Publicar solo 4 tablas contiene la amplificación de escritura.

### Negativas / costos asumidos

- **`postgres_changes` requiere que la tabla esté en la publicación** `supabase_realtime`. Es una
  configuración que hay que recordar en cada migración de una tabla nueva publicada.
- **`postgres_changes` no distingue bien entre "no hay datos" y "no tienes permiso"** y su
  comportamiento con RLS tiene matices que hay que verificar en cada versión de Supabase.
- **Hay una ventana de inconsistencia** entre el snapshot y la llegada del primer delta: un cambio
  ocurrido en ese intervalo podría perderse si la reconexión del canal no se maneja bien. Se
  mitiga con el polling de respaldo y con `revision`.
- **Límite de conexiones concurrentes** del plan de Supabase. Un canal por sesión ayuda, pero
  cada móvil sigue siendo una conexión. Hay que monitorear y prever el crecimiento.
- La reconexión de Realtime en redes inestables (wifi de bar) exige implementar
  *backoff* y *resubscribe*. Es trabajo real que no se puede omitir.
- Si el volumen crece mucho, migrar a Broadcast privado con triggers dedicados es un cambio de
  mecanismo, no de arquitectura (el snapshot y el reducer se mantienen).

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Broadcast privado con canales y triggers desde el inicio | Más control sobre el payload y menos amplificación, pero requiere escribir triggers de difusión por tabla y gestionar autorización de canales. Complejidad innecesaria para el MVP; es la evolución prevista, no el punto de partida |
| `postgres_changes` sobre todas las tablas relevantes, incluida `playback_events` | Amplificación brutal: cada evento de posición se difundiría a todos los móviles de la fiesta, que no necesitan esa información |
| Solo polling cada 2 s, sin Realtime | Simple y robusto, pero la experiencia se siente lenta: entre 0 y 2 s de retraso aleatorio en la cola. Aceptable como **degradación**, no como diseño |
| WebSocket propio con un servidor dedicado | Un servicio más que operar, escalar y pagar. Resuelve un problema que Supabase Realtime ya resuelve |
| Server-Sent Events desde una ruta de Next.js | En serverless no hay una conexión persistente compartida; habría que construir el fan-out con un almacén externo. Se acaba reinventando Realtime |
| Estado del show en un `jsonb` único que se difunde completo en cada cambio | Un solo evento por cambio y muy simple de consumir, pero reescribe y difunde la cola entera en cada mutación. Costoso en serialización y en ancho de banda, y agrava los conflictos de escritura (ADR-0007 y ADR-0008) |

## Verificación

| Control | Dónde |
|---|---|
| El snapshot reconstruye el estado completo | Test de integración: se ejecuta sin conexión previa y devuelve cola + ranking + playback |
| Deltas duplicados no corrompen el estado | Unit test del reducer: aplicar el mismo evento dos veces → mismo estado |
| Deltas fuera de orden se descartan | Unit test del reducer con `revision` decreciente |
| Degradación a polling | Test E2E que corta la conexión de Realtime y verifica que la TV sigue actualizándose |
| Solo 4 tablas publicadas | Test que consulta `pg_publication_tables` |
| RLS en Realtime | Test pgTAP de suscripción a sesión ajena |
| Latencia mutación → TV | Métrica de producción, objetivo p95 < 800 ms |

**Señal de revisión:** si la amplificación de escritura o el número de conexiones concurrentes se
convierte en un problema medido (no supuesto), se migra a Broadcast privado con triggers dedicados
por tabla. El snapshot y el reducer del cliente se mantienen intactos, por lo que la migración
afecta solo a la capa de transporte.
