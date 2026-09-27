---
name: payu_findings
description: PayU LATAM: checkout sin fetch externo, transactionState como string '4', firma callback incluye transactionState, 2 bugs de seguridad en callback (sin sign acepta sin verificar, userId cross-gym no validado)
type: project
---

# PayU LATAM — Hallazgos de testing (2026-05-07)

15 tests de integración, 15/15 passing. Suite: `payu.integration.test.ts`.

## Diferencia clave vs. otras pasarelas: checkout sin fetch externo

`createPayUCheckout` NO hace ninguna llamada HTTP a la API de PayU. Solo construye los parámetros del formulario y los devuelve al frontend. El frontend es quien hace el form POST hacia PayU.

Consecuencia: en los tests de checkout **no se necesita mock de fetch**. Los tests de checkout son puramente de validación local.

## Estructura del checkout

Retorna: `{ url, params, referenceCode }` donde:
- `url`: URL de PayU (sandbox o producción) a la que hacer el form POST
- `params`: objeto con todos los campos del formulario (merchantId, accountId, description, referenceCode, amount, currency, signature, test, buyerEmail, buyerFullName, confirmationUrl, responseUrl)
- `referenceCode`: string `${gymId.slice(0, 8)}-${Date.now()}`

Verificación de firma en tests:
```ts
const expectedSig = crypto.createHash('md5').update(`${apiKey}~${merchantId}~${referenceCode}~${amount}~${currency}`).digest('hex')
expect(params.signature).toBe(expectedSig)
```

`amount = (priceCents / 100).toFixed(2)` — siempre dos decimales.

## Callback: gymId/planId/userId vienen en QUERY STRING, no en body

Diferencia importante vs. Khipu/Flow donde van en el body:

```ts
// Ruta en payments.routes.ts:
const { gymId, planId, userId } = request.query as any
```

En tests con `fastify.inject()`:
```ts
url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`
```

## Firma del callback

La firma del CALLBACK incluye `transactionState` (la del checkout no):
```
MD5(apiKey~merchantId~referenceCode~TX_VALUE~currency~transactionState)
```

Nota: `TX_VALUE` (no `amount`) es el campo del body de PayU para el valor del pago.

## transactionState es STRING '4', no número 4

```ts
// En handlePayUCallback:
if (transactionState !== '4') throw new Error(...)
```

En los tests siempre usar `transactionState: '4'` (string), nunca el número 4.

## Bug de seguridad #1: campo sign opcional

`handlePayUCallback` solo verifica la firma SI el campo `sign` está presente en el body:
```ts
if (sign && sign.toLowerCase() !== expected.toLowerCase()) {
  throw new Error('Firma PayU inválida')
}
```

Si `sign` está ausente, el callback es aceptado sin verificar. Un atacante puede activar membresías simplemente omitiendo el campo.

**Fix esperado**: rechazar con 400 si `sign` no está presente. Assignee: backend-dev.

## Bug de seguridad #2: userId cross-gym no validado

`handlePayUCallback` NO llama `getUser(userId, gymId)`. Solo llama `getGym(gymId)` y `gatewayConfig(gym, 'payu')`. Un atacante puede enviar un callback con `userId` de otro gym y se crea una membresía cross-gym.

**Fix esperado**: añadir `await getUser(userId, gymId)` al inicio del handler. Assignee: backend-dev.

## Patrón idempotencia PayU

Igual que todas las pasarelas: busca `paymentNotes: payu:{referenceCode}` antes de crear.

## Config del gym para tests

```json
{
  "payu": {
    "enabled": true,
    "merchantId": "test_merchant_payu",
    "apiKey": "test_api_key_payu",
    "accountId": "test_account_payu",
    "sandbox": true
  }
}
```

## Why: estos hallazgos son no-triviales para tests futuros.
**Why:** El patrón de checkout sin fetch externo es único entre las pasarelas — todas las demás (Flow, Khipu, MP, Fintoc) hacen fetch. Los 2 bugs de seguridad del callback siguen el mismo patrón que Flow (userId cross-gym) y añaden un nuevo patrón (sign opcional).

**How to apply:** Al escribir tests para pasarelas similares a PayU (formulario redirect), recordar que no se necesita mock de fetch. Los tests de callback siempre deben verificar tanto el caso con sign omitido (bug) como con gymId cruzado (bug).
