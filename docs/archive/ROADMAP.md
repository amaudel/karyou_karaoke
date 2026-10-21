# ROADMAP.md — Plan de construcción del MVP

| Campo | Valor |
|---|---|
| Documento | Roadmap del MVP: fases, entregables y criterios de salida |
| Versión | 0.1 (borrador para revisión) |
| Estado | **Propuesto — no iniciar la Fase 1 hasta que la arquitectura esté aprobada y la Fase 0 cerrada** |
| Referencias | `SPEC.md` §31–§34, `CLAUDE.md` §44–§47, `docs/ARCHITECTURE.md` §20, `docs/ADR/` |

---

## 1. Cómo leer este roadmap

### 1.1 Principios

1. **Seguridad y datos primero.** `CLAUDE.md` §45 es explícito: no empezar por el reproductor. La
   base de datos, RLS y autenticación deben existir antes de que haya algo que proteger.
2. **Cada fase termina con algo demostrable y verificable**, no con "código escrito".
3. **Los criterios de salida son comprobaciones, no opiniones.** "Build verde", "suite RLS verde",
   "test de distribución pasa".
4. **Ninguna fase empieza antes de que la anterior cumpla su criterio de salida.** Acumular fases a
   medias es cómo se llega a un MVP que no funciona en la primera fiesta real.
5. **`CLAUDE.md` §48 antes de cada tarea:** ¿está en `SPEC.md`? ¿es necesaria para el flujo MVP?
   ¿introduce riesgo legal o técnico? ¿se puede hacer más simple?

### 1.2 Camino crítico

```text
F0 Viabilidad y cumplimiento          ← BLOQUEANTE. Sin esto, todo lo demás puede ser trabajo perdido
      │
F1 Fundación (auth, datos, RLS)
      │
F2 Catálogo y búsqueda
      │
F3 Sesiones e invitados
      │
F4 Cola y pantalla TV          ← aquí se prueba el producto
      │
F5 Scoring, ranking e historial
      │
F6 Favoritos, licencias y límites
      │
F7 Commercial, polish y piloto real
      │
VALIDACIÓN (SPEC §38): 20 usuarios · 10 sesiones · 30 % repiten
```

### 1.3 Estimaciones

Las duraciones son estimaciones de esfuerzo de **una persona** a tiempo completo, y son
deliberadamente conservadoras. No incluyen trabajo legal externo (que corre en paralelo pero
bloquea la venta, no el desarrollo).

| Fase | Duración estimada | Acumulado |
|---|---|---|
| F0 | 1 semana | 1 |
| F1 | 2 semanas | 3 |
| F2 | 3 semanas | 6 |
| F3 | 2 semanas | 8 |
| F4 | 3 semanas | 11 |
| F5 | 2,5 semanas | 13,5 |
| F6 | 2 semanas | 15,5 |
| F7 | 2,5 semanas | 18 |
| **Total** | **~18 semanas** | **~4,5 meses** |

Si se aprueba el ADR-0019 (señal vocal), añadir ~1,5 semanas a F5. El total pasa a ~19,5 semanas.

---

## 2. Fase 0 — Viabilidad y cumplimiento (1 semana)

**Objetivo:** responder con evidencia las preguntas que, si se responden mal, invalidan el
proyecto. Es la fase más barata y la de mayor retorno: cuesta una semana y puede ahorrar tres meses.

> **Ninguna línea de código de producción se escribe hasta que la Fase 0 cierre con veredicto
> escrito.**

### 2.1 Entregables

