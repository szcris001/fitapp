---
name: testing_analytics_gotchas
description: Gotchas de analytics RM y GymnasticProgress: bug de tenancy en /user/:userId endpoints, comportamiento de agrupación por movimiento/skill
type: project
---

## Bug de tenancy en endpoints /user/:userId (2026-05-04) — CORREGIDO (verificado E2E 2026-09-29: ambos responden 404 "Usuario no encontrado" para un userId de otro gym)

`GET /rms/user/:userId` y `GET /gymnastic-progress/user/:userId` usan `requireCoachOrAdmin` pero NO verifican que el `userId` del path param pertenezca al gym del requester. Un ADMIN de Gym B puede ver datos de un usuario de Gym A si conoce su UUID.

**Why:** `getRmsByUser(userId)` y `getGymnasticProgressByUser(userId)` solo filtran por `userId`, sin cruzar con `gymId` del requester. Diseño incompleto.

**How to apply:** Si el backend-dev corrige esto, actualizar el test "ADMIN de Gym B intenta ver..." para esperar 403 en lugar de 200. El test actual documenta el comportamiento roto como fixture hasta que se corrija.

## Comportamiento del service (verificado en tests)

- `getRmsByUser(userId)`:
  - Agrupa por `movementName`
  - Ordena `recordedAt` desc — el primero es el más reciente
  - `currentRm` = `history[0].weightKg` (el más reciente)
  - `improvement` = `history[0].weightKg - history[history.length-1].weightKg` (con 1 registro = 0)

- `getGymnasticProgressByUser(userId)`:
  - Agrupa por `skillName`
  - Ordena `achievedAt` desc
  - `latestMilestone` = `milestones[0].milestone`
  - Múltiples registros del mismo skill son posibles (historial de progresión)

## Gym-evolution sí está bien aislado

`GET /rms/gym-evolution` filtra via `where: { user: { gymId } }` usando el `gymId` del token — aislamiento correcto, diferente a los endpoints /user/:userId.

## Cleanup del afterAll

Orden correcto de cleanup para analytics:
1. `gymnasticProgress.deleteMany` (FK → user)
2. `rmRecord.deleteMany` (FK → user)
3. `membership.deleteMany` (FK → user)
4. `user.deleteMany`
5. `gym.deleteMany`
