# PLAN.md — Karaoke personal

| Campo | Valor |
|---|---|
| Alcance | Uso personal. Sin clientes, sin cobro, sin multiusuario de negocio. |
| Estado | Activo — es la **única** fuente de verdad del proyecto |
| Reemplaza a | `docs/archive/` (arquitectura comercial: licencias, pagos, admin). Se conserva solo como referencia. |

Todo lo que está en `docs/archive/` describe un producto comercial. Este documento describe lo que
se va a construir de verdad. Si hay contradicción, gana este archivo.

---

## 1. Qué es

Una app web para hacer karaoke en casa. YouTube reproduce; la app aporta la búsqueda, la cola de
turnos, la pantalla de TV, la puntuación y el ranking.

**Corrección de conteo:** de los 33 videos investigados, **30 son embebibles** (91%). Los 3 que
fallan son 2 de Sing King y 1 de Party Tyme.

## 2. Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Reproducción | IFrame Player de YouTube | Única vía permitida. Nunca descargar ni extraer audio. |
| Búsqueda | **Pool propio** en base de datos | 100 búsquedas de YouTube al día no alcanzan. El pool es ilimitado. |
| Base de datos | **SQLite local** (Drizzle ORM) | Ver §2.1 |
| Hosting | **La propia laptop** | Ver §2.1 |
| Sincronización | Polling cada 2 s | Con 5 móviles son 2,5 req/s. Realtime no aporta y añade complejidad. |
| Duración de las pistas | `videos.list` al importar | Es el único dato que obliga a usar la API de YouTube. |
| Agregar canción suelta | **oEmbed, sin API key** | Da título, canal y miniatura. Además valida que sea embebible. |

### 2.1 Por qué SQLite local y no Supabase

Supabase es correcto para un producto comercial y era la elección de `docs/archive/`. Para uso
personal es peor en cuatro cosas concretas:

| | Supabase + Vercel | SQLite + laptop |
|---|---|---|
| Puesta en marcha | Cuenta, proyecto, claves, RLS | `pnpm start` |
| Se duerme | **Sí, tras 7 días sin uso** — justo antes de una fiesta mensual | No |
| Costo | Gratis con límites | Gratis sin límites |
| Si falla internet | La app no funciona | La app funciona; solo YouTube necesita red |
| Búsqueda | Postgres + `pg_trgm` | `LIKE` sobre 1.500 filas: instantáneo |
| Verificable por mí | No (necesita tus claves) | Sí, entero |

El volumen es la clave: **1.500 filas no necesitan Postgres.** Trigram con GIN resuelve un
problema que no tenemos.

Si algún día se quiere acceder desde fuera de casa, migrar a Postgres es cambiar el driver y un
par de tipos de columna, no reescribir. Por eso las consultas viven en un solo módulo
(`src/db/queries/`).

**Consecuencia de diseño:** la app se sirve en la red local, así que la URL del QR debe
construirse con la **IP LAN**, no con `localhost`. Si no, los móviles no pueden entrar.

## 3. Lo que NO se construye

Licencias · planes · pagos · entitlements · panel de administración · roles · usuarios con
contraseña · límites de dispositivos · auditoría · multiusuario de negocio · scraping · descarga
de audio · separación de voz · modo sin conexión · app nativa.

## 4. Modelo de datos

Ocho tablas. Nombres en español para leerlo sin traducir mentalmente.

```text
channels        canal de YouTube + nivel de confianza
pool_items      TODO lo importado → es el índice de búsqueda
songs           canción canónica (título + artista), lo que el usuario eligió
song_sources    versiones de una canción; una es la principal
sessions        una noche de karaoke
participants    quién canta (sin cuenta, solo apodo)
queue_items     la cola de turnos
scores          resultado de cada turno
```

La separación `songs` / `song_sources` se mantiene aunque parezca redundante con `pool_items`:

- **`pool_items`** puede tener 20 versiones de "Como la Flor". Es el catálogo de búsqueda, no el
  catálogo usable.
- **`songs` + `song_sources`** es lo que el usuario aprobó. Cuando un video deje de ser
  embebible, se cambia la fuente principal sin perder el historial ni los favoritos.

