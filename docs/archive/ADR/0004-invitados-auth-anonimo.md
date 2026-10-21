# ADR-0004 — Invitados mediante Supabase Anonymous Auth

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Seguridad
- **Relacionado:** ADR-0003, `docs/ARCHITECTURE.md` §9, `docs/DATABASE.md` §6

## Contexto

`SPEC.md` §11 y §15 exigen que los invitados entren **sin cuenta**, solo con un nickname.
Al mismo tiempo, `CLAUDE.md` §25 exige validar toda mutación en backend y §26 exige RLS con
"invitados solo acceden a sesión activa mediante funciones controladas".

El invitado necesita: leer la cola, crear solicitudes, cancelar las suyas, ver el ranking.
Eso son operaciones de escritura con autorización por identidad. Pero un invitado sin cuenta
**no tiene** `auth.uid()`, y RLS se apoya en `auth.uid()`.

Las opciones reales:

1. **Supabase Anonymous Auth**: el invitado obtiene un usuario real (anónimo), con JWT y
   `auth.uid()`. RLS funciona sin ramas especiales.
2. **Token de invitado propio** validado en RPC `SECURITY DEFINER`: el token identifica al
   participante y todas las políticas se sustituyen por comprobaciones manuales.
3. **Acceso anónimo directo** a `queue_items` con políticas basadas en el token enviado en el
   cuerpo de la petición.

## Decisión

**Todo invitado se autentica con Supabase Anonymous Auth.** Obtiene un `auth.uid()` real y una
fila en `participants`. RLS se aplica de forma uniforme a registrados e invitados, sin
excepciones ni rutas alternativas.

Flujo de ingreso:

```text
QR → https://dominio/j/{token}
       │ Route Handler (servidor)
       ├─ 1. hash sha256(token ‖ INVITE_TOKEN_PEPPER) → busca session_invites
       ├─ 2. valida: no revocado, no vencido, sesión en estado active
       ├─ 3. crea (o reutiliza) usuario anónimo → signInAnonymously
       ├─ 4. INSERT en participants (nickname provisional o solicitado después)
       ├─ 5. emite cookie de sesión httpOnly (ADR-0016)
       └─ 6. redirect 302 → /room/{room_code}

Alternativa manual: /room/{code} → nickname → join_session_by_code (rate limit por IP)
```

Decisiones derivadas:

| # | Regla |
|---|---|
| 1 | La conversión de invitado a cuenta permanente usa `updateUser` de Supabase: **no hay migración de datos**, el `user_id` no cambia |
| 2 | Los usuarios anónimos se purgan a los 90 días sin actividad (`job_purge_anonymous_guests`) |
| 3 | Sin datos personales: solo `nickname` (máx. 24 caracteres) |
| 4 | El token de invitación se guarda **hasheado**; el token en claro nunca toca la base |
| 5 | El QR **no** contiene `user_id` ni `session_id` (`SPEC.md` §22) |

## Consecuencias

### Positivas

- **RLS se aplica igual a invitados y registrados.** No hay un segundo modelo de autorización
  que mantener, auditar y equivocar. Es la diferencia entre una política y dos.
- Las comprobaciones de `queue_items` ("solo cancelo lo mío") se expresan como
  `participant_id = app.current_participant_id(session_id)`: una línea, verificable con pgTAP.
- La conversión a cuenta permanente es gratis y es una palanca de conversión real: el invitado
  que se registra conserva historial y estadísticas.
- Sin sistema propio de tokens de sesión: menos superficie, menos criptografía propia.
- `auth.uid()` está disponible en todas las RPC sin inventar un contexto de identidad paralelo.

### Negativas / costos asumidos

- **Se crean usuarios anónimos en `auth.users`.** Crecen con cada fiesta. Requiere un job de
  purga y hay que vigilar los límites del plan de Supabase en eventos grandes.
- Hay que **habilitar** Anonymous Sign-ins en el proyecto de Supabase (no viene activado).
- Los usuarios anónimos son susceptibles a abuso automatizado (creación masiva).
  Mitigación: rate limit por IP en el canje de token y en `join_session_by_code`, y Turnstile
  únicamente si se mide abuso real.
- Un invitado que borra cookies pierde su identidad y aparece como participante nuevo. Es
  aceptable en el contexto de una fiesta; no se finge resolverlo con *fingerprinting*.
- Dependencia de una funcionalidad concreta de Supabase Auth.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Token de invitado propio + RPC `SECURITY DEFINER` para todo | Sustituye RLS por autorización manual en cada función. Es el doble de superficie de error y no se puede probar con pgTAP de forma genérica. Además hay que construir rotación, expiración y revocación de tokens a mano |
| Acceso anónimo directo con el token en el cuerpo de la petición | RLS no puede autorizar con un valor del cuerpo. Se acabaría con políticas permisivas para `anon`, que es exactamente el escenario de fuga entre sesiones |
| Cuenta obligatoria para todos | Contradice `SPEC.md` §11 y §15, y arruina la experiencia: nadie se registra para cantar en una fiesta |
| Cookie firmada propia (JWT emitido por nosotros) | Reimplementar lo que Supabase Auth ya ofrece, con la criptografía y la gestión de expiración a cargo nuestro. `CLAUDE.md` §12 lo desaconseja |
| Un solo "usuario de sesión" compartido para todos los invitados | Imposible distinguir quién pidió qué. Rompe la cola, el ranking y la cancelación de la propia solicitud |

## Verificación

| Control | Dónde |
|---|---|
| Invitado no puede leer `queue_items` de otra sesión | `supabase/tests/04_rls_queue_test.sql` |
| Invitado no puede cancelar un turno ajeno | Idem |
| `anon` (no autenticado) no puede ejecutar RPC de sesión | `supabase/tests/07_functions_privileges.sql` |
| El canje de token no filtra el token en la respuesta ni en logs | Revisión de código + test |
| Purga de anónimos inactivos | `job_purge_anonymous_guests` + test de integración |
| Rate limit del canje por IP | Test de integración |

**Señal de revisión:** si el conteo de usuarios anónimos empieza a tener impacto económico en
el plan de Supabase, o si el abuso automatizado supera lo que el rate limit contiene, se
reevalúa con Retención más agresiva o con un modelo de sesión efímera.
