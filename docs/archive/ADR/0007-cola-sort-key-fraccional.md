# ADR-0007 — Orden de cola por `sort_key` fraccional con advisory lock

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura
- **Relacionado:** `docs/DATABASE.md` §5.4 y §7.1, ADR-0020

## Contexto

`SPEC.md` §14 define `queue_items.position` y `CLAUDE.md` §24 exige: *"No confiar en posición
enviada por cliente. Para reordenar: validar owner; usar transacción o RPC; asegurar posiciones
únicas."*

Un `position integer` con `UNIQUE (session_id, position)` cumple la unicidad, pero reordenar se
convierte en un problema de reescritura masiva:

- Insertar en la posición 3 de 20 exige desplazar 18 filas.
- Cada fila desplazada es un `UPDATE`, que dispara un evento de Realtime hacia todos los móviles
  de la fiesta.
- Los `UNIQUE` intermedios chocan durante la renumeración: hay que diferir la constraint o usar
  un valor temporal negativo, con el riesgo de dejar la cola inconsistente si la transacción falla.
- Con dos invitados pidiendo canción simultáneamente, ambos calculan `max(position) + 1` y uno
  viola la unicidad.

## Decisión

**El orden se representa con una clave fraccional `numeric(20,10)`, no con un entero secuencial.**

```sql
queue_items.sort_key numeric(20,10) not null
unique (session_id, sort_key)
```

| Operación | Cálculo | Filas escritas |
|---|---|---|
| Al final | `coalesce(max(sort_key), 0) + 1` | 1 |
| Al frente | `coalesce(min(sort_key), 0) - 1` | 1 |
| Entre A y B | `(A.sort_key + B.sort_key) / 2` | 1 |
| Reordenar la cola entera | N escrituras (operación explícita del operador) | N |
| Renormalización | Job cuando `B - A < 1e-9` | N |

Además:

| # | Regla |
|---|---|
| 1 | Toda mutación de cola pasa por RPC, nunca por `UPDATE` directo |
| 2 | El RPC toma `pg_advisory_xact_lock(hashtextextended(session_id::text, 0))` al inicio |
| 3 | `position` (1..N) se deriva en lectura con una función de ventana; **no se almacena** |
| 4 | El cliente nunca envía una posición: envía `before_id`/`after_id` y el servidor calcula |

El advisory lock es por sesión: serializa las mutaciones de una fiesta sin bloquear a las demás.
Es el mecanismo correcto para "asegurar posiciones únicas" bajo concurrencia real, que es lo que
`CLAUDE.md` §24 pide y lo que un `UNIQUE` solo no garantiza.

## Consecuencias

### Positivas

- **Reordenar es una escritura, no N.** Un invitado que mueve su canción no provoca 18 eventos
  de Realtime ni un parpadeo en la TV.
- **Sin choques de unicidad intermedios.** No hacen falta constraints diferidas ni índices
  temporales.
- **Concurrencia resuelta de forma explícita.** Dos invitados pidiendo canción al mismo tiempo
  se serializan por sesión; el segundo ve el `max(sort_key)` ya actualizado.
- La cola admite inserción "entre" dos turnos sin tocar el resto, lo que habilita el modo
  round-robin de `fairness_mode` (Fase 7) sin cambiar el modelo.
- Eliminar un turno no deja huecos que haya que compactar.

### Negativas / costos asumidos

- **Agotamiento de precisión.** Tras ~50 inserciones consecutivas en el mismo hueco, la
  diferencia cae por debajo de `1e-9` y `numeric(20,10)` deja de tener resolución útil.
  Mitigación: detección por job y renormalización a enteros. Es un caso real que hay que probar,
  no una preocupación teórica.
- `numeric` ocupa más que `integer` y es algo más lento de comparar. Irrelevante a esta escala
  (decenas de filas por sesión).
- La renormalización es una operación que hay que implementar, probar y monitorear.
- Requiere que **todo** el equipo entienda el mecanismo. Es una pérdida de tiempo no trivial en
  la lectura inicial del código. Mitigación: este ADR y un comentario en la migración.
- La restricción `ck_queue__sort_key_finite` es necesaria: `numeric` admite `NaN` e `Infinity`,
  que romperían el orden silenciosamente.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| `position integer` con renumeración en cada reordenamiento | Escritura en cascada, amplificación de Realtime, riesgo de violar unicidad a mitad de transacción. El coste crece con el tamaño de la cola, justo cuando más importa |
| `position integer` con `UNIQUE DEFERRABLE INITIALLY DEFERRED` | Resuelve los choques intermedios, pero mantiene la reescritura de N filas y no reduce la amplificación de eventos |
| LexoRank (cadenas base-62 entre dos claves) | Funciona y no se agota, pero es más complejo de implementar y depurar que un punto medio numérico. El agotamiento se resuelve igualmente con renormalización, así que no aporta suficiente a cambio |
| Guardar el orden en un `jsonb` (array de IDs) en `karaoke_sessions` | Un solo `UPDATE`, pero: sin integridad referencial, sin `UNIQUE`, escritura conflictiva entre participantes, y el ranking/historial pierden la noción estable de turno. Sería el antipatrón más caro de revertir |
| Delegar el orden a `requested_at` y no permitir reordenar | Contradice `SPEC.md` §14 ("el operador puede reordenar") y quita el control que un animador necesita en una fiesta real |
| Cola gestionada en el cliente (array en memoria sincronizado) | Viola `CLAUDE.md` §8 y §24. Dos clientes con visiones distintas = cola corrupta sin forma de resolver el conflicto |

## Verificación

| Control | Dónde |
|---|---|
| Renumeración y unicidad bajo concurrencia | `supabase/tests/10_queue_concurrency.sql`: dos `request_song` simultáneos → 2 turnos con `sort_key` distinto |
| Inserción "entre" dos turnos | Test unitario del cálculo de punto medio |
| Detección de agotamiento de precisión | Test que inserta 60 veces entre las mismas dos claves y verifica que la renormalización se dispara |
| El cliente no puede enviar `sort_key` | Test de contrato de RPC: el parámetro no existe |
| Reordenar escribe 1 fila | Test de integración que cuenta las filas modificadas |

**Señal de revisión:** si la renormalización resulta dispararse con frecuencia inusual en
producción, se reconsidera un esquema de enteros con huecos grandes (p. ej. múltiplos de 1000)
que es más simple de explicar y suficiente en la práctica.
