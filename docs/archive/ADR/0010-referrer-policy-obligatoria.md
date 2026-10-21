# ADR-0010 — `Referrer-Policy: strict-origin-when-cross-origin` obligatoria

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Seguridad, Cumplimiento
- **Relacionado:** ADR-0001, `docs/YOUTUBE-INTEGRATION.md` §5.3

## Contexto

La mayoría de los checklists de seguridad web recomiendan `Referrer-Policy: no-referrer` o
`same-origin` como endurecimiento por defecto: evita filtrar URLs internas a terceros. Es una
recomendación sensata en general.

En una integración con el reproductor embebido de YouTube, es exactamente lo contrario de lo que
hay que hacer. De [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality):

> *"API Clients that use the YouTube embedded player (including the YouTube IFrame Player API)
> must provide identification through the `HTTP Referer` request header. In some environments,
> the browser will automatically set `HTTP Referer`, and API Clients need only ensure they are
> not setting the `Referrer-Policy` in a way that suppresses the `Referer` value. YouTube
> recommends using `strict-origin-when-cross-origin` Referrer-Policy."*

Suprimir el `Referer` deja al reproductor sin identificación del cliente. La consecuencia
práctica es el error **153** y el deterioro de la funcionalidad del embed. Y el fallo es
engañoso: se manifiesta como "video no reproducible" y lleva a diagnosticar el catálogo en lugar
de las cabeceras.

Riesgo adicional: `Referrer-Policy: no-referrer` es una de las cabeceras que un asesor de
seguridad externo propondrá en una auditoría, sin conocer esta dependencia. Sin un ADR, la
regresión llegará por buena intención.

## Decisión

**`Referrer-Policy: strict-origin-when-cross-origin` es obligatoria y no negociable. Prohibido
`no-referrer`, `same-origin` y `origin-when-cross-origin` reducido, así como el atributo
`noreferrer`.**

```text
# Cabeceras obligatorias (next.config.ts)
Referrer-Policy: strict-origin-when-cross-origin
```

Reglas derivadas:

| # | Regla |
|---|---|
| 1 | El `iframe` se crea con el parámetro `origin` = origen de la aplicación |
| 2 | Prohibido `window.open(..., 'noreferrer')` para cualquier elemento relacionado con el reproductor |
| 3 | `Cross-Origin-Opener-Policy: same-origin-allow-popups` (no `same-origin`, que rompería ventanas del reproductor) |
| 4 | Prohibido cualquier `<meta name="referrer" content="no-referrer">` |
| 5 | Prohibido `rel="noreferrer"` en enlaces que conduzcan a la reproducción |
| 6 | El error 153 genera **alerta inmediata**, porque indica que la identificación se rompió |

## Consecuencias

### Positivas

- El reproductor funciona correctamente en todos los navegadores y dispositivos.
- La política recomendada por el propio YouTube es también compatible con la privacidad:
  `strict-origin-when-cross-origin` envía el origen (no la ruta) a terceros, y solo lo omite en
  bajadas de HTTPS a HTTP. No expone URLs internas ni parámetros de sesión.
- Un ADR explícito evita que una auditoría de seguridad futura introduzca la regresión.
- Se añade una prueba automática, con lo que la regresión requiere modificar un test.

### Negativas / costos asumidos

- **Se envía el origen a dominios de terceros** (incluido YouTube) en las peticiones salientes.
  Es exactamente lo que la integración requiere, y se divulga en la política de privacidad
  (requisito C-05 de `docs/YOUTUBE-INTEGRATION.md`).
- Contradice la recomendación genérica de `no-referrer`. Hay que documentarlo para que no se
  "corrija" en una revisión futura.
- En el caso de `window.open`, las URLs con identificadores de sesión no deben usarse: el
  origen se filtra, y por eso las rutas de la aplicación no llevan tokens sensibles en el
  *path* (el QR usa `/j/{token}` de un solo propósito y vida corta, jamás el token de sesión).

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| `no-referrer` (endurecimiento máximo) | Rompe la identificación del cliente ante YouTube: error 153 y degradación del embed. Incumple las RMF |
| `same-origin` | Equivale a `no-referrer` para peticiones cross-origin: mismo problema |
| `origin` | Enviaría solo el origen incluso en navegación same-origin, quitando información útil para nuestras propias analíticas sin beneficio adicional respecto a la recomendada |
| `unsafe-url` | Enviaría la URL completa con rutas y parámetros a terceros. Peor privacidad sin beneficio |
| No enviar la cabecera y confiar en el comportamiento por defecto del navegador | Es frágil: el valor por defecto depende del navegador y de la versión. Debe ser explícito y probado |

## Verificación

| Control | Dónde |
|---|---|
| La cabecera toma el valor correcto | `tests/e2e/security-headers.spec.ts` |
| No existe `noreferrer` ni `no-referrer` en el código | Regla de lint + grep en CI |
| El reproductor no produce error 153 | Alerta de Sentry; objetivo: 0 |
| El `iframe` recibe el parámetro `origin` | Test unitario del adaptador |

**Señal de revisión:** si YouTube publica un mecanismo alternativo de identificación que no
dependa del `Referer`, se reevalúa. Hasta entonces, esta cabecera es un requisito funcional
disfrazado de cabecera de seguridad, y debe tratarse como tal.