| # | Entregable | Cómo se produce |
|---|---|---|
| E0.1 | **Informe de viabilidad del reproductor** | Probar 30 videos de karaoke de 10 canales distintos en 4 entornos reales: Chrome desktop, Safari, Android TV (o Fire TV) y una Smart TV (Tizen o webOS). Medir: tasa de error 101/150, si el autoplay requiere gesto, comportamiento del tamaño del reproductor, si los anuncios interrumpen |
| E0.2 | **Verificación de cuota** | Ejecutar `videos.list` y `playlistItems.list` contra la API real, medir consumo real en el ledger de Google Cloud y confirmar los cupos documentados. Confirmar el reinicio a medianoche PT |
| E0.3 | **Opinión legal escrita** sobre cuatro preguntas concretas | Ver §2.2. Es un entregable externo con plazo, no una conversación |
| E0.4 | **Prueba del motor de scoring** | Implementar el motor como script desechable y ejecutar 100,000 simulaciones. ¿La distribución objetivo es alcanzable? ¿Se siente coherente? ¿Cuánta varianza aporta de verdad la telemetría frente al PRNG? |
| E0.5 | **Prueba de señal vocal** (si se aprueba C3) | Con 5 personas y 3 dispositivos distintos: ¿el micrófono aporta una señal usable o capta principalmente la pista de karaoke? Veredicto empírico |
| E0.6 | **Presupuesto de cuota real** | Con los números de E0.2, calcular cuántas canciones se pueden importar por día y si el catálogo objetivo (500–5,000) es alcanzable en el plazo previsto |
| E0.7 | **Decisión sobre C1–C5** | Ver `docs/ARCHITECTURE.md` §0.4. Cada una documentada en su ADR correspondiente, cambiando el estado de `Propuesto` a `Aceptado` o `Rechazado` |
| E0.8 | **Prueba de un flujo de costos** | Estimar el costo mensual de Supabase + Vercel para 50 sesiones concurrentes y para 500. Verificar que un lifetime sigue siendo sostenible |

### 2.2 Las cuatro preguntas legales (E0.3)

Deben responderse **por escrito** por un abogado con experiencia en propiedad intelectual y
derecho digital. No son preguntas genéricas:

1. **¿Es admisible cobrar por licencias de software** cuando la reproducción ocurre en un
   reproductor embebido de YouTube, dado que las políticas de desarrollador prohíben cobrar por
   ver contenido en un reproductor embebido? ¿Qué redacción de los términos y qué diseño de la
   matriz de planes minimiza el riesgo?
2. **¿Es admisible poblar un catálogo propio** con metadatos obtenidos mediante la API oficial a
   partir de listas de reproducción públicas de canales de karaoke? ¿Qué obligaciones de
   atribución, retiro y refresco son exigibles?
3. **¿Qué obligaciones tiene el cliente comercial** (bar, local, animador) respecto de licencias
   musicales y de comunicación pública en la jurisdicción objetivo, y cómo deben reflejarse en los
   términos del producto?
4. **¿Satisface la desactivación lógica** el requisito de "delete or refresh" de los 30 días de
   datos de API, o se exige el borrado físico de los campos almacenados? (Ver ADR-0014)

### 2.3 Criterio de salida

- [ ] Informe de viabilidad del reproductor con datos, no impresiones
- [ ] Cuota real medida y presupuesto de catálogo calculado
- [ ] Opinión legal escrita sobre las cuatro preguntas
- [ ] Motor de scoring validado con distribución medida
- [ ] C1–C5 decididas y sus ADR actualizados
- [ ] Veredicto explícito: **se puede construir y vender con este modelo**, con las condiciones
      identificadas

### 2.4 Si la Fase 0 falla

| Resultado | Respuesta |
|---|---|
| El reproductor es inviable en Smart TV (autoplay, errores) | El producto se limita a desktop HDMI + móvil. Es una restricción de mercado, no un bloqueo |
| La cuota hace inviable el catálogo | Se cambia el bootstrap a importación CSV de un catálogo propio o licenciado; F2 se convierte en un bloqueo de negocio, no técnico |
| La opinión legal sobre C1 es negativa | Se rediseña la matriz de planes (ADR-0018) o se pivota a contenido licenciado antes de vender |
| La señal vocal no aporta (E0.5) | Se lanza con telemetría + PRNG y se documenta la limitación en la FAQ. El score sigue siendo coherente, solo menos variado |
| El costo por sesión hace insostenible el lifetime | Se ajusta la duración de "lifetime" (decisión C4) o se migra a suscripción |

---

## 3. Fase 1 — Fundación (2 semanas)

**Objetivo:** que exista una base segura sobre la que se pueda construir. Sin catálogo, sin
karaoke, sin reproductor. Solo seguridad, datos y estructura.

