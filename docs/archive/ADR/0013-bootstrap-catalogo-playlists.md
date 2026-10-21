# ADR-0013 — Bootstrap del catálogo con `playlistItems.list`, no `search.list`

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto, Operaciones
- **Relacionado:** ADR-0005, ADR-0006, `docs/YOUTUBE-INTEGRATION.md` §4.3

## Contexto

`SPEC.md` §12 exige un catálogo propio y §31 lo incluye en el MVP. No dice de dónde salen las
canciones. Las opciones que el propio `SPEC.md` menciona son: alta manual, panel administrativo,
API de YouTube para metadatos e importación CSV futura.

El problema es de magnitud, no de mecanismo. Un catálogo de karaoke útil para una fiesta real
necesita al menos 300–500 canciones; para ser competitivo, varios miles. Con la búsqueda de
YouTube limitada a **100 llamadas diarias en total** (ADR-0005), la curación manual uno a uno
es inviable: implicaría cientos de días de trabajo administrativo, o un catálogo tan reducido
que la primera fiesta terminaría en "no está esa canción" repetidamente.

Al revisar la [calculadora de cuota](https://developers.google.com/youtube/v3/determine_quota_cost)
aparece la salida: `playlistItems.list` cuesta **1 unidad** (bucket compartido de 10,000/día) y
devuelve hasta 50 elementos por llamada. Eso significa **10,000 videos por 200 unidades**: el 2 %
del cupo diario, sin tocar el bucket de 100 búsquedas.

## Decisión

**El catálogo se puebla cosechando listas de reproducción públicas de canales de karaoke mediante
la API oficial, con aprobación humana obligatoria antes de publicar.**

```text
Admin registra un canal de karaoke (channels.list → uploadsPlaylistId)   1 unidad
        │
        ├─ playlistItems.list (50 por página)                            1 unidad/página
        │
        ├─ Filtro por heurística de título:
        │    incluir: "karaoke", "instrumental", "playback", "pista", "versión karaoke"
        │    excluir: "tutorial", "reacción", "cover", "official video", "letra"
        │
        ├─ Deduplicación por (provider, external_id)
        │
        ├─ Agrupación en canciones canónicas (título + artista normalizados)
        │    → COLA DE REVISIÓN. Nada entra al catálogo público sin aprobación
        │
        ├─ videos.list en lotes de 50: verifica embeddable_status y duración
        │
        └─ El admin aprueba en lote, con vista previa incrustada del reproductor
```

Reglas obligatorias:

| # | Regla |
|---|---|
| 1 | Nada se publica automáticamente. La cosecha **propone**, el admin **dispone** |
| 2 | Solo API oficial. Prohibido scraping, parseo de HTML o uso de APIs privadas |
| 3 | Atribución por ítem: `channel_title` + enlace de vuelta a la fuente |
| 4 | Refresco de metadatos a 25 días, purga a 30 (ADR-0014) |
| 5 | Proceso de retiro documentado: si un titular lo solicita, la fuente se desactiva |
| 6 | Solo listas públicas, sobre canales que monetizan su propio contenido |
| 7 | El filtro heurístico es una ayuda, no un criterio de calidad: la revisión humana decide |

## Consecuencias

### Positivas

- **El catálogo es viable.** Miles de canciones en días, no en meses, dentro de la cuota gratuita.
- **La calidad se mantiene** porque hay una cola de revisión humana: se evita importar covers,
  tutoriales, videos con letra (no karaoke) y contenido sin relación.
- **El cupo de 100 búsquedas/día queda intacto** para la curación puntual cuando un usuario pide
  una canción que no está (o para el admin que busca una versión específica).
- **La agrupación en canciones canónicas** genera directamente el modelo `songs` + `song_sources`
  del ADR-0006: varias versiones del mismo tema entran como fuentes, no como canciones repetidas.
- Aprovecha `pg_trgm` y la normalización: la deduplicación funciona con "Maná" y "Mana".

### Negativas / costos asumidos

- **Riesgo legal pendiente (R6 de `ARCHITECTURE.md` §19.1).** Importar metadatos de un catálogo
  ajeno y publicarlos en una aplicación propia requiere revisión legal, aunque se use la API
  oficial. Mitigación: atribución, enlace de vuelta, refresco a 30 días, proceso de retiro y
  uso exclusivo de la API oficial.
- **Trabajo de curación real:** la cola de revisión hay que atenderla. Es trabajo recurrente que
  hay que asignar a alguien, no un proceso que funcione solo.
- La calidad depende de la calidad de las listas de origen. Un canal con audio malo produce un
  catálogo con audio malo, y el filtro por título no lo detecta. Mitigación: la vista previa
  incrustada en el panel de revisión.
- La agrupación automática de títulos comete errores ("Héroes" de X vs. "Héroes" de Y). El admin
  corrige en la revisión; hay que diseñar la interfaz de revisión para que corregir sea rápido.
- Dependencia de que existan listas públicas y bien mantenidas.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Curación 100 % manual (una canción a la vez) | Inviable en tiempo: 500 canciones a 5 minutos cada una son 40 horas de trabajo, y ese catálogo aún es pequeño |
| Cosecha + publicación automática sin revisión | Un catálogo con covers, tutoriales y videos sin relación arruina la primera impresión. La revisión es lo que convierte volumen en calidad |
| `search.list` masivo para descubrir catálogo | **Cupo de 100 llamadas/día en total.** No es una opción, es un límite duro |
| Scraping de directorios de karaoke o de sitios de terceros | Viola `CLAUDE.md` §5 (scraping existiendo API) y añade un problema de derechos de base de datos |
| Importación CSV manual de un catálogo existente | Complementaria y prevista (Fase 4), no sustituta: exige que alguien construya primero el CSV |
| Catálogo licenciado desde el inicio | Es la estrategia correcta a largo plazo (ADR-0018) pero requiere capital y negociación, no está disponible en el MVP |
| Permitir a los usuarios agregar cualquier video de YouTube | El catálogo se llena de contenido no verificable, se dispara el consumo de cuota y se pierde la curación, que es el activo del producto |

## Verificación

| Control | Dónde |
|---|---|
| El importador respeta el presupuesto de cuota | `app.consume_youtube_quota` + test |
| Nada se publica sin aprobación | Test: una fuente cosechada nace con `active = false` hasta la aprobación |
| Sin llamadas a `search.list` en el importador | Revisión de código + test del adaptador |
| Filtro heurístico con casos conocidos | Test unitario con 30 títulos etiquetados |
| Atribución presente en cada ítem publicado | Test de UI |
| Deduplicación efectiva | Test: importar la misma lista dos veces → 0 filas nuevas |

**Señal de revisión:** si la revisión legal concluye que la cosecha de listas ajenas no es
admisible, la alternativa es la importación CSV de un catálogo propio o licenciado, lo que
convierte la Fase 2 en un bloqueo de negocio, no técnico. **Por eso este ADR debe resolverse
antes de la Fase 2**, no durante ella.
