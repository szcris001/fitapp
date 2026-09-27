---
name: Diseño Fintoc Payments (Pay by Bank)
description: Diseño aprobado 2026-05-06 para integrar Fintoc Payments como pasarela Pay by Bank. Tabla FintocPaymentIntent, 3 endpoints, idempotencia doble barrera, firma HMAC-SHA256.
type: project
---

# Diseño Fintoc Payments / Pay by Bank (aprobado 2026-05-06)

## Distinción con Fintoc Movements (ya implementado)

- **Fintoc Movements / Conciliación**: alumno transfiere manualmente → Fintoc detecta movimiento bancario → admin concilia. Tablas: `FintocLink`, `BankMovement`. Ya implementado.
- **Fintoc Payments / Pay by Bank**: flujo iniciado proactivamente desde la app — el backend crea un payment intent, Fintoc ejecuta la transferencia automáticamente. Tabla nueva: `FintocPaymentIntent`.

## Tabla nueva: FintocPaymentIntent

```prisma
enum FintocPaymentIntentStatus {
  PENDING
  SUCCEEDED
  FAILED
  EXPIRED
}

model FintocPaymentIntent {
  id             String                    @id @default(uuid())
  gymId          String
  userId         String
  planId         String
  fintocIntentId String                    @unique
  widgetUrl      String
  status         FintocPaymentIntentStatus @default(PENDING)
  amountCents    Int
  currency       String                    @default("CLP")
  membershipId   String?                   // String? (no FK formal, mismo patrón que reviewedBy)
  metadata       Json?
  expiresAt      DateTime?
  createdAt      DateTime                  @default(now())
  updatedAt      DateTime                  @updatedAt
  gym            Gym                       @relation(fields: [gymId], references: [id])
  @@index([gymId, status])
  @@index([userId, status])
}
```

## Config por gym: clave fintocPayments (distinta de fintoc para conciliación)

```json
{
  "fintocPayments": {
    "enabled": true,
    "secretKey": "sk_live_...",
    "webhookSecret": "whsec_fintoc_pay_...",
    "currency": "CLP"
  }
}
```

## Los 3 endpoints

### POST /payments/checkout/fintoc-pay (authenticate)
- Body: `{ planId: UUID }`
- Llama POST https://api.fintoc.com/v1/payment_intents con secretKey del gym
- Persiste FintocPaymentIntent (status: PENDING)
- Response: `{ widgetUrl, paymentIntentId }`

### GET /payments/fintoc-pay/status/:paymentIntentId (authenticate)
- Filtra por fintocIntentId + userId del JWT (tenancy correcto)
- Solo consulta DB, no llama API de Fintoc (el webhook actualiza)
- Response: `{ status, membershipId? }`

### POST /payments/webhook/fintoc-pay (sin auth)
- Header: fintoc-signature (HMAC-SHA256 del rawBody)
- gymId viene en body.data.metadata.gymId
- Idempotencia: fintocIntentId @unique + chequeo status === 'SUCCEEDED'
- Activa membresía con: activateMembership(userId, planId, 'fintoc_pay', { paymentNotes: `fintoc_pay:${id}` })
- Maneja payment_intent.succeeded y payment_intent.failed

## Idempotencia (doble barrera)
1. `FintocPaymentIntent.fintocIntentId @unique` — no puede haber dos intents con el mismo ID de Fintoc
2. Check en webhook handler: si `existing.status === 'SUCCEEDED'`, return early
3. `activateMembership` también chequea `paymentNotes: 'fintoc_pay:{id}'` como en las demás pasarelas

## Archivos a tocar
- `apps/api/prisma/schema.prisma` — modelo + enum + relación en Gym
- `apps/api/prisma/migrations/<timestamp>_add_fintoc_payment_intent/`
- `apps/api/src/modules/payments/payments.service.ts` (+3 funciones)
- `apps/api/src/modules/payments/payments.routes.ts` (+3 endpoints)
- `apps/api/.env` — FINTOC_PAYMENTS_SECRET_KEY (fallback global)

## Trade-offs elegidos
1. Tabla separada de BankMovement — ciclos de vida distintos, campos distintos, mezclarlos contaminaría el matcher de conciliación.
2. Endpoint de status consulta solo DB, no API Fintoc — menor costo, el webhook es quien actualiza.
3. membershipId en FintocPaymentIntent como String? (no FK formal) — evita dependencia circular con Membership, mismo patrón que reviewedBy en BankMovement.
4. Clave config 'fintocPayments' (no 'fintoc') — para no colisionar con la config del widget de conciliación.