Alineada con `CLAUDE.md` §44 Sprint 1 y §45.

### 3.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | Proyecto Next.js 15 + TypeScript estricto + Tailwind 4 + ESLint con reglas de frontera de capas (`eslint-plugin-boundaries`) |
| 1 | Estructura de `src/` con las carpetas de capas y las reglas de importación verificadas |
| 1 | Proyecto Supabase, `config.toml`, extensiones (`unaccent`, `pg_trgm`, `pgcrypto`), esquema `app`, `app.norm_text` |
| 1 | Migraciones: enums, `profiles`, `user_devices`, `plans`, `plan_features`, `licenses`, `license_events` |
| 2 | Auth: registro, login, recuperación, **Auth anónimo habilitado** (ADR-0004) |
| 2 | Cookies httpOnly vía `@supabase/ssr`, middleware de refresco, verificación de `Origin` (ADR-0016) |
| 2 | RLS completo en las tablas de identidad y licencias + `force row level security` |
| 2 | Suite pgTAP inicial: `00_helpers_test`, `01_rls_profiles_test`, `02_rls_licenses_test`, `07_functions_privileges`, `08_rls_views_test` |
| 2 | `.env.example`, validación de variables con zod, `import "server-only"` |
| 2 | Cabeceras de seguridad, incluida `Referrer-Policy: strict-origin-when-cross-origin` (ADR-0010) |
| 2 | Layout base, dashboard vacío, seed mínimo (planes + géneros + admin de desarrollo) |
| 2 | CI: typecheck, lint, tests, pgTAP, `pnpm audit`, escaneo de secretos, `build` |

### 3.2 Criterio de salida

- [ ] `build` verde, typecheck sin errores, lint sin errores
- [ ] Suite pgTAP verde: usuario A no puede leer ni modificar datos de usuario B
- [ ] Un usuario A **no** puede autoconcederse `role = 'admin'` (test explícito)
- [ ] Un usuario A **no** puede insertar ni modificar su propia licencia
- [ ] El login funciona y la sesión persiste en cookie httpOnly (test E2E)
- [ ] La cookie es `httpOnly`, `Secure` y `SameSite=Lax` (test de cabeceras)
- [ ] El bundle del cliente **no** contiene `SUPABASE_SERVICE_ROLE_KEY` (test automatizado)
- [ ] `app.norm_text` pasa todos los casos de prueba con tildes
- [ ] Los 6 planes existen en `plan_features` con la matriz completa de entitlements
- [ ] Un usuario `anon` no puede ejecutar ninguna RPC que requiera sesión

### 3.3 Riesgos de la fase

- **Subestimar el tiempo de RLS.** Es la fase donde más se aprende y donde más fácil es escribir
  una política permisiva por descuido. Los tests pgTAP no son opcionales.
- **Conflictos de configuración de cookies** entre `@supabase/ssr` y el App Router de Next.js.
  Seguir el patrón oficial, no improvisar.

---

## 4. Fase 2 — Catálogo, búsqueda y admin (3 semanas)

**Objetivo:** que existan canciones de verdad, que se puedan buscar rápido y bien, y que se puedan
curar sin salir de la aplicación.

Alineada con `CLAUDE.md` §44 Sprint 2.

### 4.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | Migraciones: `artists`, `genres`, `songs`, `song_sources`, `song_reports` + RLS + índices trigram |
| 1 | `app.norm_text`, columnas generadas, `uq_songs__title_artist`, `uq_song_sources__one_primary` |
| 1 | Administración: CRUD de artistas, géneros y canciones |
| 2 | Alta de canción por URL o ID de YouTube con parseo estricto del `videoId` y `videos.list` |
| 2 | `app.consume_youtube_quota` + `youtube_quota_ledger` + panel `/admin/cuota` |
| 2 | **Importador de listas de reproducción** con cola de revisión y aprobación (ADR-0013) |
| 2 | `search_songs` con ranking por niveles + `search_logs` |
| 3 | Búsqueda en la UI: filtros por género e idioma, tolerancia a tildes y errores de tipeo |
| 3 | Página de exploración de catálogo con paginación y orden por popularidad |
| 3 | Reporte **"búsquedas sin resultado"** en `/admin` (pipeline de curación) |
| 3 | Reporte de pistas rotas para el admin |
| 3 | `job_refresh_song_sources` + `job_purge_stale_metadata` + test `09_compliance_30_days` |
| 3 | Seed: ~15 canciones verificadas con `embeddable_status = 'embeddable'` |

