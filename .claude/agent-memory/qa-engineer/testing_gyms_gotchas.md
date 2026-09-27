---
name: testing_gyms_gotchas
description: Gotchas del módulo gyms: weightRounding no expuesto en getGym select, skills seed automático idempotente, PUT /gyms/me aislamiento es natural (token define gymId).
type: feedback
---

# Gotchas de testing del módulo gyms y skills

## weightRounding no está en el select de getGym

`gyms.service.ts::getGym()` tiene un `select` explícito que NO incluye `weightRounding`.
El campo existe en la DB (migración aplicada), pero `GET /gyms/me` no lo devuelve.
Para testear que el campo es persistible, usar `prisma.gym.findUnique({ select: { weightRounding: true } })` directamente.

**Why:** El select fue escrito antes de agregar weightRounding. Es un gap de implementación, no un bug de seguridad.
**How to apply:** Si se pide testear que PUT /gyms/me persiste weightRounding, agregar el campo al select de getGym primero (o verificar en DB). No asumir que la respuesta HTTP lo expone.

## PUT /gyms/me — aislamiento cross-gym es automático

El endpoint usa `user.gymId` del JWT para el update. No hay parámetro de gymId en la URL.
Esto significa que Admin B siempre modifica Gym B al llamar `/gyms/me`, no Gym A.
El test de "cross-gym" no es "bloqueo", sino que verifica que el update afecta el gym del token, no otro.

**Why:** El diseño es correcto — el endpoint es self-referential. El aislamiento real depende de que el JWT no sea modificable.
**How to apply:** Para testear cross-gym en gyms, verificar que la modificación NO afecta el gym equivocado verificando en DB directamente.

## Skills: seed automático en GET /skills

`GET /skills` hace seed automático de 6 skills por defecto si el gym no tiene ninguna (ni activas ni inactivas).
La condición es `count({ where: { gymId } }) === 0` — incluye skills inactivas.
Si en cleanup se borran skills con `deleteMany`, el siguiente GET vuelve a sembrar.
Si en cleanup se dejan skills inactivas, NO se vuelve a sembrar (total > 0).

**Why:** El seed usa `total` (no solo activas) para evitar re-sembrar después de desactivar todas las skills. Es intencional.
**How to apply:** En tests que necesiten gym sin skills, limpiar con `gymSkillMilestone.deleteMany` + `gymSkill.deleteMany` en ese orden (FK constraint). En cleanup de la suite, limpiar ambas tablas.

## Skills: soft delete, no hard delete

`DELETE /skills/:id` → `gymSkill.update({ isActive: false })`. El registro existe en DB.
`GET /skills` filtra `{ isActive: true }`.
El seed automático mira el count total (incluyendo inactivos) para no re-sembrar.

**How to apply:** Después de DELETE, verificar con `prisma.gymSkill.findUnique` que existe pero `isActive === false`. No buscar en el listado (filtra activos).

## Cleanup de skills: orden de FK

Para borrar skills manualmente: primero `gymSkillMilestone.deleteMany({ where: { skillId: { in: [...] } } })`, luego `gymSkill.deleteMany`. 
O alternativamente: `gymSkillMilestone.deleteMany({ where: { skill: { gymId } } })` luego `gymSkill.deleteMany({ where: { gymId } })`.

## movements-library es un campo Json en Gym

El endpoint `PUT /gyms/me/movements-library` hace `prisma.gym.update({ data: { movementLibrary: movements } })`.
`GET /gyms/me/movements-library` devuelve `gym?.movementLibrary ?? []`.
No hay tabla separada — es un campo Json en el modelo Gym.
Array vacío `[]` es válido y borra la biblioteca.
