# Karaoke

Aplicación web de karaoke para casa. YouTube reproduce el video; la aplicación aporta la
búsqueda, la cola de turnos, la pantalla de TV, la puntuación y el ranking.

El plan completo está en **[docs/PLAN.md](docs/PLAN.md)**. Los documentos de
`docs/archive/` describen un producto comercial anterior y ya no aplican.

---

## Requisitos

**Node 24 o superior.** No hace falta nada más: la base de datos usa `node:sqlite`, que viene
integrado en Node. Sin Postgres, sin Docker, sin compilación nativa, sin cuenta en la nube.

## Puesta en marcha

```bash
pnpm install
pnpm db:setup      # crea data/karaoke.db con las 30 pistas verificadas
pnpm dev           # http://localhost:3000
```

Para entrar desde los móviles, en la misma red wifi:

```
http://TU-IP-LAN:3000
```

El servidor escucha en `0.0.0.0` justo para eso. La primera vez Windows pedirá permiso de
firewall: hay que permitirlo, o los móviles no podrán conectarse.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo en `0.0.0.0:3000` |
| `pnpm build` | Compila para producción |
| `pnpm start` | Sirve la versión compilada |
| `pnpm test` | Pruebas de normalización, búsqueda y catálogo |
| `pnpm typecheck` | Verifica los tipos |
| `pnpm db:setup` | Crea la base y aplica migraciones + semilla (idempotente) |
| `pnpm db:reset` | Borra la base y la reconstruye desde cero |
| `pnpm verificar-api` | Comprueba la clave de YouTube y resuelve los canales |
| `pnpm importar` | Importa canales al pool (ver opciones abajo) |
| `pnpm stats` | Composición del pool y tiempos de búsqueda |

### Importar canales

```bash
pnpm importar                                     # todos los canales activos
pnpm importar -- --canal '@partytymekaraokeenespanol7262'
pnpm importar -- --canal '@handle' --paginas 4    # limitado, para probar
pnpm importar -- --canal '@handle' --reiniciar    # ignora el progreso guardado
```

La importación es **reanudable**: guarda el cursor de página, así que si se corta no hay que
volver a gastar cuota desde el principio. Consume 2 unidades por cada 50 videos (1 de
`playlistItems` + 1 de `videos.list`) de las 10.000 diarias, y **cero** de las 100 búsquedas.

## Estructura

```
src/
  app/
    page.tsx              portada con contadores
    catalogo/page.tsx     buscar en el pool y agregar al catálogo
    actions.ts            server action: agregar al catálogo
  db/
    client.mjs            conexión a node:sqlite
    queries.mjs           TODO el SQL está aquí
    migrations/           esquema versionado
  lib/
    normalize.mjs         normalización de texto (también la usa el seed)
scripts/
  db-setup.mjs            migraciones + semilla
  seed-data.mjs           los 30 videos verificados
tests/
  search.test.mjs         17 pruebas
data/
  karaoke.db              tu base de datos (no se versiona)
```

## El modelo: pool y catálogo

Son dos cosas distintas y conviene no confundirlas.

- **Pool** (`pool_items`): todo lo importado de YouTube. Es el **índice de búsqueda**. Puede
  tener veinte versiones de la misma canción. Buscar aquí es instantáneo y sin límite, porque
  no toca la API de YouTube.
- **Catálogo** (`songs` + `song_sources`): lo que elegiste cantar. Una canción puede tener
  varias versiones; si un video deja de funcionar, se cambia la principal sin perder nada.

## Estado

**Fases 1 a 6 completadas.** El pool tiene **10.679 pistas** con duración, de las cuales
~10.521 son reproducibles. La búsqueda responde en 20–40 ms e incluye clasificación por género.
El reproductor funciona y las noches de karaoke (en **Modo Casa** y **Modo Bar**) están completas:
código de sala, QR, invitados sin cuenta, cola de turnos, control de Play desde el móvil, aplausos,
puntuación recreativa con efectos de sonido (Web Audio API), ranking en vivo, historial de noches,
**favoritos (`⭐`)** para pedir en un toque y **alta de canciones sueltas por URL de YouTube (`oEmbed`)**.

### Cómo se monta una noche

