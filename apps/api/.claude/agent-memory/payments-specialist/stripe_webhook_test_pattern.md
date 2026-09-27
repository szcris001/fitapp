---
name: stripe_webhook_test_pattern
description: Patrón para tests de integración del webhook de Stripe sin claves reales — generateTestHeaderString con secret controlado
type: feedback
---

Para testear el webhook de Stripe sin claves reales de sandbox:

1. Usar un `TEST_WEBHOOK_SECRET` controlado (cualquier string con formato `whsec_...`).
2. Overridear `process.env.STRIPE_WEBHOOK_SECRET` en `beforeAll`.
3. Usar `stripe.webhooks.generateTestHeaderString({ payload, secret })` para generar headers válidos.
4. Usar `sk_test_dummy` como `STRIPE_SECRET_KEY` — solo inicializa el cliente, no hace llamadas externas en el webhook handler.
5. Pasar el rawBody como `Buffer` en `app.inject()` con `'content-type': 'application/json'`.

**Timeout de 300 segundos**: `stripe.webhooks.constructEvent()` tiene tolerancia de 300s por defecto. Para testear timestamp expirado, usar `timestamp: Math.floor(Date.now() / 1000) - 400` en `generateTestHeaderString`.

**Evento desconocido**: el handler actual tiene `return { received: true }` genérico — eventos no reconocidos se ignoran silenciosamente y devuelven 200. Esto es correcto.

**Duplicados**: el handler actual NO implementa tabla `WebhookEvent` de idempotencia. Para eventos que no crean membresías (sin metadata gymId/planId/userId), el segundo llamado simplemente devuelve 200 sin efectos secundarios. Para eventos `checkout.session.completed` con metadata válida, habría doble creación de membresía — pendiente implementar idempotencia real con tabla en DB.

**Why:** Descubierto al escribir los 12 tests de integración que cubren el checklist de cierre de Stripe (2026-04-30).

**How to apply:** Reutilizar este patrón para tests de otras pasarelas que usen HMAC (Khipu, Flow, PayU). La diferencia es que cada una tiene su propio algoritmo de firma.
