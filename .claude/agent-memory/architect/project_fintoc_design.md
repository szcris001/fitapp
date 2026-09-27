---
name: Diseño Fintoc conciliación bancaria
description: Diseño aprobado 2026-05-05 para integrar Fintoc como conciliador automático de transferencias bancarias. Tablas FintocLink y BankMovement, matcher en 3 fases, 5 endpoints.
type: project
---

# Diseño Fintoc conciliación bancaria (aprobado 2026-05-05)

## Tablas nuevas en Prisma

### FintocLink
Representa la conexión bancaria activa de un gym con Fintoc. Una por gym.
- `id`, `gymId` (FK Gym, único), `linkToken` (token de acceso Fintoc, encriptado o secret),
  `accountId`, `accountNumber`, `bankName`, `holderName`, `holderRut` (opcional),
  `currency` (default CLP), `status` (ACTIVE | REVOKED | ERROR), `createdAt`, `updatedAt`
- `@@unique([gymId])` — un link por gym

### BankMovement
Movimientos bancarios importados desde Fintoc.
- `id`, `gymId` (FK Gym), `fintocMovementId` (String @unique — idempotencia),
  `amount` (Int, centavos), `currency` (String), `postedAt` (DateTime), `description` (String?),
  `senderRut` (String?), `senderName` (String?), `referenceCode` (String?),
  `reconciliationStatus` (PENDING | MATCHED | REJECTED | MANUAL),
  `membershipId` (FK Membership?, nulable — apunta a la membresía conciliada),
  `matchConfidence` (String? — "exact_rut" | "amount_only" | "manual"),
  `reviewedBy` (String? — userId del admin que confirmó/rechazó),
  `reviewedAt` (DateTime?), `createdAt`, `updatedAt`
- `@@unique([fintocMovementId])` — idempotencia
- `@@index([gymId, reconciliationStatus])`

## Algoritmo Matcher (3 fases)

**Input**: un `BankMovement` con `amount`, `senderRut?`, `postedAt`, `description?`
**Target**: una `Membership` con `status = INACTIVE`, `transferStatus = PENDING_REVIEW`, `user.gymId = movement.gymId`

### Fase 1 — Exacto por monto + RUT (confianza alta, auto-confirmar)
- Condición: `movement.amount == membership.pricePaid` AND `movement.senderRut == user.rut`
- Acción: confirmar automáticamente (llama `confirmTransfer`), `matchConfidence = 'exact_rut'`

### Fase 2 — Monto + ventana temporal (confianza media, requiere revisión)
- Condición: `movement.amount == membership.pricePaid` AND `|movement.postedAt - membership.createdAt| <= 72h`
- No hay RUT o no coincide exactamente
- Acción: marcar como candidato, `reconciliationStatus = MATCHED`, `matchConfidence = 'amount_only'`
- No confirma automáticamente — queda para revisión admin

### Fase 3 — Sin match (pendiente manual)
- Acción: `reconciliationStatus = PENDING`, no vincula membership
- Admin puede asignar manualmente desde la UI

## Por qué NO se usa fuzzy en el comentario
El campo `description` de las transferencias bancarias en Chile es notoriamente ruidoso y truncado. Parsear RUT del comentario es frágil. Si el gym tiene `user.rut` en la base de datos (campo ya existe en schema User), el match por RUT es confiable. El fuzzy de texto queda fuera del MVP.

## Endpoints nuevos

### POST /payments/fintoc/link (ADMIN)
- Body: `{ linkToken: string, accountId: string }` — el widget de Fintoc entrega estos datos en el frontend
- Service: upsert `FintocLink` para el gymId del JWT. Llama Fintoc API para validar y obtener datos de la cuenta (accountNumber, bankName, holderName, holderRut)
- Response: `{ linkId, bankName, accountNumber, holderName, status }`

### GET /payments/fintoc/status (ADMIN)
- Response: el `FintocLink` activo del gym (sin exponer linkToken) + fecha del último import
- Si no existe link: `{ linked: false }`

### GET /payments/fintoc/movements (ADMIN)
- Query params: `status?: PENDING|MATCHED|REJECTED|MANUAL`, `limit?: number (default 50)`
- Response: lista paginada de `BankMovement` del gymId, con membership incluida si está asociada

