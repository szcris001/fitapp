---
name: Fintoc MVP — arquitectura y decisiones
description: Implementación Fintoc conciliación bancaria 2026-05-05. Gotchas del matcher, diseño del webhook y decisiones de MVP.
type: project
---

Fintoc implementado como conciliación pura (no pasarela de cobro). El frontend usa el Widget oficial de Fintoc y envía los movimientos al backend. El backend no llama la API de Fintoc directamente en MVP.

**Why:** Permite testear todo el flujo sin credenciales reales de Fintoc. El backend solo guarda, matchea y concilia.

**How to apply:** Cuando se integre la API real de Fintoc, la función `importFintocMovements` en `payments.service.ts` ya tiene la interfaz correcta. Solo hay que agregar la llamada a la API real antes de llamar a `importFintocMovements`.

## Decisiones de diseño

- `FintocLink` es 1:1 por gym (`@unique gymId`). Upsert en `saveFintocLink` — si el gym reconecta se actualiza el link.
- `BankMovement` usa `fintocMovementId` como clave de idempotencia (`@unique`). Si el mismo movimiento llega dos veces (webhook duplicado o sync duplicado), el `findUnique` lo detecta y lo omite.
- `gymId` en el webhook de Fintoc viene en el payload (`body.gymId` o `body.metadata.gymId`). No hay JWT. La seguridad la da la firma HMAC-SHA256.

## Gotchas del matcher

- El matcher corre en dos fases para cada movimiento PENDING:
  - Fase 1 (exact_rut): si `movement.senderRut` no es null y hay una Membership PENDING_REVIEW del mismo gym y mismo monto con `user.rut === senderRut` → confirma automáticamente vía `confirmTransfer`. El BankMovement queda CONFIRMED.
  - Fase 2 (amount_only): busca Membership PENDING_REVIEW con mismo monto, donde `|movement.postedAt - membership.createdAt| <= 72h`. Solo marca MATCHED — NO confirma automáticamente. Requiere revisión humana.
- Si no hay match en ninguna fase, el movimiento queda PENDING.
- El matcher NO confirma en Fase 2 intencionalmente: el monto puede coincidir con múltiples membresías.
- `confirmTransfer` valida que `transferStatus === 'PENDING_REVIEW'` antes de confirmar. Si ya fue confirmada, lanza error. El matcher debe manejar esto (actualmente no tiene try/catch por fase — si `confirmTransfer` lanza, el movimiento queda sin actualizar).

## Webhook Fintoc

- Endpoint: `POST /payments/webhook/fintoc` — sin auth JWT.
- Firma: header `fintoc-signature` con HMAC-SHA256. Secret buscado en este orden: `gym.paymentGateways.fintoc.webhookSecret` → `process.env.FINTOC_SECRET_KEY`.
- Si no hay secreto configurado, se acepta sin verificar firma (comportamiento permisivo para dev). En producción se debe configurar el secreto.
- `gymId` debe venir en el body del webhook. Si no está, se rechaza con 400.
- Los movimientos van en `body.movements[]`.

## Estructura del payload de sync (frontend → backend)

```json
{
  "movements": [
    {
      "id": "mov_abc123",         // fintocMovementId (idempotencia)
      "amount": 50000,            // en CLP (entero, no centavos)
      "currency": "CLP",
      "post_date": "2026-05-01",  // ISO date string
      "description": "Transferencia",
      "sender_rut": "12345678-9", // opcional
      "sender_name": "Juan Pérez", // opcional
      "reference_code": "REF001"  // opcional
    }
  ]
}
```

## Variable de entorno

- `FINTOC_SECRET_KEY` — global en `.env`. Usado como fallback si el gym no tiene secreto en `paymentGateways.fintoc.webhookSecret`.

---

## Fintoc Payments (Pay by Bank) — implementado 2026-05-06

**Diferencia clave**: Fintoc tiene DOS productos distintos:
1. **Fintoc conciliación** (Open Banking): lee movimientos bancarios del gym, los matchea con transferencias de alumnos. Ya implementado.
2. **Fintoc Pay by Bank** (pasarela de pago): el alumno paga con su cuenta bancaria directamente. Implementado 2026-05-06.

### Modelo `FintocPaymentIntent`

- Tabla nueva: `FintocPaymentIntent` (id, gymId, userId, planId, fintocIntentId @unique, widgetUrl, status FintocPayStatus, amountCents, membershipId?, metadata Json?, expiresAt?, createdAt, updatedAt).
- Enum `FintocPayStatus`: PENDING | SUCCEEDED | FAILED | EXPIRED.
- `fintocIntentId @unique` es la clave de idempotencia para webhooks.
- Migración: `20260507012707_add_fintoc_payment_intent`.

### Gotcha: `(prisma as any).fintocPaymentIntent`

En el service, `fintocPaymentIntent` se accede via cast `(prisma as any)` porque el Prisma Client generado en el entorno de desarrollo puede estar desactualizado si no se ha regenerado tras la migración. En runtime (con `prisma generate` post-migración) funciona correctamente. En tests, mockear `prisma.fintocPaymentIntent` directamente funciona con el cast.

### Config per-gym

Fintoc Payments usa la clave `fintocPayments` (con 's') en `paymentGateways` del gym — distinto de `fintoc` (sin 's') que usa la conciliación. No confundir:
- `paymentGateways.fintoc` → conciliación bancaria (FintocLink, BankMovement).
- `paymentGateways.fintocPayments` → Pay by Bank (FintocPaymentIntent). Campos: `{ enabled, secretKey, webhookSecret, currency }`.

### Webhook Fintoc Pay by Bank

- Endpoint: `POST /payments/webhook/fintoc-pay` — sin auth JWT.
- Firma: header `fintoc-signature` con HMAC-SHA256 del rawBody con `cfg.webhookSecret` del gym. Si falta firma o es inválida → 401. Si falta webhookSecret → 400 (no hay comportamiento permisivo aquí, a diferencia de Fintoc conciliación).
- `gymId` viene en `body.data.metadata.gymId` (NOT en el body raíz como en Fintoc conciliación).
- Tipos de evento: `payment_intent.succeeded` → activa membresía + email. `payment_intent.failed` → marca FAILED.
- Idempotencia: si `intent.status === 'SUCCEEDED'` ya, retorna `{ received: true }` sin reprocesar.

### Estructura de payload del webhook

```json
{
  "type": "payment_intent.succeeded",
  "data": {
    "id": "pi_abc123",
    "metadata": {
      "gymId": "...",
      "planId": "...",
      "userId": "..."
    }
  }
}
```