Campos de pureza vocal en `pool_items`:

```text
pure        sin voz
backing     sin voz principal, con coros
guide       tiene voz guía
lead        tiene voz principal
unreviewed  sin revisar  ← valor por defecto
```

## 5. Canales a importar

Handles verificados con oEmbed el 2026-09-15. La columna «publicados» es el dato real de
`channels.list`; la de embeddabilidad, la medida al importar.

| Canal | Handle | Publicados | Embebibles | Prioridad |
|---|---|---:|---:|---|
| PARTY TYME KARAOKE EN ESPAÑOL | `@partytymekaraokeenespanol7262` | 10.486 | **10.521 (95%)** | **1 · importado** |
| Chanson Karaoke | `@ChansonKaraoke` | 158 | 158 (100%) | 3 · importado |
| Echoe Entertainment | `@EchoeEntertainment` | 7.690 | pendiente | 2 |
| KaraokeMedia | `@KaraokeMediaPlus` | 2.776 | pendiente | 2 |
| Muramatsu Karaoke | `@muramatsukaraoke` | 1.382 | pendiente | 3 |
| OficialMana | `@OficialMana` | 219 | pendiente | 2 |
| ~~Sing King~~ | — | — | **0%** | **excluido** |

Sing King protege su propia app con el embedding desactivado. No se importa.

### 5.1 La embebibilidad cambia con el tiempo, y hay que medirla

El hallazgo más importante de la Fase 2, y la razón de que valga la pena medir en lugar de
suponer:

- Los videos de Party Tyme de **2019–2024**: 95% embebibles.
- Sus videos de **2025–2026**: **26%** embebibles.
- Sobre el canal completo: **95%**.

El canal parece haber endurecido su política en los envíos recientes, probablemente para
empujar a la gente hacia su propia app — el mismo camino que tomó Sing King. Pero el grueso
del catálogo sigue siendo reproducible, así que la cosecha completa es viable.

Verificado cruzando dos fuentes independientes sobre los mismos videos: `status.embeddable`
de la API de datos y el código HTTP de `oEmbed` (200 = embebible, 401 = no embebible).
**Coinciden en el 100% de los casos.**

Consecuencia de diseño: los videos **no embebibles también se guardan**, marcados con
`embeddable = 0`. Si el canal revierte su política, se vuelven a comprobar sin gastar cuota
enumerando otra vez. La búsqueda los filtra.

## 6. Fases

### Fase 1 — La tubería (sin clave de API) — **COMPLETADA**
Proyecto, SQLite, esquema, seed con las 30 pistas verificadas, búsqueda funcionando.
**Salida:** buscas "shakira" y aparecen 4 pistas reales con miniatura. ✔ verificado

Lo que quedó construido:

- Next.js 15 + TypeScript + Tailwind 4, base SQLite con `node:sqlite` (sin dependencias nativas).
- `channels`, `pool_items`, `songs`, `song_sources` con migración versionada.
- 30 pistas verificadas con oEmbed, 8 canales activos y 1 excluido.
- Búsqueda tolerante: sin acentos, sin puntuación, con tokens en cualquier orden,
  ordenada por calidad de coincidencia y luego por confianza del canal.
- Alta en catálogo con múltiples versiones: dos videos de "Rayando El Sol" producen **una**
  canción con dos fuentes.
- 20 pruebas en verde.

### Fase 2 — El pool (con clave de API) — **COMPLETADA**
Importador de canales: enumerar, traer duración, filtrar embebibles, guardar.
**Salida:** miles de pistas buscables, con duración en la lista. ✔ verificado

Lo que quedó construido:

- `scripts/verificar-api.mjs`: comprueba la clave y resuelve canales por `@handle`
  con `channels.list?forHandle`. Sin eso, el importador no tendría por dónde empezar.
- `scripts/importar.mjs`: enumeración paginada, enriquecido con duración y estado de
  inserción, filtro por título, y **reanudable** — guarda el cursor de página, así que una
  interrupción no obliga a gastar cuota desde el principio.
