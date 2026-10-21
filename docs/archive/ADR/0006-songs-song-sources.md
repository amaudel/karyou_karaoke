# ADR-0006 — `songs` → `song_sources`: N fuentes reproducibles por canción

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura
- **Relacionado:** ADR-0001, ADR-0013, ADR-0018, `docs/DATABASE.md` §5.3

## Contexto

`SPEC.md` §12 define la tabla `songs` con los campos `youtube_video_id`, `youtube_url`,
`thumbnail_url`, `duration_seconds` y `embeddable_status` **en la propia tabla de canciones**.

Ese diseño entra en conflicto con tres requisitos del mismo `SPEC.md`:

- §16: *"Esta pista no está disponible. **Selecciona otra versión.**"*
- §35: mitigación de videos eliminados mediante *"alternativas por canción"*.
- §36: abstracción de proveedor para *"sustituir o agregar proveedores sin reescribir el
  producto"*.

Con un solo `youtube_video_id` por canción, las tres cosas son imposibles: no hay otra versión
que seleccionar, no hay alternativa a la que caer y cambiar de proveedor exige migrar la tabla
central del catálogo.

La realidad operativa además lo confirma: la misma canción existe en múltiples videos
(karaoke oficial del canal, versión instrumental, versión en vivo, distintas tonalidades), y
unos dejan de ser embebibles mientras otros siguen funcionando.

## Decisión

**Separar la canción canónica de sus fuentes reproducibles.**

```text
songs                          song_sources
├── id                         ├── id
├── title                      ├── song_id           → songs
├── normalized_title           ├── provider          → 'youtube' | 'licensed' | 'local_upload'
├── artist_id                  ├── external_id
├── genre_id                   ├── canonical_url
├── language                   ├── channel_title
├── difficulty  (1..5)         ├── thumbnail_url
├── active                     ├── duration_seconds
└── times_played               ├── embeddable_status
                               ├── region_blocked
                               ├── is_primary       (único por canción)
                               ├── priority         (orden de fallback)
                               ├── active
                               ├── fail_count
                               └── metadata_fetched_at  ← regla de 30 días
```

Reglas derivadas:

| # | Regla |
|---|---|
| 1 | `uq_song_sources__one_primary`: exactamente una fuente primaria por canción |
| 2 | `uq_song_sources__provider_external`: la misma referencia no se registra dos veces |
| 3 | `uq_songs__title_artist`: la canción canónica no se duplica (normalizada) |
| 4 | Al iniciar un turno se resuelve la fuente viva de mayor prioridad; si falla, se prueba la siguiente **sin intervención del operador** |
| 5 | `provider` es un enum: añadir un proveedor es un `INSERT`, no una migración de datos |

## Consecuencias

### Positivas

- **Fallback automático real.** Un video que deja de ser embebible no interrumpe el show: la TV
  prueba la siguiente fuente de la misma canción. Es la mitigación que `SPEC.md` §35 pide.
- **El cambio de proveedor es una fila, no una migración.** Cuando entre contenido licenciado
  (ADR-0018), no se toca `songs`, la cola, el ranking, el historial ni la UI: se insertan
  `song_sources` con otro `provider` y el adaptador entrega otro `PlaybackDescriptor`.
- **La dificultad vive en la canción**, no en el video: tiene sentido de producto ("esta canción
  es difícil de cantar") y no se duplica por cada versión.
- **La regla de 30 días tiene un lugar natural donde vivir** (`metadata_fetched_at` por fuente),
  en lugar de una columna en la entidad canónica que es de naturaleza permanente.
- **El historial y los favoritos apuntan a la canción**, no al video. Si el video muere, el
  favorito sigue teniendo sentido y el historial no queda huérfano. Esto es un beneficio
  considerable que el diseño del `SPEC.md` no permitía.

### Negativas / costos asumidos

- Una tabla más y un `JOIN` lateral en la búsqueda. Mitigado con el índice parcial
  `ix_song_sources__song_live` y con la vista `song_catalog`.
- Hay que decidir la fuente al pedir una canción y persistirla en `queue_items.song_source_id`,
  lo que añade un campo a la cola.
- Mayor complejidad en el panel de administración: el admin gestiona canciones *y* versiones.
  Se compensa con la vista previa incrustada, que permite validar una versión sin salir del panel.
- Riesgo de catálogo descuidado si el admin registra varias fuentes de baja calidad. Mitigación:
  `priority`, `is_primary` y `embeddable_status` verificados, más el reporte de pistas rotas.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Mantener `youtube_video_id` en `songs` (como en `SPEC.md`) | Imposibilita fallback, alternativas y cambio de proveedor. Es la decisión que habría que revertir justo cuando el producto empieza a funcionar |
| Añadir `youtube_video_id_2`, `_3` a `songs` | Solución de urgencia que no escala, no modela el orden de preferencia y multiplica los campos nulos |
| Tabla `song_variants` con nombre específico de YouTube | Acopla el nombre del modelo al proveedor. `song_sources` es correcto precisamente porque `provider` es un enum |
| Guardar solo la canción y resolver el video en el momento de reproducir contra la API | Consumiría cuota en cada reproducción (100/día) y no permitiría curar ni verificar de antemano |

## Verificación

| Control | Dónde |
|---|---|
| Existe exactamente una fuente primaria por canción | `uq_song_sources__one_primary` |
| El fallback funciona end-to-end | Test E2E: fuente primaria bloqueada → se reproduce la secundaria → el show no se detiene |
| La búsqueda no devuelve canciones sin fuente viva | Vista `song_catalog` + test de integración |
| El dominio no conoce `provider = 'youtube'` en lógica condicional | Revisión de código: las decisiones se toman sobre `embeddable_status`, no sobre el proveedor |
| Añadir un proveedor no requiere cambios en `songs` | Prueba de concepto documentada antes de la Fase 4 |

**Señal de revisión:** si en la práctica cada canción termina teniendo una sola fuente y el
fallback nunca se usa, el modelo sigue siendo correcto pero podría simplificarse la interfaz de
administración para reducir el trabajo de curación.
