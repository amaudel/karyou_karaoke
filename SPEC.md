# SPEC.md — Plataforma Web de Karaoke Social con YouTube

## 1. Visión del producto

Construir una aplicación web de karaoke social que utilice videos de karaoke disponibles en YouTube como fuente de reproducción y agregue una experiencia propia alrededor del reproductor:

- búsqueda de canciones;
- catálogo curado;
- filtros por artista, género y tema;
- cola de cantantes;
- acceso mediante QR desde celulares;
- modo TV / pantalla principal;
- perfiles de usuario;
- favoritos e historial;
- puntuación recreativa al terminar una canción;
- ranking de la noche;
- licencias Home y Commercial;
- acceso mediante usuario y contraseña;
- posibilidad de licencia permanente sin mensualidad para usuarios seleccionados.

La plataforma NO debe presentarse como “venta de canciones de YouTube”. El producto que se comercializa es el software, la experiencia de karaoke, la organización de turnos, perfiles, puntuaciones y funciones sociales.

---

## 2. Objetivo

Convertir cualquier computadora o Smart TV con navegador en una experiencia de karaoke para:

1. hogares;
2. fiestas privadas;
3. reuniones;
4. animadores;
5. bares y locales de karaoke, sujeto a sus propias obligaciones de licenciamiento de música y uso comercial.

La experiencia debe ser lo suficientemente sencilla para que una persona pueda iniciar una noche de karaoke en menos de 2 minutos.

---

## 3. Propuesta de valor

### Para hogares

“Convierte tu TV en un karaoke interactivo para tus reuniones y fiestas.”

### Para bares y eventos

“Administra canciones, turnos y participantes desde celulares mientras la pantalla principal mantiene el show.”

### Diferenciador principal

No competir inicialmente contra plataformas de karaoke profesional por calidad de pistas.

Competir por:

- simplicidad;
- interacción desde celulares;
- QR;
- cola de participantes;
- ranking;
- puntuación divertida;
- facilidad para fiestas;
- catálogo flexible;
- experiencia social.

---

## 4. Principios del producto

1. YouTube es el reproductor, no el producto.
2. La aplicación no descarga videos ni audio de YouTube.
3. La aplicación no elimina branding, controles ni restricciones propias del reproductor.
4. Toda reproducción se realiza mediante integración oficial de YouTube.
5. El catálogo propio almacena metadatos y referencias a videos, no copias del contenido.
6. La experiencia alrededor del reproductor pertenece a la aplicación.
7. La puntuación inicial es recreativa y debe sentirse coherente y auténtica dentro del juego.
8. No afirmar que existe medición técnica de afinación hasta implementar análisis vocal real.
9. El diseño debe funcionar primero en TV, desktop y móvil.
10. La arquitectura debe permitir reemplazar o ampliar la fuente de videos en el futuro.

---

# 5. Tipos de usuario

## 5.1 Visitante

Puede:

- ver landing;
- revisar características;
- crear cuenta;
- iniciar sesión;
- revisar planes.

No puede iniciar una sesión de karaoke premium.

## 5.2 Usuario Home

Puede:

- crear una sesión privada;
- usar el catálogo;
- reproducir canciones;
- crear cola;
- generar QR;
- guardar favoritos;
- ver historial;
- recibir puntuaciones;
- usar ranking;
- administrar su perfil.

## 5.3 Usuario Commercial

Incluye todo Home más:

- identidad del negocio;
- logo del local;
- nombre del evento;
- personalización visual básica;
- mayor límite de participantes;
- sesiones persistentes;
- reportes;
- historial de noches;
- modo operador;
- controles adicionales.

La licencia de software no sustituye licencias musicales, derechos de comunicación pública ni obligaciones del establecimiento.

## 5.4 Administrador

Puede:

- administrar usuarios;
- administrar licencias;
- activar/desactivar cuentas;
- gestionar catálogo;
- validar videos;
- administrar géneros;
- administrar artistas;
- revisar videos rotos;
- ver métricas;
- gestionar reportes;
- cambiar parámetros de puntuación.

