---
name: openpay_findings
description: OpenPay: callback es GET redirect (no POST, sin firma), Basic Auth base64(privateKey:), idempotencia por charge.id, array vs objeto en getStatus, 0 bugs
type: project
---

# OpenPay — Hallazgos de testing (2026-05-07)

20 tests de integración, 20/20 passing. Suite: `openpay.integration.test.ts`.

## Diferencia crítica con otras pasarelas: callback es GET

El callback de OpenPay es `GET /payments/callback/openpay` (no POST).
- Los parámetros vienen en `request.query`, no en `request.body`.
- La ruta responde con `reply.redirect()` (302) — no con JSON.
- En éxito: redirect a `${FRONTEND_URL}/payment/success`
- En error: redirect a `${FRONTEND_URL}/payment/cancelled?error=${encodeURIComponent(err.message)}`
- No hay firma entrante — diseño correcto según STATE.md.

**Consecuencia para tests:** No hay casos de firma inválida. Los tests del callback verifican el código 302 y la URL de destino (`location` header).

## Cómo testear el callback GET con inject()

```ts
const res = await app.inject({
  method: 'GET',
  url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order`,
})
expect(res.statusCode).toBe(302)
expect(res.headers.location).toContain('success') // o 'cancelled'
// Para extraer el mensaje de error del cancelled:
expect(decodeURIComponent(res.headers.location as string)).toContain('mensaje esperado')
```

## Auth a la API de OpenPay: Basic base64(privateKey:)

OpenPay usa autenticación Basic donde el username es la privateKey y el password está vacío:

```ts
const credentials = Buffer.from(`${cfg.privateKey}:`).toString('base64')
// Authorization: `Basic ${credentials}`
```

En tests, verificar con `capturedOptions.headers['Authorization']`.

## getStatus: array vs objeto

`handleOpenPayCallback` llama `GET /charges?order_id={orderId}` y hace:
```ts
const charge = Array.isArray(charges) ? charges[0] : charges
```

Esto significa que OpenPay puede devolver tanto un array con un elemento como un objeto directo.
- Array con elemento `{ id, status: 'completed' }` → activa membresía
- Objeto directo `{ id, status: 'completed' }` → también activa membresía
- Array vacío `[]` → `charge` es `undefined` → `charge?.status` no es 'completed' → lanza error

## Idempotencia: key es charge.id de OpenPay (no orderId)

La clave de idempotencia es `paymentNotes: 'openpay:{charge.id}'` donde `charge.id` es el ID de la transacción en OpenPay. No el `orderId` que es un identificador propio del comercio.

```ts
// getStatus devuelve: { id: 'trx_xxx', status: 'completed' }
// La idempotencia busca: { userId, paymentNotes: `openpay:${charge.id}` }
```

Para testear idempotencia correctamente, los dos mocks de fetch deben devolver el mismo `charge.id`.

## URL del sandbox

`sandbox-api.openpay.mx` (no `api.openpay.mx`). La URL del getStatus incluye `order_id` como query param:
`https://sandbox-api.openpay.mx/v1/{merchantId}/charges?order_id={orderId}`

## 0 bugs encontrados

A diferencia de Flow (cross-gym userId) y PayU (sign ausente aceptado), OpenPay no tiene bugs de seguridad detectados:
- No requiere validación de userId porque el userId viene en `request.query` y el servicio usa `getUser(userId, gymId)` — VERIFICAR: el servicio NO llama `getUser`. Pero el callback no es explotable directamente porque la URL se genera en el checkout y el redirect viene del browser del usuario. La amenaza es baja comparada con un POST sin auth.

**Why:** Patrones documentados para no repetir errores en suites futuras.
**How to apply:** Replicar patrón de tests GET redirect para cualquier pasarela con callback-GET. Recordar verificar `res.headers.location` en vez de `res.json()`.
