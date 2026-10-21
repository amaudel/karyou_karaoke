# ADR-0017 — Activación manual de licencias con modelo de pagos agnóstico

- **Estado:** Propuesto
- **Fecha:** 2026-09-15
- **Decisores:** Arquitectura, Producto
- **Relacionado:** ADR-0011, ADR-0018, `docs/DATABASE.md` §5.2, `docs/ARCHITECTURE.md` §10

## Contexto

`SPEC.md` §7 permite que el MVP inicie con activación manual, y pide diseñar la arquitectura
preparada para Stripe, PayPhone, Mercado Pago y transferencia manual. `SPEC.md` §31 excluye la
facturación automática del MVP.

La tentación es no modelar pagos en absoluto: "el admin activa la licencia y listo". El problema
es que migrar de ahí a un proveedor real suele costar una reescritura, porque las decisiones que
se omiten son precisamente las difíciles:

- **Idempotencia de webhooks**: los proveedores reintentan. Sin una clave única por evento, una
  licencia se activa dos veces o se extiende por duplicado.
- **Estados de orden**: sin modelarlos, no hay forma de reconciliar un pago con una licencia ni de
  auditar un reembolso.
- **Reversibilidad**: un contracargo debe poder suspender una licencia. Si "lifetime" significa
  "irrevocable", no hay respuesta ante fraude.
- **Divergencia de moneda y proveedor**: PayPhone y Mercado Pago operan en monedas locales;
  Stripe, en dólares. Sin separar orden de licencia, cambiar de proveedor toca el modelo de
  autorización.

## Decisión

**El MVP activa licencias manualmente desde `/admin`, pero el modelo de datos y las interfaces se
diseñan agnósticos al proveedor desde el primer día.**

```text
plans ─→ plan_features          (matriz de entitlements, fuente de verdad)
   │
   └─→ licenses ─→ license_events      (auditoría de todo cambio de estado)
            │
            └─→ license_seats          (pantallas concurrentes, ADR-0011)

orders ─→ payment_events        (idempotencia por (provider, external_event_id) UNIQUE)
   │
   └─→ activate_license_from_order(order_id)   [RPC transaccional]
          ├─ crea o extiende la licencia
          ├─ INSERT en license_events
          └─ INSERT en admin_audit_log
```

Interfaz de dominio (contrato normativo):

```ts
export interface PaymentProvider {
  readonly id: 'stripe' | 'payphone' | 'mercadopago' | 'manual';
  createCheckout(input: {
    userId: string; planCode: string; amountCents: number; currency: string;
    successUrl: string; cancelUrl: string;
  }): Promise<{ externalOrderId: string; redirectUrl: string }>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean>;
  parseEvent(rawBody: string): Promise<{
    externalEventId: string; externalOrderId: string;
    status: 'paid' | 'failed' | 'refunded' | 'cancelled'; amountCents: number; currency: string;
  }>;
}
```

Reglas obligatorias:

| # | Regla |
|---|---|
| 1 | El usuario **nunca** puede activar, extender ni modificar su licencia. Sin política de `INSERT`/`UPDATE` en `licenses` para `authenticated` |
| 2 | Toda activación pasa por RPC `SECURITY DEFINER` que verifica `app.is_admin()` o `service_role` |
| 3 | Todo cambio de licencia escribe en `license_events`: estado anterior, posterior, actor, motivo |
| 4 | Toda acción administrativa crítica escribe en `admin_audit_log` (`CLAUDE.md` §30) |
| 5 | Los webhooks son idempotentes por `UNIQUE (provider, external_event_id)`, no por lógica condicional |
| 6 | **"Lifetime" es revocable.** Existe el estado `suspended` y la suspensión por contracargo es una operación normal, no una excepción |
| 7 | `uq_licenses__one_active_per_user` garantiza resolución determinista de entitlements |
| 8 | Los entitlements se resuelven siempre en servidor. El cliente recibe una copia de solo lectura para la UI, que **no autoriza** nada |

