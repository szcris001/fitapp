---
name: fintoc_pay_findings
description: Hallazgos al testear Fintoc Pay by Bank (3 endpoints): gotcha Prisma client no regenerado, patrón mock fetch con vi.spyOn, firma HMAC siempre requerida en webhook
type: project
---

# Fintoc Pay by Bank — Hallazgos de testing (2026-05-06)

19 tests de integración, 19/19 passing. Suite: `fintoc-pay.integration.test.ts`.

## Gotcha crítico: Prisma client debe regenerarse tras migración

`prisma.fintocPaymentIntent` era `undefined` al correr los tests porque el cliente generado en `src/generated/prisma/` no incluía el modelo nuevo.
El service usa `(prisma as any).fintocPaymentIntent` para sortear el tipado — en runtime funciona, pero en tests también necesita el cliente regenerado.

**Fix**: correr `pnpm prisma generate` desde `apps/api/` después de cada migración que añade modelos nuevos. Verificar con:
```
grep -i "fintocpayment" apps/api/src/generated/prisma/index.d.ts
```

**How to apply**: Si un test falla con `Cannot read properties of undefined (reading 'create')` en un model Prisma, lo primero es regenerar el cliente, no buscar el bug en el test.

## Patrón mock fetch para servicios que llaman APIs externas

El checkout llama `fetch` hacia `https://api.fintoc.com/v1/payment_intents`. Patrón validado:

```ts
beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'fi_test_xyz', widget_url: 'https://widget.fintoc.com/...' }),
  } as Response)
})
afterEach(() => { vi.restoreAllMocks() })
```

Gotcha: `vi.restoreAllMocks()` en `afterEach` del `describe` de checkout no afecta a tests de otras suites. Cada suite tiene sus propios `beforeEach/afterEach`.

Para el test de "Fintoc API falla 500", hacer `vi.restoreAllMocks()` primero y luego re-mockear con `ok: false`:
```ts
vi.restoreAllMocks()
vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, text: async () => 'Error' } as Response)
```

## Comportamiento del webhook: firma SIEMPRE requerida

`handleFintocPayWebhook` lanza "Firma inválida" si NO hay header `fintoc-signature`. Esto es diferente al webhook de Fintoc conciliación (donde sin firma pasa en modo sin-secret).

La ruta mapea errores que contienen "Firma inválida" o "firma" (case-insensitive match en el código) a **401**, el resto a **400**. Verificado:
- Sin header → 401
- Header con valor incorrecto → 401
- Body sin gymId en metadata → 400

## Idempotencia del webhook por status check, no por paymentNotes

La idempotencia en `payment_intent.succeeded` se hace verificando `intent.status === 'SUCCEEDED'` antes de activar. Si el intent ya está en SUCCEEDED, devuelve `{ received: true }` sin crear otra membresía.

Diferente al patrón de Stripe/Khipu que usa `paymentNotes: 'stripe:{id}'` como campo de idempotencia en Membership. Aquí el campo `paymentNotes` en Membership se usa para verificar manualmente pero no es el mecanismo primario.

## Gotcha UUID válido vs. plan que no existe

`z.string().uuid()` en Zod requiere formato UUID v4 real. El UUID `00000000-0000-0000-0000-000000000099` falla validación (12 chars en último segmento con un valor no válido). Usar `00000000-0000-0000-0000-000000000000` (todos ceros) que sí pasa uuid() pero obviamente no existe en DB.

## Cleanup FK order para FintocPaymentIntent

Orden correcto de cleanup (FK):
1. `fintocPaymentIntent.deleteMany()` (referencia a gymId)
2. `membership.deleteMany()`
3. `user.deleteMany()`
4. `plan.deleteMany()`
5. `gym.deleteMany()`

`FintocPaymentIntent` NO tiene FK a `membership` en el schema actual (membershipId es solo un campo String, no una relación FK), entonces su cleanup puede ir antes o después de memberships.

## Configuración del gym para fintocPayments

```json
{
  "fintocPayments": {
    "enabled": true,
    "secretKey": "sk_test_fintoc_123",
    "webhookSecret": "whsec_fintoc_pay_test",
    "currency": "CLP"
  }
}
```

El gym que NO tenga `fintocPayments.enabled = true` recibirá "Pasarela fintocPayments no configurada o deshabilitada" (lanzado por `gatewayConfig()`).

El webhook valida contra `gym.paymentGateways.fintocPayments.webhookSecret`. Si el gym no tiene este campo → lanza "webhookSecret de Fintoc Payments no configurado" → 400.