1. `pnpm dev`
2. En `/`, escribe un nombre y pulsa **Crear y abrir la pantalla**
3. Se abre la pantalla de TV con el QR y el código de sala
4. Cada invitado escanea el QR con el móvil, escribe su apodo y busca su canción
5. Pulsa **Cantar** en la pantalla cuando le toque; los invitados pueden enviar **aplausos** desde su móvil
6. Al terminar la pista se revela la puntuación y se actualiza el ranking de la noche

Desde el móvil hay que entrar por la **IP de la red**, no por `localhost`: en el móvil,
`localhost` es el propio móvil. El QR ya lleva la dirección correcta.

Si el móvil no carga, ejecuta `pnpm dev` en tu propia terminal para que Windows pida permiso
de firewall y puedas aceptarlo.

Para ver las pantallas con datos sin montar nada: `pnpm demo:sesion`.

### Lo que aún no hay

- **Favoritos** (guardar pistas preferidas para pedirlas en un toque).
- **Micrófono** (descartado en el MVP tras medirlo con `pnpm calibrar`; el motor ya lo soporta si se activa en el futuro).

### Una cosa que conviene saber antes de una fiesta

**La API de YouTube dice `embeddable: true` en videos que luego no se pueden insertar.** El
titular de los derechos puede bloquearlos por Content ID, y no hay ningún campo que lo prediga.
Comprobado: «Shakira - Loba» es público, está marcado como embebible y sin restricción regional,
y YouTube responde «contenido de LatinAutor - UMPG, quien bloqueó su reproducción».

La aplicación **aprende de esos fallos**: cuando el reproductor recibe 101 o 150, la pista se
marca y deja de ofrecerse. Si ocurre en medio de un turno en la TV, el turno se puede descartar
sin penalizar al cantante con nota de abandono.

Por eso conviene **probar las canciones antes de la fiesta**: agrégalas con tiempo, dale a Cantar
a cada una unos segundos y las que fallen se retiran solas.

### Lo que descubrió la importación

La embebibilidad **no es constante en el tiempo**, y por eso hay que medirla en lugar de
suponerla:

| Videos de Party Tyme | Embebibles |
|---|---:|
| 2019–2024 | 95% |
| 2025–2026 | **26%** |
| Canal completo | **95%** |

El canal endureció su política en los envíos recientes — el mismo camino que tomó Sing King,
que quedó en 0% y está excluido. Pero el grueso del catálogo sigue siendo reproducible.

Los videos **no embebibles se guardan igual**, marcados con `embeddable = 0`. Si el canal
revierte su política, se vuelven a comprobar sin gastar cuota enumerando otra vez. La búsqueda
los filtra.

Verificado cruzando `status.embeddable` de la API de datos contra el código HTTP de `oEmbed`
(200 = embebible, 401 = no embebible): **coinciden en el 100% de los casos**.

## Reglas que no se rompen

1. **Nunca descargar ni extraer audio de YouTube.** El reproductor embebido es la única vía.
2. **Nunca superponer nada sobre el reproductor.** Tapa los controles y rompe la reproducción.
3. **Un solo reproductor con reproducción automática por pantalla.**
4. **La reproducción la inicia un gesto del usuario**, porque el navegador bloquea el audio.
5. **`Referrer-Policy: strict-origin-when-cross-origin`.** Está fijada en `next.config.ts`.
   Cambiarla a `no-referrer` rompe el embed con el error 153 y parece un fallo del catálogo.
6. **El reproductor permanece visible.** Nada de reproducir con el player oculto.

## Variables de entorno

Opcionales en desarrollo local (ver `.env.example`):

- `YOUTUBE_API_KEY`: solo para el script `pnpm importar`.
- `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`: para usar Turso en lugar de SQLite local (`data/karaoke.db`).
- `APP_URL`: URL pública para el QR cuando se despliega fuera de la red local.

## Notas de este entorno

Dos cosas que fallan solo dentro del sandbox del agente y no en tu máquina:

- `node --test tests/` lanza procesos hijos con stdio por tubería y da `EPERM`. Por eso
  `pnpm test` usa `tests/all.mjs`, que los importa en un solo proceso.
- `pnpm build` lanza workers y necesita permisos ampliados.

En tu terminal ambos comandos funcionan normalmente.