---

# 6. Modelo de acceso y licencias

## 6.1 Autenticación

Usar:

- email;
- contraseña;
- recuperación de contraseña;
- verificación de email opcional en MVP;
- sesiones persistentes.

Proveedor recomendado:

Supabase Auth.

## 6.2 Tipos de licencia

### FREE

Objetivo:

probar el producto.

Restricciones sugeridas:

- sesiones limitadas;
- historial reducido;
- sin personalización;
- máximo pequeño de participantes.

### HOME LIFETIME

Licencia permanente de la plataforma.

Incluye:

- uso personal;
- funciones Home;
- actualizaciones menores;
- sin pago mensual.

No debe prometer disponibilidad permanente de servicios externos.

### COMMERCIAL

Licencia para uso profesional del software.

Puede ser:

- mensual;
- anual;
- permanente;
- Founder Lifetime.

En MVP se debe soportar técnicamente:

- `free`;
- `home_lifetime`;
- `commercial_monthly`;
- `commercial_lifetime`;
- `founder_lifetime`.

## 6.3 Estados de licencia

- active;
- expired;
- suspended;
- cancelled;
- trial.

## 6.4 Dispositivos

Cada licencia puede tener límite de dispositivos.

Ejemplo:

Home Lifetime:
- 2 dispositivos activos.

Commercial:
- configurable.

Implementar tabla de dispositivos registrados.

---

# 7. Arquitectura recomendada

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui opcional
- React Query o equivalente
- YouTube IFrame Player API

## Backend

Supabase:

- PostgreSQL;
- Auth;
- RLS;
- Edge Functions si es necesario;
- Storage solo para logos/avatares propios.

## Hosting

- Vercel para frontend;
- Supabase para backend.

## Pagos

Diseñar la arquitectura preparada para:

- Stripe;
- PayPhone;
- Mercado Pago;
- transferencia manual;
- activación manual desde administración.

El MVP puede iniciar con activación manual de licencias.

---

# 8. Módulos del sistema

## 8.1 Landing

Secciones:

- Hero;
- cómo funciona;
- funciones;
- Home;
- Commercial;
- planes;
- preguntas frecuentes;
- CTA;
- login;
- registro.

CTA principal:

“Crear mi karaoke”

CTA secundario:

“Ver cómo funciona”

---

## 8.2 Registro e inicio de sesión

Pantallas:

- registro;
- login;
- recuperar contraseña;
- perfil.

Campos iniciales:

- nombre;
- email;
- contraseña;
- país opcional.

---

## 8.3 Dashboard

Mostrar:

- iniciar karaoke;
- continuar sesión;
- favoritos;
- historial;
- licencia;
- perfil.

Para Commercial:

- modo operador;
- sesiones recientes;
- personalización.

---

# 9. Sesiones de karaoke

Una sesión representa una noche o evento.

Campos:

- id;
- owner_id;
- name;
- access_code;
- qr_token;
- status;
- started_at;
- ended_at;
- mode;
- created_at.

Estados:

- draft;
- active;
- paused;
- finished.

## Flujo

1. Usuario inicia sesión.
2. Pulsa “Nueva sesión”.
3. Define nombre.
4. Sistema crea código y QR.
5. Se abre pantalla de TV.
6. Invitados escanean QR.
7. Buscan canciones.
8. Solicitan cantar.
9. Operador administra cola.
10. Video se reproduce.
11. Al terminar aparece resultado.
12. Se actualiza ranking.
13. Pasa al siguiente participante.

---

# 10. Pantalla TV

Debe optimizarse para 16:9.

Elementos:

- reproductor;
- canción actual;
- cantante actual;
- siguiente cantante;
- cola resumida;
- QR;
- identidad del evento;
- barra de progreso;
- estado de reproducción.

