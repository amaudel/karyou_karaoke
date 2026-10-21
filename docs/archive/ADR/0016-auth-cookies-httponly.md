# ADR-0016 — Sesión en cookies httpOnly vía `@supabase/ssr`

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Seguridad
- **Relacionado:** ADR-0003, ADR-0004, `docs/ARCHITECTURE.md` §13

## Contexto

Supabase Auth necesita persistir la sesión en el cliente. La librería antigua
(`supabase-js` con `localStorage`) ofrece dos caminos, y la elección tiene consecuencias de
seguridad y de arquitectura:

1. **`localStorage`**: el token es accesible por JavaScript. Cualquier XSS exfiltra la sesión
  completa. Además, el servidor no puede leer la sesión, lo que impide renderizar en el servidor
  como usuario autenticado y obliga a resolver la autorización en el cliente.
2. **Cookies `httpOnly` gestionadas por `@supabase/ssr`**: el servidor puede leer la sesión en
  RSC, Server Actions y Route Handlers. El token no es accesible por JavaScript.

El segundo camino introduce una superficie nueva que hay que gestionar con cuidado:
con cookies, las peticiones cross-site llevan credenciales automáticamente, lo que abre la puerta
a CSRF en las mutaciones.

## Decisión

**La sesión vive en cookies `httpOnly`, `Secure` y `SameSite=Lax`, gestionadas por
`@supabase/ssr`. Prohibido `localStorage` para material de sesión.**

Reglas obligatorias:

| # | Regla |
|---|---|
| 1 | Cliente de navegador: `createBrowserClient` de `@supabase/ssr` |
| 2 | Cliente de servidor: `createServerClient` en RSC, Server Actions y Route Handlers |
| 3 | Middleware **solo** refresca la sesión. **No** autoriza: la autorización vive en RLS y en la capa de datos |
| 4 | `SameSite=Lax` + verificación explícita de `Origin`/`Sec-Fetch-Site` en toda Server Action y Route Handler que mute estado |
| 5 | Ninguna mutación por `GET`. Nunca |
| 6 | `SUPABASE_SERVICE_ROLE_KEY` solo en jobs y webhooks, con `import "server-only"`. El camino de usuario usa el cliente con RLS |
| 7 | Rutas protegidas verifican el rol **en el servidor** (RLS + `app.is_admin()`). Ocultar el botón no es protección |
| 8 | Prohibido `unstable_cache`, `revalidate` o cualquier caché sobre datos por usuario: la caché de Next.js es la causa más común de fuga de datos entre usuarios en este stack |

Riesgos específicos de Next.js App Router que hay que tratar explícitamente:

| Riesgo | Prevención |
|---|---|
| Una consulta autenticada cacheada y servida a otro usuario | `export const dynamic = 'force-dynamic'` en rutas autenticadas, o `noStore()`. Sin caché en datos por usuario |
| Middleware tratado como capa de autorización | El middleware solo refresca. Toda consulta pasa por RLS |
| Route Handler de cron accesible públicamente | `CRON_SECRET` verificado en cada invocación |
| Server Action invocada desde otro origen | Verificación de `Origin` + `SameSite=Lax` |

## Consecuencias

### Positivas

- **El token no es accesible por JavaScript.** Un XSS puede hacer daño dentro de la sesión, pero no
  puede exfiltrar el token para usarlo desde fuera y de forma persistente.
- **El servidor puede renderizar como el usuario.** RSC accede a la sesión sin un viaje extra al
  cliente, lo que simplifica todo el modelo de datos y elimina estados de carga.
- **Una sola fuente de verdad de autorización**: RLS. El cliente no "decide" si puede hacer algo,
  simplemente intenta y el servidor lo rechaza (ADR-0003).
- Los invitados anónimos (ADR-0004) obtienen el mismo tratamiento: su sesión anónima también está
  en una cookie `httpOnly`, sin lógica especial.

### Negativas / costos asumidos

- **Aparece CSRF** como superficie nueva. Mitigado con `SameSite=Lax`, verificación de `Origin` y
  la prohibición de mutaciones por `GET`. Es un costo real que hay que implementar, no solo
  declarar.
- **El refresco de tokens en middleware añade latencia** a las peticiones que necesita.
- El manejo de cookies en Next.js es sutil: `cookies()` es asíncrono en las versiones recientes, y
  escribir cookies desde un Server Component está prohibido. Hay que respetar el patrón oficial,
  no improvisarlo.
- Al no usar `localStorage`, la sesión no se comparte entre pestañas de forma automática en
  algunos escenarios. En la práctica las cookies se comparten, así que el efecto es menor, pero
  conviene verificarlo en el flujo de la TV.
- **Riesgo de caché mal configurada.** Es el único riesgo de esta decisión que puede causar una
  fuga real de datos entre usuarios si se ignora la regla 8.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| `localStorage` con `supabase-js` | Token accesible por JavaScript; imposible renderizar autenticado en el servidor; el middleware no puede leer la sesión. Es el camino que produce aplicaciones donde la autorización acaba viviendo en el cliente |
| Sesión en memoria (solo durante la pestaña) | El usuario tendría que autenticarse en cada recarga. Inaceptable para una TV encendida toda la noche |
| Sistema de sesiones propio con cookies firmadas | Reimplementar Supabase Auth. `CLAUDE.md` §12 lo prohíbe explícitamente |
| Sesión en `sessionStorage` | Igual que `localStorage` en cuanto a exposición a XSS, y encima no sobrevive a la reapertura de pestaña |
| `SameSite=Strict` | Rompería el retorno desde enlaces externos (QR, correo de recuperación): el usuario llegaría sin sesión. `Lax` es el equilibrio correcto, siempre que los métodos mutantes no sean `GET` |

## Verificación

| Control | Dónde |
|---|---|
| La cookie es `httpOnly`, `Secure`, `SameSite=Lax` | Test E2E que inspecciona las cabeceras `Set-Cookie` |
| Ningún material de sesión en `localStorage` | Test E2E que inspecciona el almacenamiento tras iniciar sesión |
| CSRF: una Server Action con `Origin` ajeno es rechazada | Test de integración con `Origin` malicioso |
| Ninguna mutación por `GET` | Revisión de código: `GET` handlers solo leen |
| No hay caché sobre datos por usuario | Regla de lint: `unstable_cache` prohibido; `dynamic = 'force-dynamic'` en rutas autenticadas |
| `/admin` protegido en servidor | Test: usuario no-admin recibe 404/403 aunque conozca la URL |
| `service_role` no aparece en el bundle del cliente | Test que busca la clave en los artefactos compilados |

**Señal de revisión:** si Next.js cambia el modelo de cookies o si `@supabase/ssr` introduce un
patrón distinto, se revisa. La decisión de fondo —**el token no debe ser accesible por JavaScript**
— no se revisa.