### POST /payments/fintoc/sync (ADMIN)
- Llama Fintoc API con el linkToken del gym, trae movimientos de los últimos N días (configurable, default 7)
- Inserta `BankMovement` ignorando duplicados (upsert por `fintocMovementId`)
- Corre el matcher automáticamente sobre los nuevos movimientos
- Response: `{ imported: N, autoConfirmed: N, pendingReview: N }`
- Nota: este es el endpoint que reemplaza `reconcile` del diseño inicial — "sync" es más preciso

### POST /payments/webhook/fintoc (sin auth, idempotencia por event_id)
- Fintoc envía notificación cuando hay nuevos movimientos
- Headers: `fintoc-signature` (HMAC-SHA256 del body con `FINTOC_WEBHOOK_SECRET`)
- Body: `{ type: 'movements.new', linkId: string, data: { movements: [...] } }`
- Acción: verificar firma, insertar movimientos, correr matcher, encolar job BullMQ si hay candidatos que requieren revisión
- Idempotencia: cada movimiento tiene `fintocMovementId` único — upsert seguro

### PATCH /payments/fintoc/movements/:movementId/confirm (ADMIN)
- Cuerpo: `{ membershipId: string }` — el admin asigna manualmente
- Acción: llama `confirmTransfer`, actualiza `BankMovement` con status MANUAL

### PATCH /payments/fintoc/movements/:movementId/reject (ADMIN)
- Marca el movimiento como `REJECTED` (no corresponde a ningún pago esperado)

## Configuración por gym

La config de Fintoc vive en el JSON `paymentGateways` del Gym (igual que otros gateways):
```json
{
  "fintoc": {
    "enabled": true,
    "publicKey": "pk_live_...",
    "webhookSecret": "whsec_fintoc_..."
  }
}
```
El `linkToken` secreto vive en `FintocLink.linkToken`, no en `paymentGateways` (es por-cuenta, no por-gym-config).

## Variables de entorno nuevas

En `apps/api/.env`:
- `FINTOC_SECRET_KEY` — clave secreta de Fintoc (para llamadas server-side a la API Fintoc)

En config por gym (paymentGateways JSON):
- `fintoc.publicKey` — para el widget en frontend
- `fintoc.webhookSecret` — para verificar firma del webhook

## Trade-offs elegidos

1. **Una tabla BankMovement separada** en vez de enriquecer Membership directamente — permite importar movimientos sin membresía pendiente, guardar historia bancaria, y auditar conciliaciones. Más limpio.
2. **No auto-confirmar si solo hay match por monto** — los falsos positivos (dos alumnos que pagaron el mismo monto en el mismo día) son más dañinos que tener que revisar manualmente.
3. **linkToken en tabla FintocLink, no en paymentGateways** — el linkToken es diferente por cuenta bancaria conectada y puede rotar. Guardarlo en una tabla dedicada permite revocar, re-vincular, y auditar por separado.
4. **Webhook + endpoint sync manual** — el webhook es el path feliz, el sync manual es el fallback si el webhook falla o el gym quiere reconciliar en demanda.

## Archivos a tocar

- `apps/api/prisma/schema.prisma` — modelos `FintocLink` y `BankMovement`
- `apps/api/prisma/migrations/<timestamp>_add_fintoc` — migración nueva
- `apps/api/src/modules/payments/payments.service.ts` — funciones Fintoc
- `apps/api/src/modules/payments/payments.routes.ts` — 7 endpoints nuevos
- `apps/api/src/modules/payments/payments.schema.ts` — schemas Zod Fintoc
- `apps/api/.env` — `FINTOC_SECRET_KEY`

## Orden de implementación para payments-specialist

1. Migración Prisma: modelos FintocLink + BankMovement
2. Schemas Zod en payments.schema.ts (FintocLinkSchema, BankMovementSchema, SyncResultSchema)
3. Service: linkFintocAccount, getFintocStatus, syncFintocMovements, runMatcher, confirmFintocMovement, rejectFintocMovement
4. Service: handleFintocWebhook (verificación HMAC + upsert + matcher)
5. Routes: 7 endpoints nuevos
6. Tests de integración (qa-engineer)
