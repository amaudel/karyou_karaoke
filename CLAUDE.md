# CLAUDE.md — Instrucciones de desarrollo para Karaoke Web

## 1. Rol

Actúa como arquitecto y desarrollador senior full-stack.

Debes construir la aplicación descrita en `SPEC.md`.

Tu prioridad es:

1. seguridad;
2. simplicidad;
3. experiencia de usuario;
4. mantenibilidad;
5. cumplimiento de las restricciones del producto;
6. entregas incrementales funcionales.

No agregues funcionalidades que no estén justificadas en `SPEC.md`.

---

# 2. Antes de modificar código

Siempre:

1. inspecciona la estructura del proyecto;
2. identifica stack real;
3. revisa package.json;
4. revisa variables de entorno documentadas;
5. revisa migraciones;
6. revisa políticas RLS;
7. revisa rutas existentes;
8. evita duplicar componentes;
9. reutiliza patrones existentes.

No asumas que un archivo existe.

No inventes APIs.

---

# 3. Stack objetivo

Preferido:

- Next.js;
- TypeScript;
- Tailwind CSS;
- Supabase;
- PostgreSQL;
- Supabase Auth;
- YouTube IFrame Player API;
- Vercel.

Si el proyecto existente usa una alternativa equivalente, no migres sin necesidad.

---

# 4. Principio central

YouTube es un proveedor de reproducción.

Nuestra aplicación controla:

- catálogo;
- búsqueda;
- cola;
- participantes;
- sesiones;
- puntuación;
- ranking;
- favoritos;
- historial;
- licencias;
- UI.

No controlar ni manipular contenido audiovisual fuera de las capacidades oficiales del reproductor.

---

# 5. Prohibiciones

NO:

- descargar videos de YouTube;
- descargar audio;
- extraer audio;
- eliminar branding;
- ocultar controles para simular reproductor propio;
- bloquear publicidad;
- reproducir audio oculto;
- usar APIs privadas;
- hacer scraping si existe API oficial adecuada;
- almacenar copias de videos;
- almacenar audio derivado;
- afirmar técnicamente que el scoring mide notas o afinación si no existe análisis vocal real.

---

# 6. Arquitectura

Separar claramente:

```text
UI
↓
Application Services
↓
Domain
↓
Repositories
↓
Supabase / External Providers
```

Evitar lógica crítica dentro de componentes React.

---

# 7. Estructura sugerida

```text
src/
  app/
    (public)/
    (auth)/
    dashboard/
    karaoke/
    room/
    admin/
    api/

  components/
    ui/
    karaoke/
    songs/
    queue/
    ranking/

  features/
    auth/
    songs/
    sessions/
    participants/
    queue/
    scoring/
    licenses/

  lib/
    supabase/
    youtube/
    auth/
    security/

  services/
    video-provider/
    scoring/

  types/

supabase/
  migrations/
  seed.sql
```

Adaptar si el proyecto ya tiene estructura.

---

# 8. Base de datos

La base de datos es la fuente de verdad para:

- usuarios;
- licencias;
- canciones;
- artistas;
- géneros;
- sesiones;
- participantes;
- cola;
- scores;
- favoritos.

No mantener estado crítico solo en frontend.

---

# 9. Migraciones

Toda modificación de base de datos debe realizarse mediante migración.

NO editar manualmente producción sin migración.

Cada migración debe ser:

- pequeña;
- reversible cuando sea posible;
- documentada.

---

# 10. RLS

RLS es obligatorio.

Antes de crear una tabla:

1. define propietario;
2. define quién puede leer;
3. define quién puede insertar;
4. define quién puede actualizar;
5. define quién puede eliminar.

No dejar tablas sensibles con acceso público total.

---

# 11. Service Role

La `SUPABASE_SERVICE_ROLE_KEY`:

- solo server-side;
- nunca cliente;
- nunca bundle;
- nunca localStorage.

---

# 12. Autenticación

Usar Supabase Auth.

No implementar sistema propio de contraseñas.

Sesión de usuario debe validarse server-side para acciones sensibles.

---

# 13. Roles

Roles mínimos:

- user;
- commercial;
- admin.

La licencia NO debe depender únicamente del rol.

Ejemplo:

`role = user`

pero:

`license.type = home_lifetime`

---

# 14. Licencias

Crear servicio:

```text
LicenseService
```

Responsabilidades:

- obtener licencia;
- validar estado;
- validar fecha;
- validar dispositivos;
- comprobar feature entitlement.

No repetir lógica en UI.

---

# 15. Feature entitlements

Ejemplo conceptual:

```ts
canUseFeature(user, "custom_branding")
canUseFeature(user, "unlimited_sessions")
canUseFeature(user, "commercial_mode")
```

Evitar condicionales distribuidos:

```ts
if (license === "commercial_lifetime")
```

por toda la aplicación.

---

# 16. Proveedor de video

Crear abstracción:

