---
name: khipu_findings
description: Hallazgos al testear Khipu Chile (checkout + callback): bug khipuSign con secret=undefined, patrón firma Authorization header, gotcha enabled requerido en paymentGateways
type: project
---

# Khipu Chile — Hallazgos de testing (2026-05-06)

16 tests de integración, 16/16 passing. Suite: `khipu.integration.test.ts`.

## Bug encontrado: khipuSign lanza con secret=undefined

`handleKhipuCallback` valida la firma entrante solo `if (cfg.secret)` — correcto.
Pero luego llama `khipuSign('GET', url, '', cfg.secret)` incondicionalmente.
Cuando `cfg.secret` es `undefined`, `crypto.createHmac('sha256', undefined)` lanza TypeError en Node.

Consecuencia: gimnasios con Khipu habilitado pero sin campo `secret` en la config nunca pueden procesar callbacks.

**Fix esperado**: `const sig = khipuSign('GET', url, '', cfg.secret ?? '')`. Assignee: backend-dev.

**Por qué es importante**: el test 16 documenta el comportamiento actual (400) con el mensaje "[BUG]" en el nombre. Cuando el dev aplique el fix, ese test fallará — esa es la señal de que el fix está en su lugar. En ese momento actualizar la expectativa de 400 a 200.

## Gotcha: `enabled: true` siempre requerido en paymentGateways

`gatewayConfig(gym, 'khipu')` lanza "Pasarela khipu no configurada o deshabilitada" si no hay `enabled: true`.
La config del gym en los tests debe incluirlo explícitamente:

```json
{
  "khipu": {
    "enabled": true,
    "receiverId": "test_receiver_123",
    "secret": "test_secret_khipu",
    "sandbox": true
  }
}
```

Este gotcha aplicó antes en Flow (también requiere `enabled: true`). Patrón consistente en todas las pasarelas.

## Patrón de firma en checkout: capturar Authorization header

A diferencia de Flow (donde la firma va como campo `s` en el body form-urlencoded), Khipu usa el header `Authorization: {receiverId}:{firma}`.

Para verificar la firma en el test:

```ts
const sentHeaders = capturedOptions!.headers as Record<string, string>
const [sentReceiverId, sentSig] = sentHeaders['Authorization'].split(':')
expect(sentReceiverId).toBe(KHIPU_RECEIVER_ID)
const sentBody = capturedOptions!.body as string
const expectedSig = khipuSign('POST', 'https://khipu.com/api/2.0/payments', sentBody, KHIPU_SECRET)
expect(sentSig).toBe(expectedSig)
```

Usar `mockImplementationOnce` (no `mockResolvedValueOnce`) para capturar url y options.

## Patrón de firma en callback: rawBody vs JSON.stringify

`validateKhipuSignature` usa `rawBody` si está disponible, sino hace `Buffer.from(JSON.stringify(body))`.

En `fastify.inject()` el `rawBody` llega como el Buffer del JSON original del payload.
Pero en la ruta, antes de llamar `handleKhipuCallback`, se desestructura:
```ts
const { gymId, planId, userId, ...rest } = request.body as any
```

La firma se valida en `handleKhipuCallback` con el `rawBody` del request original (que incluye gymId, planId, userId, payment_id todos juntos). Por lo tanto la firma del helper de tests debe calcularse sobre el body completo original:

```ts
function makeKhipuCallbackSig(body: object, secret: string): string {
  const raw = JSON.stringify(body)
  return crypto.createHmac('sha256', secret).update(raw).digest('hex')
}

// body incluye gymId, planId, userId Y payment_id
const callbackBody = { gymId, planId, userId, payment_id: 'kh_xxx' }
const sig = makeKhipuCallbackSig(callbackBody, KHIPU_SECRET)
```

## Estructura de 3 gyms para Khipu

- Gym A: Khipu habilitado CON secret (para tests normales + firma)
- Gym B: sin pasarela (para tests gym sin config → 400)
- Gym C: Khipu habilitado SIN secret (para test bug khipuSign undefined)

Gym C requiere su propio plan y usuario — creados dentro del test 16 y limpiados al final del mismo test.

## Cleanup con gym C

El test 16 crea recursos extra (memberC, planC). Cleanup al final del propio test porque gymC no tiene users/plans en el `beforeAll`. El `afterAll` usa `deleteMany({ where: { gymId: { in: [gymAId, gymBId, gymCId] } } })` para capturar cualquier residuo si el test falla antes del cleanup local.

## Mapeo de errores 401 en rutas Khipu

La ruta `/payments/callback/khipu` mapea a 401 los errores cuyo `.message` incluye "inválida" o "Falta header":
- `validateKhipuSignature` lanza "Falta header x-khipu-signature" → 401
- `validateKhipuSignature` lanza "Firma Khipu inválida" → 401
- Todo lo demás → 400

Verificado en tests 11 y 12.

## Fix seguridad cross-gym userId (diferencia con Flow)

En Khipu, el fix ya fue aplicado antes de escribir los tests (según el enunciado):
`handleKhipuCallback` llama `await Promise.all([getGym(gymId), getUser(userId, gymId)])` al inicio.

En Flow el bug todavía existe (handleFlowCallback no tiene el `getUser` equivalente).

El test 15 de Khipu espera 400 cuando userId es de gymB (fix ya aplicado y funcionando).
