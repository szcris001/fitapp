---
name: mercadopago_findings
description: Mercado Pago checkout + webhook IPN: arquitectura especial multi-gym, idempotencia por paymentNotes, ruta devuelve {ok:true} ignorando return del service, firma global vs per-gym
type: project
---

# Mercado Pago — Hallazgos de testing (2026-05-07)

16 tests de integración, 16/16 passing. Suite: `mercadopago.integration.test.ts`.

## Arquitectura especial del webhook: itera TODOS los gyms

`handleMercadoPagoWebhook` no sabe a qué gym pertenece el pago al recibirlo. Itera todos los gyms con `paymentGateways not {}` buscando uno con `mercadopago.enabled = true`. Para cada gym habilitado llama `GET /v1/payments/{paymentId}` con su accessToken. Si la respuesta tiene `status: 'approved'` y `external_reference` del formato `gymId|planId|userId` donde `gymId === gym.id`, activa la membresía.

Consecuencia para tests: un gym con MP habilitado en la DB hará que el webhook intente llamar a la API de MP. El mock de `fetch` debe estar activo ANTES de que el webhook itere el gym. Si hay múltiples gyms con MP habilitado, el mock puede ser consumido por el gym incorrecto — usar slugs únicos de test y limpiar bien entre corridas.

## La ruta ignora el return value del service

La ruta de webhook (`/payments/webhook/mercadopago`) ignora el valor de retorno del service y siempre devuelve `{ ok: true }`:

```ts
await handleMercadoPagoWebhook(request.body, xSignature, xRequestId)
return reply.send({ ok: true })
```

El service retorna `{ received: true, membershipId }` pero ese valor se pierde. Los tests de éxito NO pueden verificar `membershipId` desde la respuesta HTTP — deben consultarlo directamente en DB.

**Diferencia con Flow/Khipu**: esos también devuelven `{ ok: true }` desde la ruta, pero el service de Flow/Khipu no devuelve `membershipId`. En MP el service SÍ lo devuelve pero la ruta lo descarta. Coherente con el patrón general del proyecto.

## Dos niveles de firma: global vs per-gym

La validación de firma tiene dos caminos:

1. **Global** (`process.env.MERCADOPAGO_WEBHOOK_SECRET`): si está seteado, valida en la ruta ANTES de llamar al service. Si no hay `x-signature`, la ruta devuelve 401 directamente. Si hay `x-signature` con firma inválida, el service lanza y la ruta lo captura → 401.

2. **Per-gym** (`cfg.webhookSecret`): si no hay secret global pero el gym tiene `webhookSecret`, el service valida la firma por gym. Si la firma no coincide, ese gym se salta con `continue` (no rechaza globalmente).

Para el test de firma inválida (caso 15), setear `process.env.MERCADOPAGO_WEBHOOK_SECRET` en el test y limpiarlo en `afterEach`. Usé `delete process.env.MERCADOPAGO_WEBHOOK_SECRET` en `beforeAll` del suite para asegurar estado limpio.

## Idempotencia por paymentNotes mp:{paymentId}

El service busca `prisma.membership.findFirst({ where: { userId, paymentNotes: 'mp:{paymentId}' } })`. Si existe, retorna `{ received: true }` sin crear otra membresía. Para el test de idempotencia: el segundo webhook con la misma paymentId necesita que el fetch de `GET /v1/payments/{paymentId}` sea mockeado otra vez (ya que la primera llamada consumió el primer mock). Usé `vi.spyOn` encadenado con dos `mockResolvedValueOnce` pero en dos bloques separados (un `vi.spyOn` nuevo después del primero porque `vi.restoreAllMocks()` está en `afterEach`).

## mock de fetch para el checkout: captura del body JSON

MP recibe un POST con `Content-Type: application/json`. Para verificar el `external_reference`:

```ts
let capturedBody: any
vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, options) => {
  capturedBody = JSON.parse(options?.body as string)
  return { ok: true, json: async () => ({ init_point: '...', id: 'pref_test' }) } as Response
})
```

Diferente a Flow que usa `form-urlencoded` y necesita `new URLSearchParams(body)`.

## action 'payment.updated' también debe activar

`handleMercadoPagoWebhook` acepta tanto `payment.created` como `payment.updated`. Ambos siguen el mismo flujo de activación. Se agregó un test bonus para `payment.updated` (caso 16) que verifica que también crea membresía.

## 0 bugs encontrados

A diferencia de Flow (bug cross-gym userId) y Khipu (bug secret=undefined), MP no presentó bugs en los casos testados. El service valida `gymId !== gym.id` en la comprobación de `external_reference`, lo que implícitamente protege contra un gym que recibe el webhook y procesa un pago de otro gym.

## Cleanup FK order para MP

Sin tablas adicionales (no hay entidades específicas de MP como FintocPaymentIntent). Orden:
1. `membership.deleteMany()`
2. `user.deleteMany()`
3. `plan.deleteMany()`
4. `gym.deleteMany()`
