---
name: flow_chile_findings
description: Hallazgos al testear Flow Chile (checkout + callback): bug de seguridad cross-gym userId, patrón mock fetch para form-urlencoded, verificación firma HMAC-SHA256
type: project
---

# Flow Chile — Hallazgos de testing (2026-05-06)

16 tests de integración, 16/16 passing. Suite: `flow.integration.test.ts`.

## Bug de seguridad encontrado: callback no valida userId cross-gym

`handleFlowCallback` llama `getGym(gymId)` + `gatewayConfig()` + `getStatus` de Flow, pero NO llama a `getUser(userId, gymId)`.

Consecuencia: un atacante puede enviar un POST al callback con:
- `gymId`: gym con Flow configurado (gym A)
- `userId`: userId de un alumno de gym B
- `planId`: planId de gym A

Y si el pago getStatus devuelve `status: 2`, se creará una membresía en gym A asignada al alumno de gym B, sin que este haya pagado.

**Fix esperado**: añadir `await getUser(userId, gymId)` al inicio de `handleFlowCallback`, igual que existe en `createFlowCheckout`. Assignee: backend-dev.

**Patrón del test**: el caso "[BUG-SEC] userId cross-gym no es rechazado" documenta el comportamiento actual (status 200) para que cuando se arregle, el test falle como signal de que el fix está en su lugar, y entonces se actualice la expectativa a 400.

## Patrón: mock fetch para checkout form-urlencoded y captura de body

Flow recibe un POST con `Content-Type: application/x-www-form-urlencoded`. Para capturar el body enviado a Flow y verificar la firma:

```ts
let capturedOptions: RequestInit | undefined
vi.spyOn(global, 'fetch').mockImplementationOnce(async (url, options) => {
  capturedOptions = options
  return { ok: true, json: async () => ({ token: '...', flowOrder: 42 }) } as Response
})
// ... llamar al endpoint ...
const sentBody = new URLSearchParams(capturedOptions!.body as string)
const params: Record<string, string> = {}
sentBody.forEach((v, k) => { if (k !== 's') params[k] = v })
const keys = Object.keys(params).sort()
const str = keys.map(k => k + params[k]).join('')
const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(str).digest('hex')
expect(sentBody.get('s')).toBe(expectedSig)
```

Importante: usar `mockImplementationOnce` (no `mockResolvedValueOnce`) para capturar los argumentos de fetch.

## Diferencia checkout vs. callback

- **Checkout** (`/payments/checkout/flow`): requiere auth JWT, gymId viene del token. `createFlowCheckout` SÍ valida userId con `getUser(userId, gymId)`.
- **Callback** (`/payments/callback/flow`): SIN auth (redirect de Flow), todos los params vienen en el body (`token, gymId, planId, userId`). `handleFlowCallback` NO valida userId — este es el bug.

## Mock para callback getStatus

Flow getStatus es un GET con URLSearchParams. El mock de fetch aplica igual independientemente de si el fetch es GET o POST:

```ts
vi.spyOn(global, 'fetch').mockResolvedValueOnce({
  ok: true,
  json: async () => ({ status: 2, commerceOrder: '...', amount: 5000 }),
} as Response)
```

Para idempotencia (dos callbacks seguidos), usar `.mockResolvedValueOnce(...).mockResolvedValueOnce(...)` encadenado.

## afterEach en suite callback

El callback crea membresías reales en DB. Usar `createdMembershipIds` + `afterEach` con `deleteMany` para limpiar entre tests. Reset de `createdMembershipIds.length = 0` al final de cada `afterEach`.

## Código de error Flow

`createFlowCheckout` lanza `Error(\`Flow: ${data.message}\`)` cuando `data.code && data.code !== 0`. La ruta mapea ese error a 400. Test verifica `res.json().error` contiene "flow" (case-insensitive).

## Cleanup FK order para Flow

No hay tablas adicionales de Flow (a diferencia de Fintoc que tiene `FintocPaymentIntent`). Cleanup es simple:
1. `membership.deleteMany()`
2. `user.deleteMany()`
3. `plan.deleteMany()`
4. `gym.deleteMany()`