Estados de pantalla:

1. Esperando canciones.
2. Preparando canción.
3. Reproduciendo.
4. Pausa.
5. Resultado.
6. Ranking.
7. Siguiente participante.

No colocar overlays encima del área del reproductor que interfieran con controles o branding de YouTube.

---

# 11. Modo móvil para invitados

Acceso por URL:

`/room/{code}`

No requiere cuenta en MVP.

Solicitar:

- nombre o nickname.

Funciones:

- buscar;
- filtrar;
- abrir canción;
- solicitar canción;
- ver posición;
- cancelar solicitud propia;
- ver “cantando ahora”;
- ver ranking.

---

# 12. Catálogo

No depender exclusivamente de búsqueda libre de YouTube.

Construir catálogo propio de referencias.

## Tabla songs

Campos sugeridos:

- id;
- title;
- normalized_title;
- artist_id;
- genre_id;
- youtube_video_id;
- youtube_url;
- thumbnail_url;
- duration_seconds;
- language;
- active;
- embeddable_status;
- source;
- verified_at;
- created_at;
- updated_at.

## Tabla artists

- id;
- name;
- normalized_name;
- image_url opcional;
- active.

## Tabla genres

- id;
- name;
- slug;
- active.

## Fuente

Las canciones pueden agregarse:

- manualmente;
- mediante panel administrativo;
- mediante API de YouTube para obtener metadatos;
- por importación CSV futura.

---

# 13. Búsqueda

Debe buscar por:

- canción;
- artista;
- género;
- idioma.

Debe tolerar:

- mayúsculas;
- minúsculas;
- tildes;
- pequeñas diferencias de escritura.

Ejemplo:

`mana`

debe encontrar:

- Maná;
- canciones de Maná.

---

# 14. Cola de karaoke

## Tabla queue_items

Campos:

- id;
- session_id;
- song_id;
- participant_id;
- position;
- status;
- requested_at;
- started_at;
- finished_at;
- score_id.

Estados:

- waiting;
- ready;
- playing;
- completed;
- skipped;
- cancelled.

## Reglas

- un participante puede tener máximo N canciones pendientes;
- configurable;
- evitar duplicados accidentales;
- operador puede reordenar;
- operador puede saltar;
- participante solo puede cancelar su propia canción.

---

# 15. Participantes

## Tabla participants

- id;
- session_id;
- nickname;
- avatar_seed;
- joined_at;
- active.

No exigir cuenta en MVP.

Opcional:

- avatar generado;
- emoji;
- color.

---

# 16. Reproductor

Usar YouTube IFrame Player API.

Debe detectar:

- ready;
- playing;
- paused;
- ended;
- buffering;
- error.

Al recibir `ENDED`:

1. marcar queue item como completed;
2. generar score;
3. mostrar animación;
4. actualizar ranking;
5. preparar siguiente canción.

Errores deben mostrar:

“Esta pista no está disponible. Selecciona otra versión.”

El operador puede marcar una canción como inactiva.

---

# 17. Sistema de puntuación MVP

La puntuación del MVP debe estar diseñada para **sentirse como una evaluación real dentro de la experiencia de karaoke**, aunque en esta primera versión no exista todavía un análisis técnico completo de afinación vocal.

La interfaz NO debe presentar el resultado como un número aleatorio.

Debe existir una lógica de puntuación coherente, reproducible y suficientemente variable para que el usuario perciba que su actuación fue evaluada.

## 17.1 Objetivo de experiencia

Al terminar una canción, la aplicación debe mostrar una breve secuencia como:

```text
Analizando interpretación...
Midiendo ritmo...
Evaluando energía...
Calculando puntuación final...
```

Luego presentar el resultado con animación progresiva.

Ejemplo:

```text
ANDRÉS

PUNTUACIÓN

94

Ritmo          92
Energía        96
Interpretación 94

¡ESPECTACULAR!

TOP 1 DE LA NOCHE
```