### 4.2 Criterio de salida

- [ ] **≥ 300 canciones publicadas y reproducibles** (verificadas, no solo insertadas)
- [ ] Búsqueda p95 < 200 ms con 10,000 canciones cargadas (`explain analyze` documentado)
- [ ] `mana` encuentra Maná y sus canciones; `jose jose` encuentra José José; `acdc` encuentra AC/DC
- [ ] 0 llamadas a `search.list` desde cualquier ruta de usuario (test)
- [ ] El corte de circuito de cuota funciona al 80 % (test)
- [ ] El job de refresco actualiza metadatos y detecta videos eliminados
- [ ] Ninguna fuente con metadatos > 30 días es visible para un usuario no-admin (test pgTAP)
- [ ] El importador requiere aprobación humana: nada se publica automáticamente
- [ ] El reporte de "búsquedas sin resultado" muestra datos reales de una sesión de prueba
- [ ] `admin_audit_log` registra alta, edición y desactivación de canciones

### 4.3 Riesgos de la fase

- **La curación es trabajo humano real.** Si nadie atiende la cola de revisión, el catálogo no
  crece. Hay que asignar tiempo explícito, no tratarlo como una tarea de fondo.
- **Calidad del audio del catálogo cosechado.** El filtro por título no detecta mala calidad.
  La vista previa incrustada en el panel de revisión es la única defensa eficaz.
- **La revisión legal (E0.3) debe estar cerrada antes de esta fase.** Si concluye que la cosecha
  no es admisible, F2 pasa a depender de un catálogo propio.

---

## 5. Fase 3 — Sesiones, invitados y QR (2 semanas)

**Objetivo:** que dos dispositivos estén conectados en la misma sesión. Todavía sin cola ni
reproductor: solo la sesión, el ingreso del invitado y el canal en tiempo real.

Alineada con `CLAUDE.md` §44 Sprint 3.

### 5.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | Migraciones: `karaoke_sessions`, `session_invites`, `session_clients`, `participants`, `session_playback` + RLS |
| 1 | `create_session` con generación de `room_code` Crockford base32 y token de invitación hasheado |
| 1 | `join_session_by_token` y `join_session_by_code` con rate limit por IP |
| 1 | Ruta `/j/[token]`: canje, creación de sesión anónima, `INSERT` de participante, redirect |
| 2 | Ruta `/room/[code]`: ingreso con nickname, "cantando ahora", cola vacía, ranking vacío |
| 2 | Pantalla `/karaoke/[code]/screen` con código de sala y QR (`qrcode`) |
| 2 | Emparejamiento de pantalla (`pair_screen`) con código de 6 dígitos y TTL de 5 min |
| 2 | `get_session_snapshot` (RPC única) + suscripción Realtime a 4 tablas (ADR-0015) |
| 2 | Reducer del show puro y testeable + reconciliación por `revision` |
| 2 | Degradación a polling cada 5 s + indicador de conexión visible al operador |

### 5.2 Criterio de salida

- [ ] Un usuario crea una sesión y obtiene un código de sala y un QR en < 30 s
- [ ] Un invitado escanea el QR desde el móvil y aparece en la sesión **sin crear cuenta**
- [ ] El invitado **no** ve nada de una sesión ajena (test pgTAP con dos sesiones)
- [ ] El código de sala tiene rate limit: 8 intentos/min por IP (test)
- [ ] Regenerar el QR invalida el anterior (test)
- [ ] Un invitado **no** puede emparejarse como pantalla de una sesión ajena
- [ ] El snapshot reconstruye el estado completo en una sola llamada
- [ ] Los deltas duplicados y fuera de orden no corrompen el estado (unit tests del reducer)
- [ ] Cortar Realtime no congela la TV: el polling la mantiene actualizada (test E2E)
- [ ] Rate limiting funciona entre instancias serverless (test con dos invocaciones)

