# ADR-0018 — Planes que no cobran por reproducción + camino de salida de YouTube

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto, Legal
- **Relacionado:** ADR-0001, ADR-0005, ADR-0011, ADR-0017, `docs/YOUTUBE-INTEGRATION.md` §6.2

## Contexto

`SPEC.md` §6.2 define así el plan gratuito: *"sesiones limitadas, historial reducido, sin
personalización, máximo pequeño de participantes"*. Y §34 propone Free / Home Lifetime /
Founder Lifetime / Commercial.

Al verificar las [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
aparece una prohibición que atraviesa ese modelo de negocio (§III.F.3.a):

> *"API Clients must not charge users fees for watching content in an embedded YouTube player."*

Y a continuación (§III.F.3.b): no se puede exigir al usuario ninguna acción distinta de pulsar
play para ver o continuar viendo contenido, aunque se aclara que **la funcionalidad normal de la
aplicación —como registro o verificación de edad— sí está permitida**.

Leído con honestidad, el modelo actual tiene un problema serio: "sesiones limitadas" en el plan
gratuito puede interpretarse como **cobrar por poder reproducir**. Un modelo donde el escalón de
pago existe para *desbloquear la reproducción* es el escenario que esta política prohíbe.

A esto se suma un segundo problema, de naturaleza distinta pero igual de real: el tier Commercial
promete a bares y locales una solución de karaoke. Un establecimiento que reproduce música hace
**comunicación pública**, que requiere sus propias licencias musicales (en Ecuador, por ejemplo,
SAYCE para autores y SOPROFON para productores fonográficos). La licencia de software no lo cubre,
y `SPEC.md` §5.3 ya lo advierte. Combinado con las políticas de YouTube, el resultado es que el
tier Commercial **no debería venderse como solución llave en mano sobre YouTube**.

## Decisión

**Dos decisiones vinculadas.**

### 1. El muro de pago rodea funciones de software, nunca la reproducción

| Función | ¿Puede ser de pago? | Justificación |
|---|---|---|
| Reproducir un video en el player embebido | **No** | Prohibido por §III.F.3.a |
| Ver la cola, el ranking y el historial en vivo | **No** | Es parte del acto de reproducir |
| Interrumpir una actuación en curso con un upsell | **No** | Prohibido y destructivo para el producto |
| Cobrar por canción, por minuto o por reproducción | **No** | Es literalmente una tarifa por ver contenido |
| Marca y logo del local, nombre del evento | Sí | Función de software |
| Modo operador, reportes, historial de noches | Sí | Función de software |
| Pantallas concurrentes, participantes por sesión | Sí | Función de software |
| Retención extendida de historial | Sí | Función de software |
| Límite de **eventos organizados** | Zona gris | Solo si se comunica como capacidad del software y **nunca** interrumpe un show en curso |
| Exigir registro y nickname para unirse | Permitido | §III.F.3.b admite la funcionalidad normal de la aplicación (registro) |

Medidas de diseño obligatorias:

| # | Regla |
|---|---|
| 1 | El plan gratuito es **plenamente funcional para reproducir**. La diferencia entre planes nunca es "puedes o no puedes cantar" |
| 2 | Ningún entitlement se llama `canPlay`, `playbackLimit`, `songsPerSession` ni similar. Si aparece uno, es una señal de alarma en la revisión de código |
| 3 | Ninguna restricción de plan se evalúa durante la reproducción |
| 4 | La página de precios no menciona límites de reproducción, canciones ni minutos |
| 5 | Los entitlements nombran capacidades: `maxConcurrentScreens`, `customBranding`, `operatorMode`, `reports`, `historyRetentionDays` |
| 6 | Requiere **revisión legal antes de la primera venta** |

### 2. Camino de salida de YouTube: abstracción ahora, proveedores después

| Fase | Acción | Estado |
|---|---|---|
| Hoy | `VideoProvider` + `song_sources.provider` (ADR-0006) | Incluido en el diseño |
| Fase 4 | Adaptador de contenido licenciado (`kind: 'stream'`) | Si hay demanda comercial |
| Fase 4 | Contenido propio del local (`kind: 'file'`) | Cliente con su propio catálogo |
| Futuro | Catálogo multi-proveedor sin tocar `songs` | Ya normalizado |

El tier Commercial se posiciona como **software de gestión de la noche de karaoke** (cola,
turnos, participantes, ranking, reportes, marca) y **no** como "todo lo que necesitas para poner
música legalmente en tu bar".

## Consecuencias

### Positivas

- **Se elimina el riesgo existencial R1** (suspensión de la API key por cobrar por reproducción).
  Es el riesgo con mayor probabilidad e impacto de todo el análisis.
- El plan gratuito funcional mejora la adopción: el usuario valida el producto en su primera
  fiesta antes de pagar, que es exactamente el objetivo de validación de `SPEC.md` §38.
- La propuesta de valor del tier de pago se vuelve más honesta y más defendible: se cobra por
  organización, marca y operación de eventos, no por acceso al contenido.
- **El tier Commercial deja de necesitar letra pequeña.** Con contenido licenciado o propio, el
  software se vende sin ambigüedad legal.
- Preparar la abstracción hoy cuesta un `INSERT` y un adaptador.

### Negativas / costos asumidos

- **La conversión a pago se vuelve más difícil.** "Paga para quitar el límite de reproducciones"
  convierte mejor que "paga por reportes y marca". Es un costo comercial real y hay que
  compensarlo con funciones de pago que un anfitrión realmente quiera (operador, marca, pantallas,
  historial).
- **El tier Commercial tarda más en ser vendible.** Exige resolver el contenido (licenciado o
  propio) antes de dirigirse a bares.
- Hay que resistir la tentación, en cada decisión de producto futura, de introducir un límite de
  reproducción como palanca de conversión. Este ADR existe precisamente para hacer esa tentación
  explícita y detectable.
- La interpretación de §III.F.3.a es razonable pero no ha sido confirmada por Google. Por eso la
  revisión legal es un requisito bloqueante, no una recomendación.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Mantener "sesiones limitadas" en el plan gratuito | Es la lectura más directa de "cobrar por ver contenido". Riesgo de suspensión de la API key |
| Mantener el modelo y añadir un aviso legal | Un aviso no cambia lo que hace el producto. La política se evalúa sobre el comportamiento, no sobre el texto |
| Eliminar el plan gratuito y cobrar desde el inicio | Empeora el problema: toda reproducción quedaría detrás de un pago. Además arruina la validación con usuarios reales |
| Vender el tier Commercial sobre YouTube con una advertencia contractual | Se puede hacer, pero no se puede llamar "solución para bares". La advertencia es necesaria y no suficiente |
| Construir únicamente sobre contenido licenciado desde el inicio | Correcto a largo plazo, inviable en el MVP: requiere capital, negociación y un catálogo que aún no existe |
| Retirar YouTube y no lanzar el producto | Es una salida válida pero prematura. El camino de la abstracción permite empezar con YouTube y migrar sin reescribir |

## Verificación

| Control | Dónde |
|---|---|
| Ningún entitlement restringe la reproducción | Test que verifica que `plan_features` no contiene claves con `play`, `song`, `minute` |
| El plan gratuito puede reproducir una sesión completa | Test E2E: usuario `free` completa el flujo de `SPEC.md` §33 sin bloqueo de reproducción |
| Sin upsell durante la reproducción | Test E2E del flujo de show con licencia `free`: no aparece ningún modal ni interrupción |
| La página de precios no menciona límites de reproducción | Revisión de copy + lint de la lista negra |
| Revisión legal documentada antes de la primera venta | Checklist de release, bloqueante |
| Un proveedor nuevo no toca el dominio | Prueba de concepto de un `VideoProvider` de prueba que entrega `kind: 'file'` |

**Señal de revisión:** si Google confirma por escrito una interpretación más permisiva, se puede
reconsiderar. Mientras no haya confirmación, la lectura conservadora es la única defendible y
requiere validación legal explícita.
