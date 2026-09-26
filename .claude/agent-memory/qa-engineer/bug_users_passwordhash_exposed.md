---
name: Bug seguridad users — passwordHash expuesto en respuesta
description: POST /users y GET /users/:id devuelven el objeto Prisma completo incluyendo passwordHash
type: project
---

`createUser` en users.service.ts hace `return await prisma.user.create(...)` sin filtrar campos. La ruta devuelve el resultado directo al cliente. Consecuencia: el hash bcrypt queda expuesto en la respuesta HTTP a cualquier admin que cree un usuario.

Mismo patrón en `getUserById`: incluye el objeto completo incluyendo `passwordHash`.

**Why:** el servicio nunca proyecta los campos — devuelve el modelo Prisma completo. Es un olvido del backend-dev, no una decisión intencional.

**How to apply:** al testear otros servicios de usuarios/auth, verificar siempre que `passwordHash` no esté en la respuesta. Si el backend-dev dice que "ya está arreglado", el test debe confirmarlo explícitamente con `expect(body.passwordHash).toBeUndefined()`.

Fix esperado: en `createUser` hacer `const { passwordHash, ...rest } = user; return rest` o usar `select` en el query Prisma.

Estado: reportado en BACKLOG.md como [BUG-SECURITY], assignee backend-dev. Detectado 2026-05-04.