### 5.3 Riesgos de la fase

- **Realtime en redes inestables.** El backoff y la resincronización hay que implementarlos y
  probarlos, no confiar en que la librería lo resuelva.
- **Límite de conexiones concurrentes** del plan de Supabase. Medirlo en la prueba de carga de la
  fase.

---

## 6. Fase 4 — Cola y pantalla TV (3 semanas)

**Objetivo:** el producto empieza a existir. Un invitado pide una canción, aparece en la TV y
suena. Es la fase donde se descubre si la idea funciona.

Alineada con `CLAUDE.md` §44 Sprint 4.

### 6.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | Migración `queue_items` con `sort_key`, `status`, `skip_reason` (ADR-0007, ADR-0020) + RLS |
| 1 | RPC `request_song`, `cancel_queue_item`, `reorder_queue_item`, `promote_queue_item`, `skip_current` |
| 1 | Advisory lock por sesión + tests de concurrencia |
| 1 | UI de cola en `/room/[code]`: pedir, ver posición, cancelar lo propio |
| 2 | `KaraokePlayer`: instancia única, `onReady`, `onStateChange`, `onError`, mapa de errores |
| 2 | `PlayerStage` 16:9 + `ShowPanel` como regiones hermanas (ADR-0009) |
| 2 | Pantalla TV completa: cantando ahora, siguiente, cola, QR, estado de reproducción |
| 2 | Botón "Iniciar show" + detección de audio bloqueado + reintento |
| 3 | `start_queue_item`, `set_playback_state` con CAS por `revision` (ADR-0008) |
| 3 | Fallback automático entre fuentes de la misma canción (ADR-0006) |
| 3 | **Test de intersección de rectángulos del reproductor en CI** (ADR-0009) |
| 3 | Panel de operador: reordenar, saltar, pausar, promover |
| 3 | `report_playback_error` + `song_reports` + `fail_count` |
| 3 | Pruebas en hardware real: Chrome desktop, Safari, Android TV, Fire TV, Smart TV |

### 6.2 Criterio de salida

- [ ] El flujo completo funciona: invitado pide → aparece en TV → el operador inicia → suena
- [ ] **Test de overlay verde**: ningún elemento interseca el rectángulo del reproductor
- [ ] El reproductor mide ≥ 480×270 y las miniaturas reproducibles ≥ 120×70
- [ ] **Un solo** reproductor con reproducción automática por pantalla (test)
- [ ] Sin autoplay al montar: la reproducción requiere gesto del operador (test)
- [ ] Funciona en al menos 3 entornos reales distintos, incluida una Smart TV
- [ ] Dos `request_song` concurrentes del mismo participante y canción → 1 éxito, 1 `DUPLICATE_REQUEST`
- [ ] El cupo de pendientes por participante se respeta (`QUEUE_LIMIT_REACHED`)
- [ ] Reordenar escribe **1 fila** (test de integración)
- [ ] Con dos pantallas abiertas, la obsoleta no corrompe el estado (CAS)
- [ ] Una fuente bloqueada cae a la siguiente sin intervención del operador (test E2E)
- [ ] Si todas las fuentes fallan, el turno queda `failed` con `skip_reason = 'unavailable'` y el
      show continúa
- [ ] Ninguna mutación de cola se puede hacer desde el cliente sin pasar por RPC

### 6.3 Riesgos de la fase

- **Es la fase con más incertidumbre técnica.** El autoplay en Smart TV, el comportamiento del
  reproductor con anuncios y la latencia del embed son cosas que solo se descubren probando.
  Reservar tiempo explícito para pruebas en hardware.
- **Tentación de crear un segundo reproductor para precargar.** Prohibido por ADR-0009 y por las
  RMF de YouTube. El diseño debe asumir 1–3 s de transición.
- **El layout de la TV es más difícil de lo que parece** cuando no se puede superponer nada.
  Validar el diseño visual temprano, no al final.

---

## 7. Fase 5 — Scoring, ranking e historial (2,5 semanas)

**Objetivo:** cerrar el ciclo de juego. La canción termina, aparece un resultado creíble y el
ranking se actualiza.

