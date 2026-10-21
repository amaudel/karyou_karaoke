# ADR-0011 — Límite de licencia por pantallas concurrentes, no por dispositivos

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto
- **Relacionado:** `docs/DATABASE.md` §5.1 y §5.2, `docs/ARCHITECTURE.md` §10.6

## Contexto

`SPEC.md` §6.4 pide: *"Cada licencia puede tener límite de dispositivos. Ejemplo: Home Lifetime:
2 dispositivos activos. Commercial: configurable. Implementar tabla de dispositivos registrados."*

En un producto web, "dispositivo" no tiene una definición estable:

- Un usuario puede entrar desde el navegador, desde una app, o desde una Smart TV.
- Las cookies se borran, el modo incógnito no persiste nada, y algunos navegadores de TV borran
  el almacenamiento al apagarse.
- El *fingerprinting* (user agent + canvas + fuentes + IP) es frágil: dos iPhone idénticos
  comparten huella y la misma persona cambia de huella al actualizar el navegador.
- Es una técnica invasiva que exige divulgación adicional en la política de privacidad y que
  bajo el RGPD/LOPDP requiere base legal explícita.

El resultado previsible de un límite por dispositivo es el peor escenario posible: usuarios
legítimos bloqueados (soporte) y usuarios que burlan el límite trivialmente (pérdida de ingreso).

Además, el activo que realmente se monetiza no es cuántos navegadores existen: es **cuántas
pantallas reproducen a la vez**. Una casa con 2 dispositivos registrados y 1 sola TV no consume
más recursos que una casa con 1 dispositivo. Y un bar con 3 pantallas sí.

## Decisión

**El límite de licencia se aplica sobre pantallas concurrentes, mediante `license_seats` con
latido y TTL, no sobre huellas de dispositivo.**

```sql
license_seats (
  id, license_id, session_id, client_id, kind,
  acquired_at, last_seen_at
)
unique (client_id)
-- TTL: un seat sin latido en 90 s se considera libre (barrido por job)
```

Reglas:

| # | Regla |
|---|---|
| 1 | Un "seat" se adquiere cuando un cliente de pantalla se empareja y emite latido |
| 2 | El seat se libera por **TTL de 90 s**, no por un evento de desconexión (que nunca llega de forma fiable) |
| 3 | Al superar `max_screens`, se rechaza con `SCREEN_LIMIT_REACHED` y un mensaje claro: *"Tu licencia permite N pantallas a la vez. Cierra una para continuar."* |
| 4 | `user_devices` se conserva como información de soporte (etiqueta, último uso). **No bloquea nada** |
| 5 | La cuenta ya autenticada nunca se bloquea por "dispositivo desconocido". Se permite cerrar sesiones remotas desde el perfil |
| 6 | Los límites por plan se expresan como entitlement (`maxConcurrentScreens`), nunca como condicional sobre el tipo de licencia |

## Consecuencias

### Positivas

- **Menos fricción y menos soporte.** El caso más común de bloqueo falso (cookies borradas, modo
  incógnito, TV que se reinicia) desaparece por diseño.
- **El límite se corresponde con el valor entregado.** Se cobra por uso concurrente real, no por
  un artefacto técnico difícil de medir.
- **Sin *fingerprinting*:** menos datos personales, menos obligaciones de privacidad, una
  política de privacidad más simple y más defendible.
- **El TTL resuelve la desconexión sucia** sin depender de eventos `beforeunload` o `unload`,
  que no son fiables en móviles ni en TV.
- El mensaje de límite es comprensible y accionable ("cierra una pantalla"), en lugar de
  "dispositivo no autorizado".

### Negativas / costos asumidos

- **Un usuario podría compartir su licencia** con otra casa si no se superan las pantallas
  concurrentes. Se acepta como riesgo comercial menor: la alternativa (fingerprinting) produce
  más daño en soporte y en privacidad del que evita en fraude.
- Requiere un latido periódico desde el cliente de pantalla (cada 30 s). Es tráfico mínimo, pero
  hay que implementarlo bien y contemplar el caso de pestaña en segundo plano.
- El TTL de 90 s implica que una pantalla que se apaga de golpe tarda hasta 90 s en liberar su
  seat. Aceptable.
- Se necesita un job de barrido y un panel de "pantallas activas" para soporte.
- Hay que definir `max_screens` por plan y explicarlo con claridad en la página de precios.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Fingerprinting de dispositivo (canvas, fuentes, UA, IP) | Frágil, invasivo, requiere base legal adicional y genera soporte. Bloquea usuarios legítimos y no detiene a quien quiere burlarlo |
| Cookie persistente con `device_id` firmado | El usuario la borra sin querer; el modo incógnito la ignora; los navegadores de TV la pierden al apagarse. Genera exactamente los tickets que se quieren evitar |
| Registro manual de dispositivos por el usuario | Fricción alta en el momento de menos paciencia (empezar la fiesta). El usuario no sabe qué "dispositivo" es su TV |
| Limitar por IP | Cambia con el NAT del móvil; toda una casa o un bar comparten IP. Inservible |
| Sin ningún límite | El plan Home y el Commercial se vuelven indistinguibles y se pierde la palanca de monetización principal que **sí** es compatible con las políticas de YouTube |
| Limitar el número de sesiones creadas al mes | Zona gris con la prohibición de cobrar por reproducción (ADR-0018). Se aplica con cuidado y nunca como límite de reproducciones |

## Verificación

| Control | Dónde |
|---|---|
| El seat se libera por TTL | Test de integración: cliente sin latido durante 91 s libera el seat |
| Se rechaza la pantalla N+1 | Test: `home_lifetime` con `max_screens=2` rechaza la tercera con `SCREEN_LIMIT_REACHED` |
| `user_devices` no influye en la autorización | Revisión de código: ninguna consulta de autorización toca esa tabla |
| Barrido de seats huérfanos | Job + test |
| Mensaje claro al superar el límite | Test de UI del mensaje |

**Señal de revisión:** si se mide abuso significativo de licencias compartidas (por ejemplo, una
misma licencia con patrones de uso geográficamente imposibles), se evalúan controles adicionales
—siempre con divulgación y base legal— antes de recurrir al *fingerprinting*.