- Clasificación por título en `strong` / `weak` / `none`, para poder ajustar el filtro
  después sin volver a cosechar.
- Pool real: **10.679 pistas** con duración, de las cuales ~10.521 son reproducibles.
- Búsqueda sobre 10.500 filas: **20–40 ms** por consulta.
- Coste de la importación completa de Party Tyme: **336 unidades** de 10.000 (3,4%), y
  **cero** de las 100 búsquedas diarias.

Comandos:

```bash
pnpm verificar-api                              # comprueba la clave
pnpm importar                                    # importa todos los canales activos
pnpm importar -- --canal '@handle'               # uno solo
pnpm importar -- --canal '@handle' --paginas 4   # limitado, para probar
pnpm importar -- --canal '@handle' --reiniciar   # ignora el progreso guardado
pnpm stats                                       # composición del pool y tiempos de búsqueda
```

### Fase 3 — Reproductor y TV — **COMPLETADA**
El reproductor embebido y el escenario donde se canta.
**Salida:** una canción del catálogo se reproduce en pantalla. ✔ verificado en todo lo
verificable sin navegador

Lo que quedó construido:

- `src/components/KaraokeStage.tsx`: el reproductor y su panel, en el cliente.
- Ruta `/cantar/[videoId]`: el escenario de una canción.
- `/catalogo` ahora distingue **buscar** (el pool) de **Mi catálogo** (lo guardado), con
  acceso directo a cantar.
- `getPoolItem` es la única puerta por la que el escenario obtiene una pista, y rechaza
  lo no embebible y lo que viene de un canal excluido.

Reglas del reproductor, y por qué cada una:

| Regla | Motivo |
|---|---|
| `controls: 1` siempre | Ocultarlos incumple las condiciones de uso |
| Nunca `autoplay: 1` | La reproducción la inicia un gesto; además el autoplay recopila datos al cargar |
| `origin` en los `playerVars` | Identifica al cliente ante YouTube, requisito de la API |
| Una sola instancia del reproductor | Recrearlo acumula listeners y pierde la activación de audio |
| Nada se dibuja sobre la caja del reproductor | Taparía los controles y rompería la reproducción |
| `Referrer-Policy: strict-origin-when-cross-origin` | Suprimirla produce el error 153 |

Estados cubiertos: cargando · listo · reproduciendo · pausado · cargando pista · terminado · error.
Los errores de YouTube se traducen a español; nunca se muestra un código crudo.

**Audio bloqueado:** si seis segundos después de pedir reproducción el reproductor no arranca,
se muestra «Toca la pantalla y vuelve a pulsar Cantar». Es frecuente en Smart TV y hay que
preverlo, no descubrirlo en la primera fiesta.

### 6.1 El hallazgo que obligó a cambiar el diseño: `embeddable` miente

Probando en el navegador apareció este mensaje, en una pista que la API daba por buena:

> «Este video tiene contenido de LatinAutor - UMPG, quien bloqueó su reproducción en este sitio
> web o en esta aplicación.»

Es un bloqueo por **Content ID**: la gestora de derechos impide insertar el video. Y ocurría con
`status.embeddable = true`, con el video público y sin restricción regional.

Ningún campo de la API lo predice. Se comprobó una hipótesis concreta y **resultó falsa**:
`contentDetails.licensedContent` valía `false` en el video bloqueado y `true` en varios de Party
Tyme que sí funcionan. No sirve como señal.

| Fuente consultada | Dice | ¿Fiable? |
|---|---|---|
| `status.embeddable` | `true` | **No**: el video puede estar bloqueado por derechos |
| `contentDetails.licensedContent` | `false` en el bloqueado | **No**: no correlaciona |
| `contentDetails.regionRestriction` | `RU` en otro caso | Sí, pero es otra cosa |
| **Reproducirlo de verdad** | falla | **Sí. Es la única señal fiable** |

**Consecuencia de diseño:** la aplicación aprende de los fallos. Cuando el reproductor recibe
101 o 150, registra el bloqueo (`playback_blocked`), la pista deja de ofrecerse y el contador
de la portada sube. Es la única forma de saber cuántas están bloqueadas: no se puede preguntar.