Alineada con `CLAUDE.md` §44 Sprint 5.

### 7.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | Migraciones: `scores`, `playback_events` (particionada), `session_leaderboard` (vista) |
| 1 | `ScoringService` en `src/domain/scoring` con PRNG sembrado y señales enchufables |
| 1 | `app.compute_performance_score` en SQL + test de paridad con la versión TS |
| 1 | `scripts/calibrate-scoring.ts` (100,000 simulaciones) + test de distribución en CI |
| 2 | `complete_queue_item` idempotente: `UNIQUE (queue_item_id)` + validación de ventana |
| 2 | `playback_events` con `idempotency_key` y validación de telemetría |
| 2,5 | Secuencia de presentación: `analyzing` → reveal progresivo → contador → mensaje → ranking |
| 2,5 | Ranking en TV (top 5) y en móvil (completo) |
| 2,5 | Historial: turnos por sesión, sesiones por usuario, `historyRetentionDays` |
| 2,5 | Enlace visible a la FAQ de scoring desde la pantalla de resultado |
| 2,5 | *(si se aprueba ADR-0019)* captura de señal vocal: `getUserMedia`, agregación, calibración |
| 2,5 | Mensajes de resultado: `messageKey` → copy en español, sin afirmaciones de afinación |

### 7.2 Criterio de salida

- [ ] **Test de distribución verde**: cada banda dentro de ±3 pp; 97+ ≤ 6 %
- [ ] Los subpuntajes se correlacionan con el total (`|sub - total| ≤ 4`) en todo el rango
- [ ] Determinismo: la misma seed produce el mismo resultado en 1,000 iteraciones
- [ ] Paridad SQL ↔ TS sobre 1,000 semillas fijas
- [ ] **Un turno cerrado dos veces produce un solo score** (test idempotente)
- [ ] Un cliente **no** puede insertar un score directamente (test pgTAP)
- [ ] Telemetría imposible se rechaza (posición > duración, duración fuera de ±20 %)
- [ ] `completionRatio < 0.5` acota el total a ≤ 69
- [ ] La animación completa dura entre 4 y 6 segundos
- [ ] Ningún texto de la UI afirma afinación, notas ni precisión melódica (revisión de copy)
- [ ] La FAQ declara que la puntuación recreativa no es una medición vocal profesional
- [ ] Un turno `failed` no genera score ni aparece en el ranking
- [ ] *(si ADR-0019)* el audio **no** sale del dispositivo: el payload contiene solo agregados

### 7.3 Riesgos de la fase

- **La distribución no se ajusta a la objetivo.** Es la razón por la que existe el script de
  calibración y el test. Si no se logra con telemetría, es la señal de que hay que aprobar
  ADR-0019.
- **El placer de la animación es subjetivo.** Hay que probarla con personas reales antes de
  pulirla. Una animación de 8 segundos aburre; una de 2 no genera expectativa.

---

## 8. Fase 6 — Favoritos, licencias y límites (2 semanas)

**Objetivo:** convertir el prototipo funcional en un producto que se puede vender y limitar
correctamente.

Alineada con `CLAUDE.md` §44 Sprint 6.

### 8.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | `user_favorites` + UI de favoritos en móvil y dashboard |
| 1 | `LicenseService` + `canUseFeature` + resolución de entitlements en servidor |
| 1 | Regla de lint que prohíbe `license.type ===` fuera de `src/domain/licensing` |
| 1 | `license_seats` con latido y TTL de 90 s (ADR-0011) + job de barrido |
| 2 | Admin de licencias: asignar, extender, suspender, reactivar + `license_events` |
| 2 | `admin_audit_log` en todas las acciones administrativas críticas |
| 2 | Panel de perfil: licencia actual, pantallas activas, cerrar sesiones remotas |
| 2 | Gates de entitlement: marca, participantes por sesión, pantallas, retención de historial |
| 2 | Pruebas: unitarias de `LicenseService` y `canUseFeature`; integración de límites |

### 8.2 Criterio de salida

