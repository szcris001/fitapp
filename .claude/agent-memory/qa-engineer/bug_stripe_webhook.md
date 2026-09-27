---
name: Bug doble ruta Stripe webhook
description: Ruta legacy /payments/webhook serializa el body antes de pasarlo a constructEvent, rompiendo la verificación de firma
type: project
---

En `apps/api/src/modules/payments/payments.routes.ts` existen DOS rutas de webhook de Stripe:

1. `/payments/webhook` (línea 114): llama `handleStripeWebhook(Buffer.from(JSON.stringify(request.body)), signature)` — INCORRECTO. Serializar el body con JSON.stringify antes de pasarlo rompe la verificación HMAC de Stripe porque el raw body ya fue parseado por Fastify.

2. `/payments/webhook/stripe` (línea 374): usa `(request as any).rawBody as Buffer` — CORRECTO.

**Por qué importa:** Stripe requiere el body crudo exacto (bytes sin modificar) para verificar la firma del webhook. Si se usa la ruta legacy, todos los webhooks fallarán con "Webhook signature inválida".

**Acción recomendada:** Eliminar la ruta `/payments/webhook` legacy y asegurarse de que el Dashboard de Stripe apunta a `/payments/webhook/stripe`. Assignee: payments-specialist.

**How to apply:** Cuando escriba tests de webhook de Stripe, usar siempre la ruta `/api/payments/webhook/stripe` con raw body real, no `/api/payments/webhook`.
