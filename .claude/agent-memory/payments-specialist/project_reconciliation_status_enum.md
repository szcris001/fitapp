---
name: project-reconciliation-status-enum
description: Valores reales del enum ReconciliationStatus (Fintoc/conciliación bancaria) — 5 valores, no 4
metadata:
  type: project
---

El enum `ReconciliationStatus` de `prisma/schema.prisma` (usado por `BankMovement.reconciliationStatus`, conciliación Fintoc) tiene **5 valores**: `PENDING`, `MATCHED`, `CONFIRMED`, `REJECTED`, `MANUAL`.

**Why**: el 2026-10-31, al armar el schema Zod para `GET /payments/fintoc/movements`, el hallazgo QA original (H02 de `2026-10-31-0801-conciliacion`) solo mencionaba 4 valores de ejemplo (`'PENDING' | 'MATCHED' | 'CONFIRMED' | 'REJECTED'`) — confirmar siempre contra el schema real evitó dejar `MANUAL` fuera del enum de validación (lo que habría causado un 400 falso para un valor legítimo).

**How to apply**: cualquier schema Zod que valide un campo de enum de Prisma en `payments/` (o en general) debe copiarse literal desde `prisma/schema.prisma`, no desde la descripción de un ticket o hallazgo QA.