Estado guardado **aparte** de `embeddable` a propósito: `embeddable` es lo que dice la API y se
reescribe al reimportar; `playback_blocked` es lo que comprobamos nosotros y no se pierde.

Se descartó marcar `embeddable = 0`, que habría sido lo evidente: una reimportación del canal
lo revierte desde la API y la aplicación olvidaría lo aprendido.

Un error 5 (fallo del reproductor HTML5) **no** retira la pista: puede ser pasajero y retirarla
por eso sería perder una canción buena.

### 6.2 El respaldo entre versiones todavía no sirve

El diseño `songs` / `song_sources` existe para caer a otra versión cuando una falla. Los datos
dicen que hoy eso casi nunca es posible:

```
canciones distintas en el pool: 10.620
con más de una versión:             50  (0,5%)
```

Se importó un solo canal grande, y los catálogos de karaoke **apenas se solapan**: cada productor
tiene su propio repertorio. Importar los otros cuatro canales no sería «más canciones», sería lo
que hace que el respaldo exista.

### Lo que la Fase 3 NO incluye, y conviene no confundir

El escenario reproduce **una canción**. La pantalla de TV completa —con la cola, el QR, el
siguiente cantante y el ranking— necesita sesiones, que son la Fase 4. Lo construido es el
prerrequisito y la parte técnicamente arriesgada.

Tampoco está verificado por el agente en un navegador real: no dispone de uno. Lo que sí
comprobó es que la página responde 200, que el div del reproductor está presente, que los
parámetros correctos llegan al bundle y que `controls: 0` y `autoplay: 1` no aparecen en ninguna
parte.

**La reproducción real la probó el usuario y funciona.** «La Bikina» de Party Tyme se reproduce;
la duración que viene de la base de datos (3:12) coincide con la de YouTube (3:11); la barra de
progreso avanza fuera del reproductor; y los controles y la marca de YouTube quedan intactos.
Las pistas de Party Tyme —10.521 de las 10.678— son reproducibles.

La comprobación de superposición es un aviso por consola en desarrollo, no una prueba de CI:
hace falta un navegador con geometría real y no está instalado Playwright.

### Fase 4 — Cola y sesiones — **COMPLETADA**
Código de sala, invitados sin cuenta, QR y cola de turnos.
**Salida:** cada uno pide desde su móvil y la tele mantiene el show. ✔ verificado por HTTP

Lo que quedó construido:

- Tablas `sessions`, `participants` y `queue_items` (migración 004).
- `/` — crear una noche y ver las abiertas.
- `/sala/[code]` — el móvil del invitado: entra con un apodo, busca y pide.
- `/sala/[code]/tv` — la pantalla: reproductor, quién canta, la cola y el QR.
- `scripts/demo-sesion.mjs` — arma una sesión con datos para mirar las pantallas.

Reglas de la cola, y por qué:

| Regla | Motivo |
|---|---|
| La posición la calcula el servidor | El cliente nunca decide dónde entra su canción |
| Máximo 3 pendientes por persona | Evita que uno acapare la noche |
| Un invitado solo cancela lo suyo | Su token va en una cookie; sin él no puede tocar nada ajeno |
| No hay dos apodos iguales | Si no, no se sabe de quién es cada turno |
| Una sola canción sonando a la vez | Índice único parcial, no confianza en el código |
| Arrancar, saltar y reordenar: solo la pantalla | Es el ordenador del salón; el control es el acceso físico |

### 7.1 Tres decisiones que se apartan del diseño comercial archivado

**Sondeo en lugar de tiempo real.** La TV vuelve a pedir los datos cada 2,5 s
(`Refresco.tsx`). Para una fiesta con cinco móviles son unas pocas peticiones por segundo.
A cambio no hay canales, ni suscripciones, ni lógica de reconexión. Si algún día se nota
lento, se cambia solo ese componente: ni la base ni las consultas se tocan.

Cuidado con `router.refresh()`: vuelve a renderizar los componentes de servidor SIN
desmontar los de cliente, así que el reproductor de YouTube no se reinicia en cada vuelta.
Si eso cambiara, habría que mover el sondeo a un componente aparte.

