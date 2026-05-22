---
name: mach_findings
description: MACH Business: arquitectura external_id por prefix, Bearer token en webhook, idempotencia sin DB de intents, cross-gym via gymId prefix
type: project
---

# Hallazgos MACH Business — 16 tests, 16/16 passing (2026-05-07)

## Arquitectura de MACH Business

**Checkout** (`createMachCheckout`):
- Llama `https://biz.soymach.com/api/v1/payment-links` con `Authorization: Bearer <cfg.apiKey>`.
- `external_id` generado en el checkout: `${gymId.slice(0,8)}-${planId.slice(0,8)}-${userId.slice(0,8)}-${Date.now()}`. No hay tabla de intents en DB — la correlación es solo por prefix.
- Respuesta esperada de MACH: `{ payment_url, id }`. El servicio usa `data.payment_url || data.url`.
- Retorna `{ url, externalId, linkId }`.

**Webhook** (`handleMachWebhook` en `POST /payments/webhook/mach`):
- Sin auth JWT — es un webhook público.
- Firma: `Authorization: Bearer <webhookSecret>` comparado via `crypto.timingSafeEqual` con `cfg.webhookSecret`.
- El handler valida el token SOLO si `cfg.webhookSecret` existe. Si no hay secret configurado, no valida.
- Status válidos para activar: `PAID` o `COMPLETED`. Cualquier otro → `{ received: true }` early return (ANTES de validar el token).
- Lookup de gym por prefix: `prisma.gym.findFirst({ where: { id: { startsWith: gymPrefix } } })`. Si gym no existe → `{ received: true }`.
- Si gym existe pero `!cfg?.enabled || !cfg?.apiKey` → `{ received: true }`.
- Idempotencia: `prisma.membership.findFirst({ where: { paymentNotes: \`mach:\${payment_id}\` } })`. Si existe → `{ received: true, membershipId }`.
- Lookup de plan y user también por prefix del external_id. Si no encuentra → `{ received: true }`.

**Ruta** devuelve `result` directo desde `handleMachWebhook` (no hace `{ ok: true }` — distinto de Flow/Khipu que sí hacen `{ ok: true }`). La ruta retorna `result` que incluye `{ received: true }` o `{ received: true, membershipId }`.

## Gotchas de testing

**Cross-gym en webhook**: El servicio NO lanza error 4xx para cross-gym en webhook — simplemente retorna `{ received: true }` si el gym prefix del external_id no tiene MACH habilitado. Es diferente a Flow/Khipu que sí lanzan 400 en algunos casos.

**Status PENDING no valida el token**: handleMachWebhook hace `if (status !== 'PAID' && status !== 'COMPLETED') return { received: true }` ANTES de buscar el gym y validar el token. Esto significa que un payload con status PENDING nunca llega a la validación de firma, sin importar si el gym tiene webhookSecret configurado.

**Sin gymId explícito en body del webhook**: MACH no envía un campo `gymId` separado — el gymId se extrae del `external_id` por prefix. Para testear "sin gymId", el caso correcto es "external_id malformado" o "sin external_id".

**Lookup por prefix**: `prisma.gym.findFirst({ where: { id: { startsWith: gymPrefix } } })`. Si dos gyms tienen UUIDs que comparten los primeros 8 caracteres (extremadamente improbable con UUIDs v4), habría ambigüedad. En tests usar gymIds distintos.

**No mockear fetch en webhook**: `handleMachWebhook` no hace llamadas HTTP externas (a diferencia de Khipu/Flow que verifican el pago con una llamada GET). MACH confía en la firma del webhook directamente. No se necesita `vi.spyOn(global, 'fetch')` en los tests del webhook.

**amount en checkout**: MACH espera CLP entero: `Math.round(plan.priceCents / 100)`. Verificar que el body tiene `amount: 5000` para `priceCents: 500000`.

## Patrón de verificación de apiKey en checkout

```typescript
vi.spyOn(global, 'fetch').mockImplementationOnce(async (url, options) => {
  capturedUrl = url.toString()
  capturedOptions = options
  return { ok: true, json: async () => ({ payment_url: '...', id: '...' }) } as Response
})
// Luego: capturedOptions.headers['Authorization'] === `Bearer ${MACH_API_KEY}`
```

## 0 bugs encontrados

- La validación cross-gym del webhook es por diseño (no lanza error, devuelve received:true).
- No hay equivalente al bug de Flow (userId cross-gym) porque MACH resuelve user por prefix del external_id, que incluye el userId del gym correcto.

**Why:** MACH es la única pasarela donde la correlación gym/plan/user se hace 100% por prefix del external_id generado en el checkout, sin campos separados en el webhook body.

**How to apply:** Al escribir tests de MACH webhook, siempre construir el external_id con los prefixes reales de los objetos en DB. Para cross-gym, cambiar solo el gymPrefix del external_id. No mockear fetch en tests de webhook.