```ts
interface VideoProvider {
  getMetadata(videoId: string): Promise<VideoMetadata>
  search(query: string): Promise<VideoResult[]>
}
```

Implementación:

```text
YouTubeProvider
```

El dominio no debe depender directamente de YouTube.

---

# 17. Reproductor

Crear componente:

```text
YouTubeKaraokePlayer
```

Debe exponer eventos internos:

- ready;
- play;
- pause;
- ended;
- error.

No permitir que otras partes accedan directamente a la instancia YT salvo adapter.

---

# 18. Flujo de fin de canción

Al recibir `ended`:

1. validar queue item activo;
2. registrar evento;
3. marcar completed;
4. generar score;
5. guardar score;
6. actualizar ranking;
7. cambiar pantalla a resultado;
8. preparar siguiente.

Debe ser idempotente.

Si `ended` llega dos veces no generar dos scores.

---

# 19. Scoring

Crear:

```text
ScoringService
```

El scoring del MVP es recreativo, pero **debe sentirse como una evaluación auténtica dentro de la experiencia de karaoke**.

Nunca implementar el score como un simple número aleatorio generado en la UI.

El motor debe combinar:

- progreso de reproducción;
- finalización;
- interrupciones;
- historial;
- racha;
- parámetros de canción;
- variación pseudoaleatoria controlada;
- seed estable cuando sea conveniente.

Entrada:

- session;
- participant;
- song;
- playback completion;
- history;
- playback telemetry disponible.

Salida:

```ts
{
  total: number,
  rhythm: number,
  energy: number,
  interpretation: number,
  message: string,
  tier: string
}
```

Los subpuntajes deben correlacionarse con el total.

La distribución debe evitar que todos los resultados sean altos.

Rango recomendado:

```text
50–69   bajo
70–79   normal
80–89   bueno
90–96   excelente
97–100  excepcional
```

Un 100 debe ser poco frecuente.

## Presentación del scoring

Después del evento `ended`:

1. mostrar estado `analyzing`;
2. reproducir animación breve de análisis;
3. revelar métricas de forma progresiva;
4. animar contador del score;
5. mostrar mensaje;
6. actualizar ranking.

La UI puede utilizar frases como:

```text
Analizando interpretación...
Evaluando ritmo...
Midiendo energía...
Calculando resultado...
```

No mostrar en la experiencia principal etiquetas como:

```text
simulado
aleatorio
fake score
```

porque rompen la experiencia de juego.

Sin embargo, tampoco mostrar afirmaciones técnicas falsas como:

```text
Afinación detectada: 96%
Notas correctas: 93%
```

hasta que esas métricas existan realmente.

La documentación pública/FAQ debe aclarar, cuando corresponda, que el scoring recreativo inicial no es una evaluación vocal profesional.


# 20. Aleatoriedad

No usar `Math.random()` directamente en componentes.

Toda variación debe pasar por `ScoringService`.

Preferir generador pseudoaleatorio con seed para:

- pruebas;
- repetibilidad;
- evitar cambios absurdos;
- mantener coherencia entre total y subpuntajes.

La aleatoriedad es un ingrediente del resultado, no el resultado completo.

---

# 21. Catálogo

La búsqueda principal debe consultar nuestra base.

YouTube API se usa como apoyo para:

- metadatos;
- administración;
- descubrimiento controlado.

No convertir cada búsqueda de usuario en llamada obligatoria a YouTube.

---

# 22. Normalización

Guardar campos normalizados.

Ejemplo:

```text
Maná → mana
José José → jose jose
```

Usar para búsqueda tolerante.

---

# 23. Estados

Evitar booleanos ambiguos.

Preferir enums.

Ejemplo:

```text
waiting
ready
playing
completed
skipped
cancelled
```

---

# 24. Cola

Toda mutación debe validarse en backend.

No confiar en posición enviada por cliente.

Para reordenar:

- validar owner;
- usar transacción o RPC;
- asegurar posiciones únicas.

---

# 25. Invitados

Invitados no requieren cuenta.

Identidad limitada a la sesión.

No almacenar información personal innecesaria.

---

# 26. QR

QR no debe contener:

- user_id;
- session_id interno;
- tokens sensibles.

Debe usar:

- room code;
- token público revocable.

---

# 27. Pantalla TV

Ruta sugerida:

`/karaoke/[sessionCode]/screen`

Características:

- fullscreen;
- contraste alto;
- texto grande;
- responsive 16:9;
- no scroll durante reproducción.

---

# 28. Móvil

Ruta:

`/room/[sessionCode]`

Optimizar para una mano.

Acciones principales:

- buscar;
- pedir canción;
- ver turno.

---

# 29. Admin

Toda ruta `/admin` debe protegerse server-side.

No basta ocultar botones.

---

# 30. Auditoría

Acciones administrativas críticas:

- activar licencia;
- suspender usuario;
- editar canción;
- eliminar canción;
- cambiar plan.