La experiencia debe recordar a una máquina o videojuego de karaoke.

## 17.2 Coherencia del resultado

El score NO debe ser un `Math.random()` simple.

Debe depender de señales disponibles en la aplicación.

Variables posibles en MVP:

- porcentaje de canción completada;
- cantidad de pausas;
- abandono o finalización;
- historial del participante;
- dificultad configurada de la canción;
- racha;
- duración de participación;
- variación pseudoaleatoria controlada;
- seed derivado de sesión + usuario + canción.

Esto permite que:

- terminar una canción produzca normalmente mejores resultados que abandonarla;
- repetir inmediatamente la misma canción no genere resultados totalmente absurdos;
- las puntuaciones mantengan una distribución creíble;
- no todos obtengan 90+;
- los resultados extremos sean poco frecuentes.

## 17.3 Distribución sugerida

La mayoría de actuaciones completas deberían quedar aproximadamente entre:

- 70–79: actuación normal;
- 80–89: buena;
- 90–96: excelente;
- 97–100: excepcional y poco frecuente.

Resultados inferiores a 70 deben aparecer principalmente cuando:

- se abandona la canción;
- existe muy poca reproducción;
- la sesión se interrumpe;
- se detectan condiciones configuradas como bajo desempeño.

## 17.4 Algoritmo conceptual

Ejemplo:

```text
base_score = 72

completion_component = 0..10
consistency_component = 0..6
performance_variation = -4..8
streak_component = 0..2
rare_bonus = 0..4

final_score = clamp(
  base_score
  + completion_component
  + consistency_component
  + performance_variation
  + streak_component
  + rare_bonus,
  50,
  100
)
```

Los pesos deben configurarse desde `ScoringService`.

## 17.5 Subpuntajes

En MVP pueden mostrarse:

- Ritmo;
- Energía;
- Interpretación.

Estos valores deben correlacionarse con el score final.

Ejemplo:

Si el total es 93, no mostrar:

- Ritmo 51
- Energía 99
- Interpretación 48

salvo que exista una razón real en el algoritmo.

Los subpuntajes deben producir sensación de evaluación coherente.

## 17.6 Presentación

La puntuación debe:

1. esperar brevemente al terminar la canción;
2. mostrar una animación de análisis;
3. revelar subpuntajes progresivamente;
4. aumentar el contador del score hasta el resultado final;
5. mostrar mensaje;
6. actualizar ranking.

La animación completa debe sentirse emocionante, pero no superar aproximadamente 4–6 segundos.

## 17.7 Terminología

En la experiencia principal se puede utilizar:

- “Puntuación”;
- “Resultado”;
- “Performance Score”;
- “Interpretación”.

No mostrar permanentemente en la pantalla principal textos como:

- “score aleatorio”;
- “puntuación falsa”;
- “simulación”.

Eso destruiría la experiencia de juego.

Sin embargo, en FAQ, ayuda o términos del producto debe explicarse que la puntuación recreativa de la versión inicial **no constituye una medición profesional de afinación vocal**.

No afirmar técnicamente que:

- se detectó una nota;
- se midió afinación;
- se comparó la voz con la melodía original;

si esas funciones todavía no existen.

## 17.8 Futuro con micrófono

Cuando exista acceso al micrófono, la puntuación puede incorporar señales reales:

- presencia de voz;
- tiempo cantado;
- intensidad;
- continuidad;
- estabilidad;
- ritmo aproximado.

La interfaz puede mantenerse igual mientras el motor interno mejora.

## 17.9 Futuro con afinación

Cuando exista pitch detection con referencia musical válida, agregar:

- Afinación;
- Precisión;
- Notas correctas;
- estabilidad tonal.

Solo en ese momento utilizar “Afinación” como métrica técnica.


# 18. Ranking

Mostrar:

- posición;
- participante;
- canción;
- mejor puntuación;
- promedio opcional.

Modo TV:

Top 5.

Modo móvil:

