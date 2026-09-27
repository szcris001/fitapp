---
name: testing_payments_crud_gotchas
description: Gotchas y patrones al testear payments CRUD (history, revenue, gateways, my-memberships, auto-renew, manual, checkout, checkout-self)
type: feedback
---

## Stripe mock en payments CRUD

Para testear endpoints que llaman a `stripe.checkout.sessions.create()` (POST /checkout, POST /checkout-self), se mockea el módulo Stripe igual que en autorenew: `vi.mock('stripe', ...)` con una función constructora regular (no arrow). El mock debe devolver `{ id: '...', url: '...' }` para el `sessions.create`.

**Why:** Sin mock, los tests harían llamadas reales a Stripe y fallarían por `STRIPE_SECRET_KEY` inválida o ausente.

**How to apply:** Siempre poner `vi.mock('stripe', ...)` ANTES de `import { paymentRoutes }` — el orden importa en Vitest. También mockear `../../../lib/email` y `../../../lib/dte` para evitar efectos secundarios.

## getPaymentHistory filtra por paidAt: { not: null }

`GET /payments/history` solo devuelve membresías con `paidAt` NOT NULL. Una membresía INACTIVE de transferencia pendiente (paidAt=null) NO aparece. Diseño correcto — el historial es solo de pagos completados.

**How to apply:** Al testear que algo NO aparece en el historial, crear la membresía sin `paidAt`.

## checkout-self valida gymId del usuario autenticado

`createSelfCheckout(userId, planId)` busca el gym del usuario y hace `plan.findFirst({ where: { id: planId, gymId: user.gymId, isActive: true } })`. Si el planId pertenece a otro gym, devuelve 400 "Plan no encontrado". No se puede usar un plan de otro gym aunque tengas el planId.

**How to apply:** Testear cross-gym con planBId + tokenA → siempre 400.

## auto-renew solo funciona en membresías ACTIVE

`PUT /payments/my-memberships/:id/auto-renew` hace `findFirst({ where: { id, userId, status: 'ACTIVE' } })`. Una membresía INACTIVE → 404. Una membresía de otro usuario (userId diferente) → también 404 (no 403). El mensaje es el mismo: "Membresía no encontrada".

**How to apply:** No esperar 403 para cross-user en auto-renew — el endpoint devuelve 404.

## registerManualPayment incluye user y plan en la respuesta (include)

`prisma.membership.create({ ..., include: { plan: true, user: true } })`. Los otros métodos de pago (activateMembership usado por stripe/transfer) NO incluyen user y plan. Solo registerManualPayment lo hace.

**How to apply:** Solo testear `body.user.name` y `body.plan.name` en POST /payments/manual, no en otros endpoints.

## getEnabledGateways filtra con cfg?.enabled

El campo `paymentGateways` en Gym es JSON. Para aparecer en gateways, una pasarela necesita `{ enabled: true }`. Si `enabled: false` o el campo no existe, no aparece. Si el gym tiene `paymentGateways: {}` → array vacío.

**How to apply:** Para testear gateways específicas, crear el gym con `paymentGateways: { stripe: { enabled: true } }` en el setup.

## DTE (emitirDTE) debe mockearse

`registerManualPayment` llama a `emitirDTE` cuando `invoiceType` es 'boleta' o 'factura'. Sin mock, falla por falta de configuración de facturación. Mockear con `vi.mock('../../../lib/dte', () => ({ emitirDTE: vi.fn().mockResolvedValue(null) }))`.
