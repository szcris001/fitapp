---
name: testing_fintoc_gotchas
description: Gotchas de los tests de integración de Fintoc (conciliación bancaria) — comportamiento real del código
type: feedback
---

Comportamiento exacto del código Fintoc — documentado tras tests reales:

**saveFintocLink / POST /payments/fintoc/link**:
- Hace upsert por gymId (un solo registro por gym). Llamar dos veces con distinto linkToken actualiza, no duplica.
- gymId siempre viene del JWT, nunca del body. Admin B no puede crear/actualizar link de Admin A.
- Todos los campos excepto linkToken y accountId son opcionales. Devuelve 201 siempre (create y update).
- Cleanup necesario antes de tests: borrar BankMovement antes de FintocLink (FK).

**getFintocStatus / GET /payments/fintoc/status**:
- Sin FintocLink → `{ connected: false, link: null, pendingCount: 0, matchedCount: 0 }`.
- Con FintocLink → `{ connected: true, link: {...}, pendingCount: N, matchedCount: M }`.
- matchedCount cuenta MATCHED, pendingCount cuenta PENDING (solo del gym del token).

**importFintocMovements / POST /payments/fintoc/sync**:
- Lanza "No hay link Fintoc configurado para este gimnasio" si no existe FintocLink. El handler retorna 400.
- Idempotencia exacta por fintocMovementId (unique constraint en DB). Mismo id = skipped.
- `movements: []` pasa el schema Zod (min(1) rechaza solo array vacío). Con gymId que tiene link → 200, imported:0, skipped:0.
- IMPORTANTE: `fintocSyncSchema` tiene `.min(1)` en el array, body con `movements: []` devuelve 400.
- Actualiza lastSyncAt del FintocLink después de cada sync exitoso.
- Llama a runMatcher internamente sobre los movimientos importados.

**runMatcher**:
- Fase 1 (exact_rut): busca candidatos con `transferStatus: 'PENDING_REVIEW'`, mismo monto, mismo gym. Si senderRut coincide con user.rut → llama confirmTransfer (activa membresía) + pone movimiento CONFIRMED + matchConfidence='exact_rut'. Incrementa `confirmed`.
- Fase 2 (amount_only): si no hubo Fase 1, busca candidato dentro de ±72h (windowMs = 72*60*60*1000). Solo pone movimiento MATCHED + matchConfidence='amount_only'. NO confirma membresía. Incrementa `matched`.
- Sin candidatos → movimiento queda PENDING. matched:0, confirmed:0.
- Un movimiento sin sender_rut salta directo a Fase 2.

**confirmBankMovement / PATCH /payments/fintoc/movements/:id/confirm**:
- Sin membershipId en body → 400 "membershipId requerido" (verificación en route, no en service).
- Filtra por `{ id: movementId, gymId }` del token. Cross-gym → 400 "Movimiento bancario no encontrado".
- Si reconciliationStatus ya es CONFIRMED o REJECTED → 400 "Este movimiento ya fue procesado".
- Internamente llama confirmTransfer(gymId, membershipId) → la membresía debe estar en PENDING_REVIEW.
- Guarda reviewedBy = admin.userId, reviewedAt = now(), matchConfidence = existente ?? 'manual'.

**rejectBankMovement / PATCH /payments/fintoc/movements/:id/reject**:
- Sin reason: no modifica description (queda null si era null).
- Con reason: `description = "[RECHAZADO] {reason}"`. Exactamente ese prefix con corchetes.
- Si ya era CONFIRMED o REJECTED → 400 "Este movimiento ya fue procesado".
- Cross-gym → 400 "Movimiento bancario no encontrado".
- Guarda reviewedBy y reviewedAt.

**handleFintocWebhook / POST /payments/webhook/fintoc**:
- NO requiere JWT. Es un endpoint público.
- gymId se lee de `body.gymId ?? body.metadata.gymId`. Si ninguno → 400 "gymId requerido en payload".
- Firma HMAC-SHA256: solo se valida SI el header `fintoc-signature` está presente.
  - Si no hay header → pasa sin error (modo sin secret configurado).
  - Si hay header + gym tiene `paymentGateways.fintoc.webhookSecret` → valida con ese secret.
  - Si hay header + gym no tiene secret → valida con `process.env.FINTOC_SECRET_KEY` global.
  - Si hay header + no hay ningún secret → no valida (pasa).
  - Firma inválida → 401 "Firma Fintoc inválida".
- La validación usa rawBody si está disponible, sino JSON.stringify(body). Importante: en tests el rawBody = body porque addContentTypeParser lo guarda.
- Delega a importFintocMovements, misma idempotencia.
- gymId inexistente sin FintocLink → 400 (importFintocMovements lanza "No hay link Fintoc").

**Cleanup order en tests Fintoc** (FK constraints):
1. BankMovement (fintocLinkId FK, gymId FK, membershipId FK)
2. FintocLink (gymId FK)
3. Membership (userId FK)
4. User
5. Plan
6. Gym

**How to apply:**
- Cuando se escriban tests de Fintoc o features que toquen FintocLink/BankMovement, seguir estos gotchas para evitar fallos por FK, lógica del matcher, o comportamiento del webhook.
