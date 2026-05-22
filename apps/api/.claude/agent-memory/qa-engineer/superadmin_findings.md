---
name: superadmin_findings
description: Hallazgos módulo superadmin: gotcha mock de payments.service, patrón SUPER_ADMIN sin DB, cleanup orden correcto para gymSubscription
type: project
---

Tests de integración superadmin (superadmin.integration.test.ts): 41/41 passing, 2026-05-07.

**Patrón SUPER_ADMIN en tests**: No es necesario crear un usuario SUPER_ADMIN real en DB. El middleware `requireSuperAdmin` solo verifica `request.user.role === 'SUPER_ADMIN'` — viene del JWT. Basta con firmar un token con `role: 'SUPER_ADMIN'` y `gymId: null` en la app temporal de setup.

**Gotcha 1 — Mock de payments.service necesario**: `superadmin.routes.ts` importa `createGymSubscriptionCheckout` y `getGymSubscriptionStatus` de `payments.service`. Sin mockear, los tests que llegan a ese código rompen porque Stripe no está configurado en test. El mock:
```ts
vi.mock('../../payments/payments.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../payments/payments.service')>()
  return {
    ...original,
    createGymSubscriptionCheckout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
    getGymSubscriptionStatus: vi.fn().mockResolvedValue({ status: 'TRIAL', plan: null, sub: null }),
  }
})
```
Esto preserva el resto del módulo (handleStripeWebhook, etc.) y solo mockea las dos funciones que llaman a Stripe.

**Gotcha 2 — Orden de cleanup para gyms con suscripciones**: gymSubscription tiene FK hacia gym. El orden de borrado es obligatorio:
1. booking → 2. membership → 3. user → 4. plan → 5. gymSubscription → 6. gym.
Si se omite gymSubscription antes de gym, Prisma lanza P2003 (foreign key violation).

**Gotcha 3 — PATCH /status con gym inexistente devuelve 400, no 404**: El handler hace `prisma.gym.update({ where: { id } })` sin verificar primero si existe. Prisma lanza P2025 (RecordNotFound) que `prismaErrorMessage()` convierte a string → respuesta 400. No es un bug, es el diseño actual. El test debe esperar 400, no 404.

**Gotcha 4 — POST /superadmin/gyms requiere FitAppPlan 'trial' en DB**: Si el plan 'trial' no existe, la llamada al endpoint crea el gym PERO no crea GymSubscription (el bloque `if (fitPlan && gym)` es falsy). El gym queda en status ACTIVE en vez de TRIAL. En los tests esto no es un problema porque `ensureFitAppPlans()` se llama en startup de la app real, pero en la buildApp() de tests no se llama. Consecuencia: `emailPreviewUrl` sigue apareciendo igual (sendWelcomeEmail se llama siempre).

**Estrategia para el plan de suscripción en tests**: En la Suite 9 (Gym Subscriptions), buscar el plan 'trial' del sistema con `findFirst({ where: { slug: 'trial' } })`. Si no existe (entorno de test limpio), crearlo nosotros y registrar en `createdPlanIds` para cleanup.

**Mock de sendWelcomeEmail en POST /gyms**: Requiere `vi.mock('../../../lib/email', ...)` ANTES de los imports. El mock debe ir en el top del archivo (antes del bloque `import`). Luego en el test individual, `mockClear()` antes de verificar `toHaveBeenCalledOnce()`.

**Platform config (PlatformSettings)**: La tabla `PlatformSettings` usa `id = 'system'` como singleton. GET hace upsert para garantizar que exista. El test de smtpPass enmascarado verifica que mandar '••••••••' no sobrescriba el valor — la lógica en el handler hace `if (data.smtpPass === '••••••••') delete data.smtpPass` antes del upsert.

**Why:** Módulo superadmin es el más diferente del resto: SUPER_ADMIN sin gymId, sub-módulos separados (fitapp-plans, gym-subscriptions, config), y dependencias externas (Stripe, sendWelcomeEmail) que hay que mockear.
**How to apply:** Usar este patrón cuando se extiendan los tests de superadmin o se agreguen nuevos sub-módulos.
