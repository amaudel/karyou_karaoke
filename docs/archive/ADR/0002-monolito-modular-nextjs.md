# ADR-0002 — Monolito modular en Next.js con fronteras de capas verificadas

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura
- **Relacionado:** `docs/ARCHITECTURE.md` §1, §17, §18

## Contexto

El sistema tiene un solo dominio (karaoke social), siete agregados principales (identidad,
licencias, catálogo, sesión, cola, juego, operación) y un equipo pequeño. `CLAUDE.md` §47
prohíbe sobre-construir y §6 exige separar UI → Aplicación → Dominio → Repositorios → Proveedores.

Las opciones reales eran:

1. **Aplicación Next.js única** con carpetas por capa y reglas de importación.
2. **Monorepo con paquetes** (`apps/web`, `packages/domain`, `packages/scoring`, …).
3. **Servicios separados** (API + worker + realtime propio).

## Decisión

**Una sola aplicación Next.js (App Router) con capas explícitas dentro de `src/`, y fronteras
de importación verificadas automáticamente en CI.**

Estructura de capas:

```text
src/app/**        → rutas, RSC, Server Actions, Route Handlers   (transporte)
src/features/**   → casos de uso: orquestan dominio + puertos
src/domain/**     → TS puro: scoring, licencias, cola, invariantes
src/ports/**      → interfaces (contratos)
src/adapters/**   → Supabase, YouTube, fakes en memoria
```

Reglas de frontera, verificadas con `eslint-plugin-boundaries` **y** un test que escanea los
imports:

| Regla | Motivo |
|---|---|
| `src/domain/**` no puede importar `next/*`, `react`, `@supabase/*`, `node:*` ni usar `fetch` | El dominio debe ser testeable sin navegador, sin base de datos y sin red |
| `src/components/**` no puede importar `src/adapters/**` | La UI no habla con proveedores externos |
| Solo `src/features/*/application/**` orquesta dominio + puertos | Un único lugar donde viven los casos de uso |
| Nada importa desde `src/app/**` | Las rutas son hojas del grafo de dependencias |

## Consecuencias

### Positivas

- **El motor de scoring y las reglas de licencia se prueban en milisegundos** sin base de datos ni
  navegador. Es exactamente donde `CLAUDE.md` §38 pone la prioridad de tests.
- Un despliegue, una configuración, una versión. Sin contratos de red que mantener.
- Extraer un worker en la Fase 4 es mecánico, porque el dominio ya es puro y no conoce Supabase.
- Menos superficie para `CLAUDE.md` §47 ("no sobre-construir").

### Negativas / costos asumidos

- Las reglas de frontera **solo existen si se verifican**. Sin el lint y el test, el diseño se
  degrada en semanas y las capas se convierten en carpetas decorativas. Por eso son parte de la
  *Definition of Done*.
- Un único pipeline de CI: un test lento bloquea todo.
- El dominio podría tentarse a crecer; hay que vigilar que `src/domain/**` siga sin dependencias.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Monorepo con `packages/*` | Beneficio real solo si hay más de un consumidor (web + worker + móvil). Hoy hay uno. Se adopta cuando `apps/worker` exista (Fase 4); la migración será mecánica porque las fronteras ya están |
| Microservicios (API, scoring, realtime, catálogo) | Complejidad operativa sin problema que la justifique. Introduce saltos de red en el camino crítico `ended → score` |
| Un solo proyecto sin reglas de capas | Es la opción por defecto de facto; produce lógica de negocio en componentes React, que es exactamente lo que `CLAUDE.md` §6 y §18 prohíben |
| Deno Edge Functions para la lógica | Duplicaría el dominio en dos runtimes y duplicaría los tests |

## Verificación

| Control | Dónde |
|---|---|
| Reglas de importación | `eslint.config.mjs` con `eslint-plugin-boundaries` + `tests/unit/domain-purity.test.ts` |
| El dominio no usa `Math.random()` | Regla de lint `no-restricted-globals` salvo en `src/domain/scoring/entropy.ts` |
| El dominio no conoce YouTube | Test que busca `youtube` en imports de `src/domain/**` |
| Ningún componente importa adaptadores | Regla de boundaries |

**Señal de revisión:** si el dominio empieza a necesitar `await` de red de forma generalizada,
o si aparece un segundo consumidor real (worker, app nativa), se reabre la decisión hacia
monorepo.
