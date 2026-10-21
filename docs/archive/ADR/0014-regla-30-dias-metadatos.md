# ADR-0014 — Regla de 30 días en tres capas: columna, job y RLS

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Cumplimiento
- **Relacionado:** ADR-0006, ADR-0013, `docs/YOUTUBE-INTEGRATION.md` §4.2, `docs/DATABASE.md` §12

## Contexto

Las [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) §III.E.4
establecen un límite temporal estricto para los datos obtenidos de la API:

> Los datos de API obtenidos sin autorización de usuario (*Non-Authorized Data* — el caso de una
> API key, que es el nuestro) pueden almacenarse **un máximo de 30 días calendario**, tras lo
> cual hay que eliminarlos o volver a obtenerlos. También hay que hacer un esfuerzo razonable por
> mantener los datos almacenados coherentes con los actuales.

Para nuestro sistema, los datos afectados son los metadatos del catálogo: `title`, `channel_title`,
`thumbnail_url`, `duration_seconds`, `embeddable_status`, `region_blocked`. Es decir, **la mayor
parte del catálogo**.

El problema de implementar esto con un único mecanismo es que el incumplimiento es silencioso:
un job que falla durante cinco semanas no produce ningún error visible, y el sistema sigue
sirviendo metadatos vencidos sin que nadie se entere. La consecuencia no es un bug: es una
violación de los TdU que puede costar la API key.

## Decisión

**El cumplimiento se implementa con tres capas independientes, de modo que el fallo de una no
produzca incumplimiento.**

| Capa | Mecanismo | Protege contra |
|---|---|---|
| **1. Dato obligatorio** | `song_sources.metadata_fetched_at timestamptz` + `check (provider <> 'youtube' or metadata_fetched_at is not null)` | Insertar una fuente sin fecha de control, que quedaría fuera de todo barrido |
| **2. Job de refresco** | `job_refresh_song_sources` diario a las 08:30 UTC: fuentes con más de **25 días**, en lotes de 50, a 1 unidad por llamada | Degradación normal por antigüedad |
| **3. Job de purga** | `job_purge_stale_metadata`: fuentes con más de **30 días** que no se pudieron refrescar → `active = false` | Fallo parcial del refresco |
| **4. RLS** | `song_sources_select_live`: `metadata_fetched_at > now() - interval '30 days'` para no-admin | **Fallo total y silencioso del job durante semanas** |

La capa 4 es la decisión clave y la que se aparta de lo obvio. La protección de cumplimiento
**no** puede depender de que un proceso funcione: debe ser una propiedad de la consulta. Con la
política RLS, si el job lleva cinco semanas caído, el sistema deja de servir metadatos vencidos
**automáticamente**, sin intervención humana y sin que nadie tenga que detectar el fallo.

Consulta obligatoria en CI:

```sql
-- Debe devolver 0 con un usuario autenticado no-admin.
select count(*) from public.song_sources
 where active
   and provider = 'youtube'
   and metadata_fetched_at < now() - interval '30 days';
```

Presupuesto de cuota del refresco (dato verificado, no estimado):

| Fuentes | Llamadas (`videos.list`, 50 por lote) | Unidades | % del cupo de 10,000/día |
|---|---|---|---|
| 500 | 10 | 10 | 0,1 % |
| 2,000 | 40 | 40 | 0,4 % |
| 20,000 | 400 | 400 | 4 % |
| 100,000 | 2,000 | 2,000 | 20 % |

El refresco completo de un catálogo grande es perfectamente asumible. **La cuota no es la
restricción para cumplir esta regla; la restricción es la disciplina de implementación.**

Decisión complementaria: el refresco corre a las **08:30 UTC**, justo después del reinicio del
cupo (medianoche hora del Pacífico). Un job que corre antes del reinicio compite por el cupo del
día anterior.

## Consecuencias

### Positivas

- **Cumplimiento robusto a fallos.** Tres capas independientes: si falla el job, la RLS contiene
  el daño. Es defensa en profundidad aplicada a un requisito legal, no a una amenaza de seguridad.
- **Auditable.** Una sola consulta SQL responde "¿estamos cumpliendo?".
- **Autolimpiante.** El job de refresco también detecta videos eliminados o que dejaron de ser
  embebibles: cumple dos funciones con un solo mecanismo.
- El costo en cuota es despreciable (< 1 % para un catálogo de 2,000 canciones).
- La misma columna sirve para el panel de administración: el admin ve qué fuentes están por
  vencer y cuáles se perdieron.

### Negativas / costos asumidos

- **Complejidad adicional:** una columna de control, dos jobs y una condición en una política RLS.
  Es más código que "refrescar cada noche y confiar".
- **Un fallo silencioso se convierte en una degradación visible:** si el job falla 30 días, las
  canciones desaparecen del catálogo. Es el comportamiento correcto (mejor un catálogo reducido
  que un incumplimiento), pero hay que monitorearlo o el síntoma será "faltan canciones" sin
  causa aparente. Por eso hay alerta de "fuentes con metadatos > 29 días" con objetivo 0.
- La condición en RLS se evalúa en cada consulta del catálogo. Es una comparación de fechas sobre
  una columna indexada; el impacto es despreciable.
- **El borrado real no se ejecuta a los 30 días**, solo la desactivación. Debe confirmarse
  jurídicamente si "dejar de servir y desactivar" satisface el requisito de *"delete or refresh"*
  o si exige el borrado físico de los campos. **Punto a validar con asesoría legal.**
- Los jobs deben ser idempotentes y estar monitorizados (`job_runs`).

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Refresco nocturno único, sin columna de control ni RLS | Un fallo de tres semanas produce incumplimiento silencioso. Es exactamente el escenario que hay que evitar |
| Borrado físico de los metadatos a los 30 días | Destruiría el catálogo cada vez que un job falla, y la eliminación de un video de `song_sources` rompería el historial y los favoritos que lo referencian. La desactivación es reversible; el borrado no |
| Actualizar metadatos en el momento de cada reproducción | Consumiría cuota por reproducción y añadiría latencia al inicio de cada turno. Además, 100 búsquedas/día hacen inviable cualquier enfoque "en vivo" |
| No guardar metadatos y consultar siempre la API | Imposible: el catálogo necesita título, artista, duración y género para buscarse sin tocar la API (ADR-0005) |
| Guardar solo el `videoId` y resolver el resto al mostrar | Cada listado del catálogo haría llamadas a la API. Se agotaría el cupo con el primer usuario explorando |
| Confiar en que el job nunca fallará | Es la opción que se elige por omisión y la que produce el incidente |

## Verificación

| Control | Dónde |
|---|---|
| Ninguna fuente vencida visible para no-admin | `supabase/tests/09_compliance_30_days.sql` |
| No se puede insertar una fuente de YouTube sin `metadata_fetched_at` | Constraint `check` + test |
| El refresco respeta el presupuesto | Test de integración de `app.consume_youtube_quota` |
| Idempotencia de los jobs | Ejecutar dos veces → mismo resultado |
| Alerta de fuentes > 29 días | Monitor con objetivo 0, integrado en `/admin` |
| El refresco detecta videos eliminados | Test con fixture de un `videoId` ausente en la respuesta |

**Punto abierto para asesoría legal:** confirmar si el requisito *"delete or refresh"* se satisface
con la desactivación lógica y la no exposición al usuario, o si exige el borrado físico de los
campos almacenados. Si exige borrado físico, se implementará un `job` que anula los campos
(`title_snapshot`, `channel_title`, `thumbnail_url`) conservando la fila y la relación con el
historial. **Debe resolverse antes de la Fase 2.**
