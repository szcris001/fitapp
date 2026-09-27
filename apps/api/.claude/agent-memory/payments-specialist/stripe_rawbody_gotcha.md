---
name: stripe_rawbody_gotcha
description: Stripe webhook signature validation falla si el body fue re-serializado con JSON.stringify en vez de usar el rawBody original
type: feedback
---

En Fastify, cuando llega un webhook de Stripe, el body ya fue parseado por el JSON parser del framework. Si lo re-serializas con `Buffer.from(JSON.stringify(request.body))` y se lo pasas a `stripe.webhooks.constructEvent`, el HMAC calculado nunca coincide con la firma del header `stripe-signature` porque la representación de bytes difiere del payload original (orden de claves, espacios, etc.).

La forma correcta siempre es acceder al raw body sin parsear:

```ts
const rawBody = (request as any).rawBody as Buffer
if (!rawBody) return reply.status(400).send({ error: 'Sin raw body' })
const result = await handleStripeWebhook(rawBody, signature)
```

Para que `rawBody` esté disponible en Fastify, la ruta debe incluir `{ config: { rawBody: true } }` y el servidor debe tener configurado el plugin `@fastify/rawbody` o equivalente.

**Why:** El error produce que `stripe.webhooks.constructEvent` lance siempre un error de firma inválida, dejando el webhook completamente roto y silencioso (responde 400 en cada evento de Stripe).

**How to apply:** Antes de testear cualquier webhook de Stripe en sandbox, verificar que la ruta usa `rawBody` y no `JSON.stringify(request.body)`. Aplicar el mismo principio a otras pasarelas que validan firma sobre el payload crudo (ej: Khipu, Mercado Pago).