ranking completo.

---

# 19. Evolución futura del scoring

## Fase 2

Acceso al micrófono.

Analizar:

- actividad vocal;
- intensidad;
- continuidad;
- tiempo cantado.

## Fase 3

Pitch detection.

Requerirá referencia musical propia o autorizada.

No extraer audio de YouTube.

---

# 20. Favoritos

Usuario registrado puede guardar canciones.

Tabla:

`user_favorites`

- user_id;
- song_id;
- created_at.

---

# 21. Historial

Registrar:

- sesión;
- canción;
- cantante;
- puntuación;
- fecha.

El dueño puede revisar noches anteriores.

---

# 22. QR

Cada sesión activa genera QR.

Debe contener:

`https://dominio.com/room/{code}`

Requisitos:

- código corto;
- no mostrar IDs internos;
- posibilidad de regenerar token;
- invalidar QR cuando sesión termina.

---

# 23. Panel administrativo

Ruta:

`/admin`

Solo admin.

Módulos:

### Canciones

- listar;
- buscar;
- crear;
- editar;
- desactivar;
- verificar enlace.

### Artistas

CRUD.

### Géneros

CRUD.

### Usuarios

- buscar;
- ver licencia;
- suspender;
- activar.

### Licencias

- asignar;
- modificar;
- suspender;
- activar;
- registrar pago manual.

### Métricas

- usuarios;
- sesiones;
- canciones reproducidas;
- canciones más solicitadas;
- errores.

---

# 24. Base de datos inicial

Tablas:

- profiles;
- licenses;
- user_devices;
- karaoke_sessions;
- participants;
- artists;
- genres;
- songs;
- queue_items;
- scores;
- user_favorites;
- playback_events;
- admin_audit_log.

---

# 25. Seguridad

Obligatorio:

- RLS;
- políticas por usuario;
- separar roles;
- admin verificado server-side;
- nunca confiar en `role` enviado desde cliente;
- validar inputs;
- rate limiting en rutas públicas;
- proteger QR contra enumeración trivial;
- secretos solo server-side;
- nunca exponer service role key.

---

# 26. RLS conceptual

## profiles

Usuario solo ve y modifica su perfil.

## licenses

Usuario solo puede leer la suya.

Solo backend/admin modifica.

## karaoke_sessions

Dueño administra su sesión.

Invitados solo acceden a sesión activa mediante funciones controladas.

## queue_items

Invitado puede crear solicitud para sesión activa.

Solo puede cancelar su solicitud.

Owner puede administrar toda la cola.

## songs

Lectura pública controlada.

Escritura solo admin.

---

# 27. Diseño

## Personalidad

- divertida;
- moderna;
- nocturna;
- energética;
- limpia.

## Referencias visuales

Combinar:

- karaoke;
- concurso musical;
- fiesta;
- gaming casual.

Evitar aspecto corporativo.

## Home

Pantalla oscura.

Tarjetas grandes.

Texto visible desde TV.

Botones táctiles grandes.

---

# 28. Responsive

Breakpoints prioritarios:

1. móvil;
2. desktop;
3. TV 1920x1080.

La pantalla TV debe tener modo fullscreen.

---

# 29. PWA

No obligatoria en MVP.

Arquitectura compatible con futura instalación como PWA.

---

# 30. Eventos y telemetría

Registrar:

- session_created;
- participant_joined;
- song_requested;
- playback_started;
- playback_completed;
- playback_error;
- score_generated;
- license_activated.

No almacenar información innecesaria.

---

# 31. MVP

## Incluye

- landing;
- registro/login;
- dashboard;
- catálogo;
- búsqueda;
- artistas;
- géneros;
- sesiones;
- QR;
- invitados sin cuenta;
- cola;
- pantalla TV;
- reproductor YouTube;
- detección de fin;
- puntuación simulada;
- ranking;
- favoritos;
- historial;
- admin básico;
- licencias;
- activación manual.