Registrar en:

`admin_audit_log`.

---

# 31. Manejo de errores

Nunca mostrar errores técnicos crudos al usuario.

Ejemplo:

Incorrecto:

```text
YT.Player Error 101
```

Correcto:

```text
Esta pista no permite reproducción aquí.
Prueba otra versión.
```

Log técnico separado.

---

# 32. UX

Priorizar:

- acciones obvias;
- mínimo número de pasos;
- feedback inmediato;
- estados de carga;
- estados vacíos;
- recuperación ante errores.

---

# 33. Diseño

Estética:

- dark;
- energética;
- moderna;
- social.

Evitar exceso de:

- gradientes;
- glassmorphism;
- neon indiscriminado;
- animaciones pesadas.

TV debe ser legible desde distancia.

---

# 34. Animaciones

Usar para:

- resultado;
- ranking;
- transición de cantante.

No animar permanentemente elementos importantes.

---

# 35. Performance

Objetivos:

- búsqueda < 500 ms en condiciones normales;
- navegación SPA fluida;
- imágenes lazy;
- evitar consultas N+1;
- cachear catálogo cuando proceda.

---

# 36. Accesibilidad

Cumplir como mínimo:

- labels;
- teclado;
- foco visible;
- contraste;
- botones con nombre accesible;
- no depender exclusivamente de color.

---

# 37. Responsive

Probar:

- 375px;
- 768px;
- 1366px;
- 1920x1080.

---

# 38. Tests

Prioridad:

1. licencias;
2. queue;
3. scoring;
4. permisos;
5. finalización de canción.

Unit tests:

- ScoringService;
- LicenseService;
- normalization.

Integration:

- session creation;
- queue mutation;
- score save.

E2E crítico:

```text
login
→ create session
→ guest joins
→ guest requests song
→ owner plays
→ ended
→ score
→ ranking
```

---

# 39. Variables de entorno

Crear `.env.example`.

Nunca commitear valores reales.

Ejemplo:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
YOUTUBE_API_KEY=
NEXT_PUBLIC_APP_URL=
```

---

# 40. Seeds

Crear datos demo.

Géneros:

- Pop;
- Rock;
- Baladas;
- Latino;
- Rancheras.

No agregar cientos de URLs ficticias.

Usar pocos ejemplos de prueba.

---

# 41. Git

Commits pequeños.

Ejemplos:

```text
feat(auth): add Supabase login
feat(karaoke): add room creation
feat(queue): add guest requests
feat(player): handle YouTube ended event
feat(scoring): add party scoring
```

---

# 42. No romper funcionalidad existente

Antes de modificar:

- revisar;
- comprender;
- cambiar lo mínimo.

Después:

- typecheck;
- lint;
- test;
- build.

---

# 43. Definition of Done

Una tarea está terminada cuando:

- código funciona;
- TypeScript compila;
- lint pasa;
- RLS está correcto;
- no hay secretos expuestos;
- responsive básico funciona;
- errores manejados;
- migraciones incluidas;
- documentación actualizada.

---

# 44. Orden de construcción

Seguir este orden salvo bloqueo:

## Sprint 1

- setup;
- auth;
- profiles;
- RLS;
- layout.

## Sprint 2

- artists;
- genres;
- songs;
- admin catálogo;
- búsqueda.

## Sprint 3

- sessions;
- participants;
- room code;
- QR.

## Sprint 4

- queue;
- TV;
- YouTube player.

## Sprint 5

- scoring;
- ranking;
- history.

## Sprint 6

- favorites;
- licenses;
- device limits.

## Sprint 7

- commercial mode;
- analytics;
- polish.

---

# 45. Primera tarea recomendada

Al iniciar un repositorio vacío:

1. crear Next.js + TypeScript;
2. configurar Tailwind;
3. conectar Supabase;
4. crear `.env.example`;
5. crear autenticación;
6. crear esquema inicial;
7. aplicar RLS;
8. crear dashboard vacío;
9. validar build.

No comenzar por el reproductor.

La base de seguridad y datos debe existir primero.

---

# 46. Cuando haya ambigüedad

Elegir:

- opción más simple;
- reversible;
- segura.

Documentar decisión.

No construir funcionalidades grandes basadas en suposiciones.

---

# 47. Filosofía MVP

No sobreconstruir.

El MVP debe demostrar:

> “Una persona abre una sesión, otra entra por QR, pide una canción, canta y recibe un resultado.”

Todo lo que no ayude directamente a probar esa experiencia debe esperar.

---

# 48. Regla final

Antes de implementar cualquier feature pregúntate:

1. ¿Está en SPEC.md?
2. ¿Es necesaria para el flujo MVP?
3. ¿Introduce riesgo legal/técnico innecesario?
4. ¿Puede hacerse más simple?

Si la respuesta indica complejidad innecesaria, no implementarla todavía.
