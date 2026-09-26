---
name: testing_wod_gotchas
description: Gotchas de wod.integration.test.ts — FK order en cleanup, my-loads reutiliza WOD existente, GET /wods/class devuelve array, cross-gym devuelve [] en my-loads
type: feedback
---

# Gotchas del módulo WOD (wod.integration.test.ts)

## Class_coachId_fkey obliga a borrar clases antes que usuarios

**Regla:** En el cleanup (beforeAll limpieza de residuos Y afterAll), borrar clases ANTES de borrar usuarios.

**Why:** El campo `coachId` en `Class` tiene FK hacia `User`. Si se intenta borrar el coach antes de borrar sus clases, PostgreSQL lanza `P2003 ForeignKeyConstraintViolation`. El mismo patrón aplica a bookings y rmRecords — esos sí van antes de las clases.

**Orden correcto de cleanup:**
1. `rmRecord.deleteMany`
2. `booking.deleteMany`
3. `membership.deleteMany`
4. `wod.deleteMany` (cascade elimina WodBlock y WodMovement)
5. `class.deleteMany` ← ANTES que users
6. `user.deleteMany`
7. `classType.deleteMany`
8. `gym.deleteMany`

**How to apply:** Siempre que el módulo testeado use coachId o cualquier FK de User→entidad, revisar el orden de cleanup.

---

## GET /wods/class/:classId devuelve ARRAY (no objeto único)

**Regla:** La ruta devuelve `wods[]`, no un solo WOD. Diseño: un classType puede tener múltiples WODs en el mismo día (raro pero posible).

**Why:** El código hace `prisma.wod.findMany(...)` — no `findFirst`. El frontend filtra o toma el primero.

**How to apply:** Al testear, esperar `Array.isArray(body) === true` y buscar el WOD por ID con `body.find(...)`.

---

## GET /wods/class/:classId/my-loads — reutiliza WOD del día si ya existe

**Regla:** No crear un WOD duplicado para hoy en la suite de my-loads si ya existe uno de otra suite.

**Why:** La ruta hace `findFirst` por `gymId + classTypeId + dayRange(startsAt)`. Si ya existe un WOD para hoy con ese classType, usarlo directamente. Crear otro daría error de "ya existe planificación" en el endpoint POST.

**How to apply:** En beforeAll de my-loads, hacer `findFirst` del WOD del día antes de intentar crear uno nuevo. Si existe, usarlo.

---

## GET /wods/class/:classId/my-loads cross-gym → [] (no 401/404)

**Regla:** Si el classId pertenece a otro gym, el endpoint devuelve `[]` (array vacío), NO un 4xx.

**Why:** El código hace `cls = await prisma.class.findFirst({ where: { id: classId, gymId: user.gymId } })`. Si no encuentra la clase, hace `return reply.send([])` — early return silencioso.

**How to apply:** Test de cross-gym espera `statusCode 200` + `body === []`.

---

## WOD blocks reemplazan (no mergean) en PUT /wods/:id

**Regla:** PUT borra todos los WodBlock del WOD con `deleteMany`, luego crea nuevos. Es un replace completo.

**Why:** El código hace `await prisma.wodBlock.deleteMany({ where: { wodId: id } })` antes del update.

**How to apply:** Verificar que tras actualizar con `blocks: []`, los bloques previos no aparecen en DB (`prisma.wodBlock.findMany({ where: { wodId } })` debe devolver `[]`).

---

## Orden de bloques y movimientos — índice no id

**Regla:** El campo `order` en WodBlock y WodMovement se asigna por posición en el array enviado (índice bi/mi en sanitizeBlocks).

**Why:** `sanitizeBlocks` mapea `(b, bi) => ({ order: bi, ... })` y `(m, mi) => ({ order: mi, ... })`.

**How to apply:** El primer bloque tiene `order: 0`, el segundo `order: 1`, etc. Los movimientos dentro del bloque también empiezan en 0.