## No incluye

- afinación real;
- separación de voz;
- cambio de tonalidad;
- cambio de tempo;
- descarga offline;
- reproducción sin YouTube;
- app nativa;
- facturación automática;
- marketplace;
- chat;
- comentarios;
- grabación de voz.

---

# 32. Fases

## Fase 1 — Fundación

- proyecto;
- autenticación;
- base de datos;
- RLS;
- catálogo;
- admin.

## Fase 2 — Karaoke

- sesiones;
- participantes;
- cola;
- reproductor;
- TV.

## Fase 3 — Experiencia social

- QR;
- scoring;
- ranking;
- historial;
- favoritos.

## Fase 4 — Comercialización

- licencias;
- pagos;
- dispositivos;
- planes;
- métricas.

## Fase 5 — Inteligencia de voz

- micrófono;
- análisis de actividad;
- pitch opcional.

---

# 33. Criterios de aceptación MVP

El MVP está listo cuando:

1. un usuario puede registrarse;
2. puede iniciar sesión;
3. puede crear una sesión;
4. obtiene QR;
5. otra persona entra desde un celular;
6. busca una canción;
7. la agrega a la cola;
8. aparece en TV;
9. el operador inicia canción;
10. el video se reproduce;
11. al terminar se genera resultado;
12. ranking se actualiza;
13. siguiente canción queda lista;
14. historial queda guardado;
15. licencia limita acceso correctamente.

---

# 34. Modelo comercial inicial sugerido

Validar antes de fijar precios definitivos.

### Free

Prueba.

### Home Lifetime

Pago único.

Pensado para:

- hogares;
- fiestas;
- reuniones.

### Founder Lifetime

Cupos limitados.

Objetivo:

- conseguir primeros usuarios;
- financiar validación;
- obtener feedback.

### Commercial

Licencia separada.

No confundir:

- licencia del software;
- licencias musicales;
- derechos de comunicación pública;
- condiciones de terceros.

---

# 35. Riesgos

## Dependencia de YouTube

Mitigación:

- arquitectura desacoplada;
- guardar solo `youtube_video_id`;
- capa de proveedor;
- permitir futuras fuentes.

## Videos eliminados

Mitigación:

- verificación;
- estado `active`;
- reporte de usuario;
- alternativas por canción.

## Catálogo inconsistente

Mitigación:

- curación;
- admin;
- metadatos normalizados.

## Percepción de scoring artificial

Mitigación:

- evitar números puramente aleatorios;
- utilizar un motor de scoring coherente y con distribución controlada;
- animar el proceso de análisis y revelar subpuntajes;
- mantener consistencia entre total y métricas;
- no afirmar que existe análisis técnico de afinación cuando aún no se ha implementado;
- evolucionar progresivamente a señales reales del micrófono.

## Lifetime financieramente costoso

Mitigación:

- limitar Founder;
- cobrar versiones mayores;
- diferenciar Home y Commercial.

---

# 36. Capa de proveedores

Crear interfaz conceptual:

```ts
interface VideoProvider {
  search(query: string): Promise<VideoResult[]>
  getVideo(id: string): Promise<VideoMetadata>
  canEmbed(id: string): Promise<boolean>
}
```

Primera implementación:

`YouTubeProvider`

Esto permitirá sustituir o agregar proveedores sin reescribir el producto.

---

# 37. Nombre interno

Hasta definir marca final:

`Karaoke Party`

No fijar este nombre en la arquitectura.

Usar constantes configurables:

- appName;
- appLogo;
- domain;
- supportEmail.

---

# 38. Definición de éxito inicial

Objetivo de validación:

- 20 usuarios reales;
- 10 sesiones completas;
- más de 5 canciones promedio por sesión;
- usuarios capaces de operar sin asistencia;
- al menos 30% de usuarios repiten una segunda sesión;
- interés real en pagar.

No desarrollar funciones complejas antes de validar estos indicadores.
