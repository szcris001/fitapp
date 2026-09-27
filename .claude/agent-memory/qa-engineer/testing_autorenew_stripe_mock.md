---
name: testing_autorenew_stripe_mock
description: Patrón correcto para mockear Stripe como constructor con vi.mock() en Vitest — y gotcha de activateMembership en auto-renovación
type: feedback
---

## Regla: mockear Stripe como constructor con vi.mock()

`vi.fn().mockImplementation(() => ({...}))` NO produce un constructor invocable con `new`.
Para que `new Stripe(key, opts)` funcione en el módulo bajo test, usar una función declarada:

```ts
vi.mock('stripe', () => {
  const mockPaymentIntentsCreate = vi.fn()

  function MockStripe(_key: string, _opts: unknown) {
    return {
      paymentIntents: { create: mockPaymentIntentsCreate },
      // ...
    }
  }
  ;(MockStripe as any).__mockPaymentIntentsCreate = mockPaymentIntentsCreate

  return { default: MockStripe }
})
```

Para acceder al mock en tests: `(Stripe as any).__mockPaymentIntentsCreate`

**Why:** `vi.fn()` con arrow function no produce una función constructora — `new` falla con "is not a constructor".
**How to apply:** Siempre que haya que mockear una clase de terceros (Stripe, etc.) que se instancia con `new` en el módulo bajo test.

---

## Hallazgo: activateMembership hace updateMany en TODAS las membresías del usuario

`activateMembership()` en `payments.service.ts` ejecuta:
```ts
await prisma.membership.updateMany({
  where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
  data: { status: 'INACTIVE' },
})
```

Esto pone TODAS las membresías ACTIVE/TRIAL del usuario en INACTIVE, no solo la que se está renovando.
Si un usuario tiene 2 membresías ACTIVE (raro pero posible), ambas quedan INACTIVE al crear la nueva.

**Why:** Diseño intencional — un usuario solo puede tener una membresía activa a la vez.
**How to apply:** En tests que crean múltiples membresías ACTIVE para el mismo usuario, no asumir que la no-renovada sigue ACTIVE después del job. Verificar solo que hubo 1 PaymentIntent (no 2).

---

## Patrón: runAutoRenewJob no es exportada — helper local en tests

`runAutoRenewJob` en `cron.ts` es privada. Para testearla, se duplica la lógica
en un helper dentro del test file. El helper debe mantenerse en sincronía con cron.ts.

Si cron.ts cambia el query o la lógica del for-loop, actualizar el helper en autorenew.integration.test.ts.

Alternativa futura: exportar `runAutoRenewJob` como named export y hacer barrel export desde cron.ts.

---

## Bug flaky detectado (2026-05-04): Caso 24 en ejecución paralela

Sintoma: `expected 'ACTIVE' to be 'INACTIVE'` en `reloadedM1.status` (Caso 24).
Causa: en ejecución paralela con otras suites, el `stripeMock.mockResolvedValueOnce`
para m1 es consumido por una membresía de un test previo del mismo describe que no limpió
correctamente. Cuando llega el job al m1 real, el mock ya no tiene resoluciones — lanza error
y la membresía no se renueva, quedando ACTIVE.

Síntoma secundario: `afterAll` lanza FK violation en `plan.deleteMany` si un test falla
y deja membresías de `extraUser2` sin limpiar (no estaban en `createdMembershipIds`).

**Why:** El cleanup en `afterEach` limpia `createdMembershipIds`, pero si el test falla antes
de agregar los IDs de las membresías intermedias, esas membresías quedan huérfanas.
**How to apply:** Al escribir tests de integración con mocks de Stripe, verificar que TODOS los
cleanup paths (happy path y failure path) limpien las membresías antes de que `afterEach` corra.
Siempre empujar IDs a `createdMembershipIds` ANTES de correr el job, no después.
Asignado a backend-dev para corregir el cleanup en autorenew.integration.test.ts.
