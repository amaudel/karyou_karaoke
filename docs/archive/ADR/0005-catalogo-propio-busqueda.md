# ADR-0005 — Catálogo propio como única fuente de búsqueda de usuarios

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto
- **Relacionado:** ADR-0013, `docs/YOUTUBE-INTEGRATION.md` §3, `docs/DATABASE.md` §9

## Contexto

`CLAUDE.md` §21 ya establece: *"La búsqueda principal debe consultar nuestra base. YouTube API
se usa como apoyo para metadatos, administración, descubrimiento controlado. No convertir cada
búsqueda de usuario en llamada obligatoria a YouTube."*

Al verificar la [calculadora de cuota oficial](https://developers.google.com/youtube/v3/determine_quota_cost)
aparece un dato que convierte esa recomendación en una obligación técnica dura:

> *"Projects that enable the YouTube Data API have a default quota allocation of **100
> `search.list` calls**, 100 `videos.insert` calls, and 10,000 units per day combined for all
> other endpoints."*

`search.list` **no** cuesta 100 unidades dentro del bucket de 10,000: tiene su **propio bucket
de 100 llamadas al día**. Cien búsquedas diarias para todo el sistema. En una fiesta con 15
invitados, un solo usuario explorando el catálogo agota el cupo en minutos. Y el cupo es
compartido por todo el despliegue, no por sesión ni por usuario.

## Decisión

**La búsqueda de usuarios consulta exclusivamente la base de datos propia. La API de YouTube
nunca se invoca en el camino de un usuario.**

| Camino | Fuente | Endpoint de YouTube |
|---|---|---|
| Búsqueda de invitado o del dueño | PostgreSQL + `pg_trgm` | **Ninguno** |
| Explorar catálogo, filtros, favoritos | PostgreSQL | **Ninguno** |
| Curación administrativa manual | `search.list` con presupuesto (20/día) | Sí |
| Alta de canción por URL/ID | `videos.list` (1 unidad) | Sí |
| Bootstrap e importación de listas | `playlistItems.list` (1 unidad) | Sí |
| Refresco nocturno de metadatos | `videos.list` (1 unidad, lotes de 50) | Sí |

Medidas de control obligatorias:

| # | Medida |
|---|---|
| 1 | `youtube_quota_ledger (day, endpoint, calls, units)` con corte de circuito al 80 % del presupuesto |
| 2 | `app.consume_youtube_quota(...)` antes de cada llamada a la API; error de negocio `QUOTA_EXHAUSTED` si se excede |
| 3 | `external_search_cache` con TTL de 7 días para consultas administrativas repetidas |
| 4 | Panel `/admin/cuota` con consumo diario, histórico y proyección; alerta al 60 % |
| 5 | `search.list` limitado por rol: solo `admin` |
| 6 | Los jobs corren a las **08:30 UTC**, justo después del reinicio del cupo a medianoche del Pacífico |

## Consecuencias

### Positivas

- La búsqueda del usuario tiene latencia de base de datos (decenas de ms), no de red externa.
  Cumple el objetivo de `CLAUDE.md` §35 (< 500 ms) con amplio margen.
- El producto no se degrada si YouTube está lento, cambia la cuota o revoca la key.
- El catálogo se convierte en un **activo propio**: curado, normalizado, con dificultad,
  género, idioma y orden por popularidad. Es el diferenciador del producto frente a "buscar en
  YouTube", no un detalle de implementación.
- Los costos son predecibles: la API es gratuita dentro del cupo; el consumo real es < 1,000
  unidades/día.

### Negativas / costos asumidos

- **Alguien tiene que curar el catálogo.** Es trabajo real y recurrente. Mitigado por el
  bootstrap con playlists (ADR-0013) y por el reporte de "búsquedas sin resultado", que dirige
  la curación hacia la demanda real en lugar de hacia intuiciones.
- Un usuario no puede encontrar "cualquier canción que exista en YouTube". Es una limitación de
  producto que debe comunicarse con honestidad, no esconderse con un buscador que falla.
- El catálogo puede quedar desactualizado respecto a novedades musicales. Mitigación: importación
  periódica + `search_logs` como señal de demanda.
- Dependencia de `pg_trgm` y de la calidad de la normalización: una normalización mala produce
  búsquedas malas. Por eso `app.norm_text` tiene casos de prueba obligatorios.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Buscar en YouTube en vivo para cada consulta del usuario | **100 llamadas/día en total.** Se agota en una fiesta. Inviable, no solo inconveniente |
| Búsqueda híbrida (local primero, YouTube si hay 0 resultados) | Tentadora, pero cada búsqueda fallida de un invitado consume cupo global. Con 100/día, un catálogo incompleto agota el cupo en una noche. Se descarta para usuarios; se permite **solo para admin** |
| Motor de búsqueda externo (Algolia, Meilisearch, Typesense) | Añade un servicio, un costo, una sincronización y un punto de fallo. Con < 50,000 canciones, `pg_trgm` + GIN es más que suficiente y ya está donde viven los datos |
| Búsqueda con `tsvector` y diccionario español | Buena para texto largo, mala para nombres propios y títulos cortos ("Maná", "AC/DC"). Trigram tolera errores de tipeo, que es el caso real en un móvil en una fiesta ruidosa |
| Catálogo servido desde un archivo estático | Sin filtros por género/idioma, sin conteo de popularidad, sin el reporte de búsquedas sin resultado y sin poder desactivar una fuente rota en caliente |

## Verificación

| Control | Dónde |
|---|---|
| Ninguna llamada a `search.list` desde una ruta de usuario | Test que verifica que el adaptador de búsqueda no importa `YouTubeProvider.search` |
| Corte de circuito al 80 % | Test de integración de `app.consume_youtube_quota` |
| Latencia de búsqueda | `explain analyze` con 10,000 canciones: objetivo < 50 ms |
| Consumo diario visible | Panel `/admin/cuota` |
| Reporte de búsquedas sin resultado | Vista en `/admin/catalogo/busquedas-sin-resultado` |

**Señal de revisión:** si el catálogo supera ~100,000 canciones y `pg_trgm` deja de cumplir el
objetivo de latencia, se evalúa `tsvector` híbrido o un motor externo. Si el volumen de curación
administrativa supera las 100 búsquedas/día, la salida es clave de API por inquilino o un
proveedor licenciado (ADR-0018), no "comprar más cuota" (no existe autoservicio de cuota).