Sobre la duración de "lifetime": se recomienda (decisión C4 pendiente) definirla como **la vida de
la línea de producto, con actualizaciones menores incluidas y versiones mayores aparte**, y con un
techo de pantallas concurrentes. Un lifetime sin techo convierte cada usuario en un costo
recurrente permanente sin ingreso asociado, y `SPEC.md` §35 ya advierte de este riesgo.

## Consecuencias

### Positivas

- **Activar un proveedor de pago es añadir un adaptador**, no rediseñar el modelo. El camino
  manual y el automático comparten `orders`, `payment_events` y `activate_license_from_order`.
- **La idempotencia de webhooks está resuelta por la base de datos.** Un reintento del proveedor
  no puede extender una licencia dos veces: la clave única lo impide.
- **Auditoría completa.** Cada activación, suspensión y cambio de plan tiene actor, fecha y estado
  anterior. Necesario para disputas de pago y para soporte.
- **El fraude tiene respuesta**: `suspended` es un estado de primera clase y la revocación es una
  operación normal.
- La activación manual del MVP no es deuda técnica: es una implementación de la misma interfaz.

### Negativas / costos asumidos

- **Trabajo en el MVP que no aporta valor visible al usuario.** Modelar `orders` y
  `payment_events` antes de tener un proveedor es trabajo que no se demuestra en la primera
  fiesta. Se justifica porque omitirlo cuesta más después.
- La activación manual **no escala**: cada venta requiere intervención humana. Es deliberado para
  validar el producto (los objetivos de `SPEC.md` §38 son 20 usuarios y 10 sesiones, no 1,000).
- Hay una ventana entre el pago y la activación manual (horas) que afecta la experiencia de
  compra. Mitigación: comunicación clara en la página de precios sobre cuándo se activa.
- **Punto legal abierto:** el derecho de retracto del consumidor y la política de reembolsos de
  una licencia "permanente" deben definirse antes de vender, no después de la primera queja.
- Las conversiones de moneda y los impuestos quedan fuera del MVP. Es aceptable mientras la
  activación sea manual, pero debe resolverse antes de automatizar.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| Activación manual sin modelar órdenes ni pagos | Migrar después obliga a reconstruir el historial de pagos, a reconciliar licencias ya emitidas y a rediseñar la tabla de licencias. Es el atajo que se paga tres veces |
| Integrar Stripe directamente en el MVP | Añade integración, pruebas, webhooks, manejo de errores y obligaciones de cumplimiento (PCI, KYC, facturación) antes de validar que alguien quiera pagar. Contradice `SPEC.md` §31 y `CLAUDE.md` §47 |
| Licencia ligada a la orden en lugar de ser una entidad propia | Una licencia puede nacer de una activación manual, de una orden o de una promoción; y una orden puede extender una licencia existente. Son entidades distintas con ciclos de vida distintos |
| Suscripción obligatoria desde el día uno | `SPEC.md` §34 incluye explícitamente planes de pago único y Founder Lifetime. Forzar suscripción contradice el modelo comercial propuesto |
| `lifetime` como no revocable por diseño | Deja al negocio sin respuesta ante contracargos y fraude. Es una decisión de producto que se toma una vez y no se puede deshacer |
| Resolver entitlements en el cliente con la licencia embebida en el token | El usuario podría editar el token o el estado local. Viola `CLAUDE.md` §14 y §25 |

## Verificación

| Control | Dónde |
|---|---|
| El usuario no puede activarse una licencia | `supabase/tests/02_rls_licenses_test.sql` |
| Solo hay una licencia activa por usuario | `uq_licenses__one_active_per_user` + test de concurrencia |
| Un webhook duplicado no extiende dos veces | Test de integración con el mismo `external_event_id` dos veces |
| Toda activación deja rastro | Test: `license_events` + `admin_audit_log` con una fila por activación |
| Suspensión revoca entitlements de inmediato | Test: licencia `suspended` → `canUseFeature` devuelve `false` en la siguiente petición |
| El cliente no autoriza nada | Test de contrato: una Server Action con entitlement falso en el cliente sigue siendo rechazada por el servidor |

**Señal de revisión:** cuando el volumen de ventas manuales supere lo que una persona puede
atender en un día, se implementa el primer `PaymentProvider` real. El modelo ya está preparado;
solo falta el adaptador.