- [ ] `user` con licencia `home_lifetime` accede a las funciones Home
- [ ] `user` con licencia `free` **puede reproducir una sesión completa** (ADR-0018, test E2E)
- [ ] `free` está limitado en participantes y pantallas, **no** en reproducción
- [ ] Ningún entitlement ni texto de la página de precios menciona límites de reproducción
- [ ] Superar `maxConcurrentScreens` produce `SCREEN_LIMIT_REACHED` con un mensaje claro
- [ ] El seat se libera por TTL: un cliente sin latido durante 91 s libera su lugar
- [ ] `user_devices` **no** participa en ninguna decisión de autorización (revisión de código)
- [ ] Una licencia `suspended` revoca entitlements en la siguiente petición
- [ ] El usuario **no** puede activarse ni modificarse una licencia (test pgTAP)
- [ ] Toda acción administrativa crítica aparece en `admin_audit_log`
- [ ] Persisten exactamente los campos correctos: nunca un score desde el cliente

### 8.3 Riesgos de la fase

- **La resolución de entitlements se dispersa en condicionales.** La regla de lint es la defensa;
  sin ella, en tres meses hay 40 comparaciones de tipo de licencia por todo el código.
- **Soporte por límites de pantalla.** El mensaje debe ser claro y la liberación por TTL debe
  funcionar, o cada incidencia se convierte en un ticket.

---

## 9. Fase 7 — Commercial, polish y piloto (2,5 semanas)

**Objetivo:** que 20 personas reales usen el producto sin asistencia y que al menos 10 completen
una sesión entera.

Alineada con `CLAUDE.md` §44 Sprint 7.

### 9.1 Entregables

| Semana | Entregable |
|---|---|
| 1 | Personalización del local: logo (Storage), nombre del evento, colores, tema de la TV |
| 1 | Modo operador: vista dedicada, controles adicionales, historial de la noche |
| 1 | Reportes comerciales: sesiones, canciones reproducidas, participantes, ranking histórico |
| 1 | `rollup_metrics` + panel `/admin/metricas` |
| 2 | Landing definitiva con secciones de `SPEC.md` §8.1 y página de precios |
| 2 | Términos, privacidad y FAQ legales (requisitos C-01 a C-07 de `YOUTUBE-INTEGRATION.md`) |
| 2 | Banner de consentimiento de cookies donde la ley lo exija |
| 2,5 | Accesibilidad: labels, teclado, foco visible, contraste, no depender del color |
| 2,5 | Responsive verificado en 375 / 768 / 1366 / 1920×1080 |
| 2,5 | Rendimiento: lazy de imágenes, p95 de búsqueda, sin consultas N+1 |
| 2,5 | Estados vacíos, de carga y de error en todas las pantallas |
| 2,5 | Onboarding: crear una sesión en menos de 2 minutos (`SPEC.md` §2) |
| 2,5 | E2E crítico completo + piloto real con 20 usuarios |

### 9.2 Criterio de salida

- [ ] Los 15 criterios de aceptación del `SPEC.md` §33 pasan uno por uno, verificados
- [ ] El E2E crítico pasa de principio a fin: login → sesión → invitado → petición → reproducir →
      terminar → score → ranking
- [ ] Una persona que nunca vio el producto inicia una noche de karaoke en < 2 minutos, sin ayuda
- [ ] Accesibilidad básica verificada con teclado y lector de pantalla
- [ ] Responsive correcto en los cuatro anchos objetivo
- [ ] Todos los enlaces legales presentes y funcionando (TdU de YouTube, privacidad, FAQ)
- [ ] El aviso de scoring recreativo es visible desde la pantalla de resultado
- [ ] 20 usuarios reales, 10 sesiones completas, > 5 canciones por sesión
- [ ] ≥ 30 % de los usuarios repiten una segunda sesión
- [ ] Cero incidencias críticas de seguridad abiertas

### 9.3 Validación del producto (`SPEC.md` §38)

| Indicador | Objetivo | Cómo se mide |
|---|---|---|
| Usuarios reales | 20 | `profiles` con al menos una sesión |
| Sesiones completas | 10 | `karaoke_sessions` en estado `finished` |
| Canciones por sesión | > 5 | `queue_items` con `status = 'completed'` por sesión |
| Operación sin asistencia | Todos | Observación directa en el piloto |
| Repetición | ≥ 30 % | Usuarios con ≥ 2 sesiones |
| Interés en pagar | Cualitativo | Entrevistas, no métricas |

