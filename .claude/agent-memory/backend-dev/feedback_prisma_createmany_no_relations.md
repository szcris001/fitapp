---
name: feedback_prisma_createmany_no_relations
description: prisma.createMany no soporta relaciones (connect/set) — hay que hacer un segundo paso de update por cada registro creado
metadata:
  type: feedback
---

`prisma.createMany({ data: [...] })` no acepta campos de relaciones como `allowedPlans: { connect: [...] }`. Prisma lo rechaza en tiempo de compilación.

**Why:** Es una limitación de la API batch de Prisma — createMany acepta solo escalares.

**How to apply:** Cuando necesitas crear muchos registros con relaciones many-to-many:
1. Usa `createMany` solo con los campos escalares.
2. Luego `findMany` para obtener los ids recién creados.
3. `Promise.all(ids.map(id => prisma.model.update({ where: { id }, data: { relation: { connect: [...] } } })))`.

Ver implementación en `classes.service.ts` → función `createClass` branch RECURRING (2026-06-13).
