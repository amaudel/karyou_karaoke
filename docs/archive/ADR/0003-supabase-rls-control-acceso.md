# ADR-0003 — Supabase + RLS como control de acceso principal

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Seguridad
- **Relacionado:** `docs/DATABASE.md` §6, ADR-0004, ADR-0008

## Contexto

`CLAUDE.md` §10 establece que RLS es obligatorio y §25 del `SPEC.md` lo lista como requisito.
El punto crítico: en Supabase, **el cliente del navegador habla directamente con PostgREST**.
La `anon key` es pública por diseño. Por lo tanto, cualquier tabla mal protegida es accesible
desde la consola del navegador de cualquier usuario, sin pasar por nuestro código.

Esto tiene una consecuencia que se subestima con frecuencia: **RLS no es una capa de defensa
adicional, es la única capa que existe entre un atacante y los datos.** Una Server Action
correctamente escrita no protege nada si la tabla subyacente es legible por `authenticated`.

## Decisión

**Supabase (PostgreSQL + Auth + Realtime + Storage) como backend, con RLS como control de
acceso principal y la lógica con invariantes en RPC `SECURITY DEFINER`.**

Cinco reglas operativas:

| # | Regla |
|---|---|
| 1 | `enable row level security` **y** `force row level security` en toda tabla de `public` |
| 2 | **Sin política = sin acceso.** Toda tabla nueva nace cerrada; se abren casos explícitos |
| 3 | Toda función `SECURITY DEFINER` lleva `set search_path = app, public, pg_temp` + `revoke execute ... from public, anon` + autorización explícita en el cuerpo |
| 4 | Los helpers de autorización viven en el esquema `app`, **no** en `public` (que está expuesto por PostgREST) |
| 5 | Una **suite pgTAP de RLS es obligatoria en CI**: caso "usuario A no lee datos de usuario B" por cada tabla con datos de usuario |

Detalles que se derivan y que son fáciles de equivocar:

- **RLS filtra filas, no columnas.** `role` y `status` de `profiles` se protegen con
  `grant update (display_name, country, locale)`, no con una política. Sin esto, un usuario se
  autoconcede `role = 'admin'`.
- **Las vistas necesitan `security_invoker = true`.** Sin esa opción, la vista se ejecuta con
  los permisos de su propietario y **puentea la RLS** de las tablas subyacentes.
- **Postgres concede `EXECUTE` a `PUBLIC` por defecto** en funciones nuevas. Toda función sin
  `revoke` explícito es una API pública no intencionada.
- El rol global se lee de `public.profiles`, **nunca** de un valor enviado por el cliente ni de
  un claim que el cliente pueda influir.

## Consecuencias

### Positivas

- La autorización se aplica en el mismo lugar donde están los datos: no hay ruta que la evada.
  Ni PostgREST, ni una Server Action con un bug, ni una consulta futura.
- El requisito de 30 días de YouTube se implementa como política RLS
  (ADR-0014): el cumplimiento no depende de que un job funcione.
- Los invariantes críticos (un score por turno, una licencia activa por usuario, un solo
  cliente de pantalla por sesión) se expresan como índices únicos y se cumplen **siempre**,
  incluso bajo concurrencia.
- La suite pgTAP convierte "creo que la política está bien" en una prueba ejecutable.

### Negativas / costos asumidos

- RLS es más difícil de razonar que un middleware. Añade una curva de aprendizaje real y
  exige disciplina en cada migración.
- Depurar una consulta que devuelve 0 filas "sin error" es confuso: la RLS no distingue entre
  "no existe" y "no tienes permiso". Se mitiga con logs de servidor y pruebas explícitas.
- Las políticas se evalúan en cada consulta: con políticas complejas y mal indexadas se puede
  degradar el rendimiento. Las funciones helper son `stable security definer` para poder
  cachearse por consulta.
- pgTAP obliga a mantener un conjunto de pruebas que hay que actualizar con cada tabla nueva.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| API propia (Next.js) con `service_role` en todas las consultas | Anula RLS: cualquier IDOR en un endpoint expone todo. Es el antipatrón más peligroso en Supabase y viola `CLAUDE.md` §11 |
| Base de datos sin RLS detrás de una API estrictamente controlada | Elimina la defensa en profundidad. Un solo endpoint mal escrito compromete todo | 
| Firebase / Firestore | Sin SQL, sin transacciones relacionales serias, sin RPC. La cola y la idempotencia del scoring necesitan transacciones reales |
| Postgres propio (Neon/RDS) + Auth.js | Más control, mucho más trabajo: Auth, Realtime y Storage se construyen a mano. No aporta valor en el MVP |
| Hasura / PostGraphile sobre Postgres | Añade una capa de autorización paralela que hay que mantener sincronizada con RLS |

## Verificación

| Control | Dónde |
|---|---|
| Suite pgTAP de RLS por tabla | `supabase/tests/01_rls_*.sql` |
| Ninguna función `security definer` sin `search_path` ni ejecutable por `anon` | `supabase/tests/07_functions_privileges.sql` (consulta en `docs/DATABASE.md` §13.3) |
| `force row level security` en todas las tablas | Consulta a `pg_class.relforcerowsecurity` |
| Vistas con `security_invoker` | `supabase/tests/08_rls_views_test.sql` |
| Revisión obligatoria de políticas nuevas | Plantilla de PR: "¿qué políticas RLS añade o modifica este cambio?" |

**Señal de revisión:** si el número de políticas por tabla crece hasta volverse inmanejable, o
si aparecen consultas con latencia atribuible a la evaluación de políticas, se evaluará
consolidar lógica en RPC `SECURITY DEFINER` (que ya es el camino para toda mutación) en lugar
de multiplicar políticas.