**No se construye nada de la Fase 8+ antes de validar estos indicadores** (`SPEC.md` §38).

---

## 10. Fuera de alcance del MVP

`SPEC.md` §31 es explícito. Se documenta aquí para que no reaparezca por inercia:

| Excluido | Motivo |
|---|---|
| Afinación real, pitch detection, notas correctas | Requiere referencia musical propia o autorizada. No se puede extraer audio de YouTube |
| Separación de voz, cambio de tonalidad, cambio de tempo | Requiere procesamiento de audio del que no disponemos legalmente |
| Descarga offline, reproducción sin YouTube | Viola los TdU de YouTube (ADR-0001) |
| App nativa | La PWA queda como evolución posible (`SPEC.md` §29) |
| Facturación automática | MVP con activación manual (ADR-0017) |
| Marketplace, chat, comentarios, grabación de voz | No aportan al flujo MVP (`CLAUDE.md` §47) |
| Recomendaciones con ML | Innecesario; el orden por popularidad y las búsquedas sin resultado cubren el caso |
| Multi-idioma de la interfaz | Español primero. El copy se centraliza para no cerrar la puerta |

---

## 11. Estrategia de pruebas por fase

| Fase | Unitarias | Integración | E2E | Seguridad | Especial |
|---|---|---|---|---|---|
| F1 | `norm_text` | Auth, sesión | Login | **pgTAP RLS completo** | Bundle sin secretos |
| F2 | Ranking de búsqueda | Alta de canción, cuota | Buscar y filtrar | RLS de catálogo | **30 días**, latencia de búsqueda |
| F3 | Reducer del show | Join, snapshot | QR → ingreso | RLS entre sesiones | Resiliencia de Realtime |
| F4 | Cálculo de `sort_key` | Concurrencia de cola | Flujo completo del show | RPC de cola | **Overlay, dimensiones, un solo player** |
| F5 | **Motor de scoring** | Idempotencia | `ended` → resultado → ranking | RLS de scores | **Distribución**, paridad SQL/TS |
| F6 | `LicenseService` | Límite de pantallas | Free vs. Home | RLS de licencias | TTL de seats |
| F7 | — | Reportes | **E2E crítico completo** | Auditoría | Accesibilidad, responsive |

Reglas transversales:
- **CI nunca llama a la API real de YouTube.** Se usan fixtures grabados.
- Toda fase termina con la suite completa verde: `typecheck`, `lint`, `test`, `pgTAP`, `build`.
- `CLAUDE.md` §43 (*Definition of Done*) aplica a cada tarea, no solo al final de la fase.

---

## 12. Señales de replanificación

| Señal | Respuesta |
|---|---|
| F0 concluye que no se puede cobrar con este modelo | Rediseñar la matriz de planes antes de F1, no después de F6 |
| La cuota de YouTube limita el catálogo por debajo de 300 canciones | Pivotar F2 a importación CSV de catálogo propio o licenciado |
| La señal vocal no aporta valor medible | Lanzar con telemetría, documentar la limitación y revisar la promesa de producto |
| El autoplay es inviable en la mayoría de Smart TV | El producto se posiciona para desktop HDMI + móvil; ajustar la landing y el marketing |
| Realtime no sostiene la latencia en redes de local | Evaluar Broadcast dedicado (ADR-0015) |
| Una fase se extiende más de un 50 % | Detener y reevaluar el alcance; no acumular deuda hacia F7 |
| El piloto no alcanza los indicadores de `SPEC.md` §38 | **No construir más.** Entrevistar a los usuarios y ajustar el producto |

---

## 13. Qué NO se hace en este roadmap

- No se empieza por el reproductor (`CLAUDE.md` §45).
- No se construye infraestructura que no resuelva un problema medido (ADR-0002).
- No se escribe código de producción antes de que la arquitectura esté aprobada y F0 cerrada.
- No se avanza de fase con criterios de salida incompletos.
- No se añade una funcionalidad que no esté en `SPEC.md` sin un ADR que lo justifique.
