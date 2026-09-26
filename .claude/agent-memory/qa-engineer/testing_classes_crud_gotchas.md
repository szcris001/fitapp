---
name: testing_classes_crud_gotchas
description: Gotchas de classes CRUD (ClassType + Class instancias): permisos, duplicados, recurrentes, bulk, attendance, aislamiento cross-gym
type: feedback
---

## Permisos en classes

- `POST /class-types` usa `requireAdmin` — COACH recibe 403, solo ADMIN puede crear/editar/borrar tipos de clase
- `POST /classes` y `PATCH /classes/:id` usan `requireCoachOrAdmin` — COACH puede crear clases (201), MEMBER no (403)
- `DELETE /classes/bulk` usa `requireAdmin` — MEMBER recibe 403

## Duplicados

- `createClass` (ONCE) hace `findFirst` por `{ gymId, classTypeId, startsAt }` antes de crear. Si existe, lanza "Ya existe una clase de este tipo el [fecha]". El check NO es un unique constraint en DB — es en código. Para tests de duplicado: usar el mismo `classTypeId + startsAt` exactos.
- Los tests de clases con frequency=ONCE no comparten `classTypeId` entre suites si crean clases a la misma hora — usar timestamps distintos o classTypes distintos por suite para evitar colisiones.

## ClassType con bloques

- `createClassType` asigna `order: i` (índice en el array) a cada bloque
- `updateClassType` con `blocks !== undefined` hace `deleteMany` de todos los bloques existentes antes de crear los nuevos (reemplaza completo, no hace merge)
- `blocks: []` en el update borra todos los bloques sin crear nuevos

## Clases recurrentes (RECURRING)

- `createClass` con `frequency='RECURRING'` retorna `{ created, skipped, message }`, no el objeto de clase
- `recurringUntil` sin hora se convierte a `T23:59:59Z` — el día del `recurringUntil` mismo queda incluido
- Si todos los slots del período ya existen: lanza "Todas las clases del período ya existen para este tipo de clase" (400)
- Para tests de recurrentes: crear un ClassType exclusivo por test para evitar colisiones con otros tests que hayan creado clases a esa hora

## Aislamiento cross-gym en ClassType

- `createClass` valida `classType.gymId === gymId` del requester — usar un classTypeId de otro gym da "Tipo de clase no encontrado" (400)
- `updateClassType` y `deleteClassType` usan `findFirst({ where: { id, gymId } })` — devuelven "Tipo de clase no encontrado" (400) si el gymId no coincide

## GET /classes

- Endpoint agrega `myBookingStatus` a cada clase consultando bookings activos del usuario autenticado
- `myBookingStatus: null` cuando no hay booking activo (CONFIRMED/ATTENDED/PENDING_CONFIRM)
- Filtro `to=YYYY-MM-DD` incluye el día completo hasta 23:59:59 UTC (código hace `toDate.setUTCHours(23,59,59,999)`)

## GET /classes/attendance

- Agrupa por hora del día (getHours(), no UTC) — cuidado con zonas horarias en el servidor
- Solo cuenta clases del gymId del token (aislamiento correcto)
- Estructura de respuesta: `{ hour: "HH:00", total, bookings, avgOccupancy }`

## Cleanup en tests de Class

- El cleanup de bulk delete manual en afterAll puede fallar si las clases ya fueron borradas por DELETE en el test
- Usar arrays de tracking (`createdClassIds`) y hacer deleteMany en afterAll — las clases ya borradas por el test no causan error porque deleteMany no falla si el ID no existe
- Cleanup de gymBCoach creado en suites de filtering: recordar borrar en afterAll o usar el adminB que ya existe

**Why:** Estos gotchas se descubrieron al escribir classes.integration.test.ts el 2026-05-04. 42/42 passing sin bugs.

**How to apply:** Antes de escribir tests para cualquier endpoint de classes, revisar los permisos exactos (requireAdmin vs requireCoachOrAdmin) y el comportamiento de duplicados de classType+startsAt.