**Posición entera, no clave fraccional.** El ADR-0007 archivado usaba una clave fraccional
para escribir una sola fila al reordenar, porque la cola se difundía por Realtime a todos
los móviles y cada escritura se amplificaba. Aquí no aplica: la cola es de una fiesta, tiene
decenas de filas, y renumerar es más simple y no puede agotar la precisión de un número. Se
intercambian dos posiciones pasando por un valor temporal, porque el índice único de
(sesión, posición) no admite que dos filas compartan posición ni un instante.

**El QR lleva la IP de la red, no `localhost`.** En el móvil, `localhost` es el propio móvil.
La IP se detecta al vuelo (`src/lib/red.mjs`) porque cambia según dónde esté el portátil.
`APP_URL` la sobrescribe cuando esto se despliegue con un dominio de verdad.

### Lo que la Fase 4 NO incluye

La puntuación. Un turno se cierra y pasa al siguiente, pero nadie recibe una nota todavía:
eso es la Fase 5. Y el ranking, el historial y los favoritos tampoco.

### Fase 5 — Scoring y ranking — **COMPLETADA**
Sin micrófono, por decisión del usuario: el calibrador demostró que el motor se sostiene
como juego de fiesta, y el micrófono queda pendiente de una prueba con hardware real.

#### Lo que quedó construido

| Pieza | Dónde |
|---|---|
| Motor determinista | `src/domain/scoring/motor.mjs` |
| Generador sembrado | `src/domain/scoring/azar.mjs` |
| Calibrador | `pnpm calibrar` |
| Persistencia, ranking, aplausos e historial | `src/db/puntuaciones.mjs` |
| Telemetría del reproductor | `KaraokeStage`, props `onCantar` y `onTerminar` |
| Panel de la pantalla con la animación | `src/components/PanelTV.tsx` |
| Historial de noches | `/historial` |

#### La secuencia del resultado

Seis segundos, como pide `SPEC.md` §17.6: análisis con frases que se turnan, revelado de
los subpuntajes, contador que sube, mensaje y puesto en el ranking. Después vuelve sola a
la cola.

Solo se anima un resultado **recién salido**. Sin esa comprobación, cada recarga de la
tele repetiría la animación de una nota de hace media hora.

#### Qué señales alimentan la nota

| Señal | De dónde sale |
|---|---|
| Cuánto se cantó | Reloj del servidor y posición del reproductor, y se toma **el menor** |
| Pausas y saltos | El reproductor los cuenta; las pausas publicitarias no cuentan |
| Aplausos | Botón en el móvil de cada invitado, uno por persona y canción |
| Canciones previas | Historial de la noche |
| Variación | Generador sembrado con sesión + participante + turno |

**El servidor no se cree al navegador.** Un cliente que asegure haber cantado toda la pista
cuando el turno lleva treinta segundos recibe la nota del avance real. Mentir solo sirve para
empeorar la propia nota.

#### Dos decisiones que conviene recordar

**El abandono depende de cuánto se cantó, no de cómo terminó.** El corte está en el 60 %.
Si el operador corta a alguien que ya llevaba el 90 %, no es un abandono y no se castiga como
tal. La versión anterior usaba «no llegó al final», que castigaba injustamente.

**Saltar también puntúa.** Si el operador salta a alguien, esa persona recibe la nota que
corresponde a lo que alcanzó a cantar. Si no, quien abandona desaparecería del ranking en vez
de sacar la nota baja que le toca, y la banda baja de la distribución quedaría vacía.

#### Un fallo que apareció al integrar

`node:sqlite` devuelve objetos con **prototipo nulo**, y React no puede serializarlos al
pasarlos de un componente de servidor a uno de cliente. El síntoma era un error 500 en la
pantalla de TV con un mensaje que no señalaba la causa. Se convierte en el origen
(`plano`/`planas` en `src/db/client.mjs`) y hay una prueba que lo fija.

#### El fallo que costó más encontrar

La animación **se congelaba a la mitad**: aparecían los subpuntajes y el total no llegaba
nunca. La causa era una interacción entre el sondeo y React que no se ve leyendo el código
por partes:

El efecto que arranca la secuencia dependía del objeto `resultado`. El sondeo trae un objeto
**nuevo con el mismo contenido** cada 2,5 segundos, así que React consideraba que la
dependencia había cambiado: ejecutaba la limpieza —que borra los temporizadores de los
tramos siguientes— y volvía a entrar, donde el guardián lo rechazaba por ser el mismo
resultado. Resultado: los temporizadores quedaban borrados y sin reponer.

Como el primer tramo dura 1,8 s y el sondeo llega a los 2,5 s, el corte ocurría justo entre
el primer y el segundo tramo. El síntoma parecía aleatorio.

La dependencia es ahora **el id, no el objeto**. Cualquier efecto que dependa de datos que
llegan por sondeo tiene que depender de un valor estable, nunca de la identidad del objeto.

#### El bug que encontró el registro de auditoría

El desglose guardado decía `previas=0` en la segunda canción de alguien que ya había cantado.
La consulta tenía dos marcadores y **solo se le pasaba uno**:

```js
.all(turno.participant_id)   // faltaba sesion.id
```

`session_id = NULL` nunca es verdadero, así que devolvía cero filas siempre. Consecuencia: el
componente de racha valía 0 para todo el mundo desde el primer día.

Lo que hace este fallo interesante es cómo apareció: no dio error, no rompió ninguna pantalla
y ningún usuario lo habría notado. Salió de **leer el desglose guardado de una partida real**
y ver que decía algo falso. Es exactamente para eso que se guarda el desglose.

Y `node:sqlite` **no avisa cuando faltan argumentos**: deja el marcador en nulo en silencio. Un
sitio más donde conviene desconfiar de la comodidad.

#### El sonido de la secuencia

Se genera con la **Web Audio API**, no con archivos: sin assets, sin licencias de música,
cero bytes de red, y se ajusta cambiando números.

- Un chasquido corto en cada frase del análisis.
- Dos notas al aparecer los subpuntajes.
- Un tono al llegar el contador, **más largo y más alto según la banda**: dos notas para un
  70, cinco para un 97. Es lo que hace que un resultado excepcional se sienta distinto antes
  de leer el número.

Los navegadores no dejan sonar nada antes de que el usuario interactúe, así que el contexto
de audio se despierta con el primer gesto —el botón Cantar—. Si nadie toca nada, la secuencia
se ve igual, solo que muda. Hay un botón para silenciarlo y la preferencia se recuerda.

#### Por qué el motor es así: lo que midió el calibrador

Antes de construir nada se midió si el motor puede sostenerse sin micrófono. El resultado
es incómodo y está medido, no opinado: **la decisión tomada fue dejarlo sin micrófono**, y
esto es lo que hay detrás de esa decisión.

```
pnpm calibrar            100.000 simulaciones, informe completo
pnpm calibrar -- --ajustar   busca los pesos que mejor encajan
```

**Hallazgo 1 — sin micrófono, el azar manda.**

```
señales reales:  9,6 %      azar: 90,4 %
  azar   azar sembrado          89,9 %
  señal  terminar la canción     5,2 %
  señal  aplausos de la sala     2,5 %
  señal  no interrumpir          0,9 %
  señal  haber cantado antes     0,9 %
```

**Hallazgo 2 — con señales planas, el resultado sigue variando.** Simulando
actuaciones idénticas (todas terminan, sin pausas, misma sala), el motor reparte
notas de 67 a 100 con un **98,7 % de azar**. Esa variación no mide nada.

**Hallazgo 3 — la tensión que lo explica.** La distribución que pide `SPEC.md` §17.3
es ancha (reparte casi uniformemente entre 70 y 96). Un motor con señales reales
produce una campana estrecha. Para ensanchar hay que subir el azar:

| variación | desviación | señales | ¿encaja con el objetivo? |
|---:|---:|---:|---|
| 2 | 4,5 | **61,4 %** | no (error 3396) |
| 3 | 5,0 | 42,4 % | no (2249) |
| 4 | 5,6 | 29,6 % | no (1242) |
| 6 | 7,1 | 15,9 % | regular (280) |
| **8** | **8,8** | **9,6 %** | **sí (133)** |
| 10 | 10,3 | 6,4 % | regular (302) |

