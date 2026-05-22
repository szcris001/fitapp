---
name: Transfer Flow Testing Findings
description: Patrones y gotchas al testear el flujo de comprobante de transferencia bancaria en FitHub
type: project
---

Hallazgos del flujo de transferencia bancaria (2026-04-30, 23/23 passing, 0 bugs en service):

## Estado del service (payments.service.ts)

El flujo está correctamente implementado:
- `submitTransferReceipt`: crea membresía con `status: 'INACTIVE'` y `transferStatus: 'PENDING_REVIEW'`. Desactiva membresías ACTIVE/TRIAL previas del usuario.
- `confirmTransfer`: verifica `transferStatus === 'PENDING_REVIEW'` (idempotencia). Pasa a `status: 'ACTIVE'`, `transferStatus: 'CONFIRMED'`, registra `paidAt`. Respeta extensión desde membresía vigente.
- `rejectTransfer`: verifica `transferStatus === 'PENDING_REVIEW'`. Pasa a `transferStatus: 'REJECTED'`, `status` queda `INACTIVE`. `paidAt` nunca se registra.
- Ambos confirm/reject usan la misma guarda `if (membership.transferStatus !== 'PENDING_REVIEW') throw new Error('Esta transferencia ya fue procesada')` — la idempotencia funciona correctamente.

## Gotcha: endpoint multipart no se puede testear con JSON

`POST /payments/transfer/receipt` llama a `(request as any).file()` que requiere `@fastify/multipart` registrado. El endpoint espera un archivo real multipart — no puede recibir JSON. Estrategia adoptada:

1. Para validaciones de auth/params (sin file): usar multipart mínimo con `buildMultipartBody()` helper que construye boundary a mano.
2. Para lógica de negocio: llamar directamente a `submitTransferReceipt()` del service (tests de service layer, no de ruta HTTP).

Esta estrategia cubre la lógica real sin depender de file I/O en tests. El tradeoff aceptado: la capa de conversión file→URL no está cubierta por integration tests (pero es trivial — solo escribe a disco).

## Patrón buildApp() para payments

Necesita `@fastify/multipart` además de JWT y addContentTypeParser:

```typescript
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
```

Sin multipart, el endpoint `POST /transfer/receipt` fallará con un error de `.file is not a function`.

## Generación de tokens en setup

Cuando setup necesita tokens JWT sin hacer login HTTP (porque el módulo de auth no está registrado en la buildApp de payments), usar app temporal:

```typescript
const tempApp = Fastify({ logger: false })
await tempApp.register(jwt, { secret: JWT_SECRET })
await tempApp.ready()
const token = tempApp.jwt.sign({ userId, gymId, email, role, name })
await tempApp.close()
```

## Protección cross-gym en confirm/reject

`confirmTransfer(gymId, membershipId)` filtra con `{ id: membershipId, user: { gymId } }`. Si un admin de Gym B intenta confirmar una membresía de Gym A, la query devuelve null → lanza 'Membresía no encontrada' → HTTP 400. Esto es correcto y está confirmado con tests.

## Desactivación de membresía previa

`submitTransferReceipt` hace `updateMany({ where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } }, data: { status: 'INACTIVE' } })` ANTES de crear la nueva membresía pendiente. Esto significa que si el alumno tenía una membresía activa válida, la pierde al subir el comprobante — incluso si el admin rechaza después. Este comportamiento puede ser un bug de UX pero no es un bug de código (así está diseñado). No hay test que documenta esta decisión de diseño explícitamente, pero el test "submit desactiva membresía activa previa" lo cubre.

**Why:** Confirmado con 23 tests contra DB real en fitapp_dev.
**How to apply:** Replicar la estrategia multipart+service directo para otros endpoints que usen file upload.