**O los resultados se reparten, o significan algo. Con estas señales no se pueden
tener las dos cosas.** Y no es un problema de ajustar pesos: la búsqueda automática
recorrió 140 combinaciones y la mejor sigue dejando el 90 % en manos del azar.

**Hallazgo 4 — un fallo de diseño que encontró el calibrador.** La primera versión
del micrófono sumaba en crudo, y el efecto era que *todo el mundo* subía: con peso
24, la mitad de los resultados acababan en 97-100. Un diferenciador tiene que
**restar a quien canta poco**, no solo sumar. Ahora el aporte está centrado en un
valor neutro: el cantante promedio no gana ni pierde por el micrófono.

Con el aporte centrado, el micrófono sí diferencia:

| peso | variación | señales | distribución |
|---:|---:|---:|---|
| 0 | 8 | 9,6 % | 9 / 24 / 41 / 19 / 7 |
| 16 | 5 | 44,0 % | 7 / 18 / 47 / 22 / 6 |
| **20** | **4** | **62,5 %** | **6 / 18 / 46 / 23 / 6** |
| 24 | 3 | 79,4 % | 6 / 19 / 42 / 25 / 8 |

**Hallazgo 5 — una incoherencia del `SPEC.md`.** Pide menos del 3 % de resultados en
la banda baja (50-69) y a la vez pide que abandonar produzca notas bajas. Con un 7 %
de abandono, la banda baja se lleva el 9 %. O el objetivo del 3 % está mal, o el
abandono debería ser más raro. No se puede cumplir lo uno y lo otro.

#### Lo que el micrófono habría cambiado

Con micrófono centrado en peso 20 y variación 4, las señales pasan del 9,6 % al **62,5 %** y
la distribución sigue encajando. Es la configuración que se usaría si algún día se aprueba.
**Lo que el calibrador NO puede decir:** si el micrófono de una tele capta la pista de karaoke
en vez de la voz. Eso es una prueba con hardware, no una simulación.

#### Cómo se comporta la aplicación

El motor **no mide afinación, ni notas correctas, ni precisión melódica**, y no debe
afirmarlo nunca. Mide si se terminó la canción, si hubo interrupciones, cuántos
aplaudieron y cuántas canciones lleva esa persona. Con eso y una variación sembrada
produce un número que se comporta como un videojuego de karaoke.

Un 100 no significa «perfecto»: significa que le tocó la cola alta. Por eso es raro.

#### Pendiente

- **Micrófono**, si algún día se prueba con hardware y se decide añadirlo. El motor ya lo
  soporta: basta con subir `config.microfono` y bajar `variacionEscala`.
- **Favoritos**, que quedan para el final junto con la Fase 6.

El reproductor va tercero a propósito: si el pool sale mal, lo demás no importa.

## 7. Reglas que no se rompen

1. **Nunca descargar ni extraer audio de YouTube.** El reproductor embebido es la única vía.
2. **Nunca superponer nada sobre el reproductor.** Tapa los controles y rompe la reproducción.
3. **Un solo reproductor con reproducción automática por pantalla.**
4. **La reproducción la inicia un gesto del usuario** (los navegadores bloquean el audio).
5. **`Referrer-Policy: strict-origin-when-cross-origin`.** YouTube la usa en su propio embed.
6. **El reproductor permanece visible.** Nada de reproducir con el player oculto.

## 8. Problemas conocidos y sus arreglos

| Problema | Arreglo |
|---|---|
| Los anuncios interrumpen las canciones | No se puede evitar. No prometer "sin anuncios". |
| El firewall de Windows bloqueará el puerto en la red local | Permitir la regla la primera vez |
| La IP LAN cambia entre redes | La app la detecta y genera el QR con la IP actual |
| Un video deja de ser embebible | Fallback a otra fuente de la misma canción; si no hay, el turno se salta con motivo |
| La laptop debe estar encendida | Es el costo de no depender de la nube. Es una decisión, no un defecto. |
