---
name: security-patterns-fitapp
description: Patrones peligrosos recurrentes detectados en FitApp que deben verificarse en cada PR — path traversal, JWT sin expiresIn, email cross-tenant, FK del body sin gymId
metadata:
  type: feedback
---

# Patrones peligrosos recurrentes en FitApp

Detectados en auditoría 2026-06-25. Verificar en cada PR que toque auth, uploads o queries Prisma.

## 1. path.join con params de ruta (path traversal)
`path.join(base, req.params.filename)` es vulnerable si filename contiene `../`.
**How to apply**: usar `safeResolvePath(base, filename)` de `apps/api/src/index.ts`. Rechaza `/`, `\`, `..`, `\0`. Verifica que `path.resolve(base, filename).startsWith(base + path.sep)`.

## 2. jwt.sign sin expiresIn
`app.jwt.sign({...})` sin segundo argumento emite token sin `exp` — válido indefinidamente.
**Why**: @fastify/jwt no tiene default de expiración en `sign()`. Solo en la config del plugin con la opción `sign: { expiresIn }`.
**How to apply**: grep `jwt\.sign\(` en producción. Cada llamada debe tener `{ expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' }`.

## 3. Email uniqueness sin gymId filter
`prisma.user.findFirst({ where: { email } })` sin `gymId` verifica unicidad global — bloquea emails legítimos de otros gyms.
**Why**: en multi-tenancy por gymId, la unicidad es per-gym. El mismo email puede existir en GymA y GymB.
**How to apply**: siempre incluir `gymId: user.gymId` en las queries de unicidad de email.

## 4. FK del body sin verificar gymId
`body.coachId`, `body.classTypeId`, `body.planId` usados directamente en `prisma.update` sin verificar que el recurso referenciado pertenezca al gym del token.
**How to apply**: antes de cualquier write con FK del body, hacer `findFirst({ where: { id: body.fkId, gymId: user.gymId } })` y retornar 400 si no existe.

## 5. Endpoints /uploads sin auth para datos privados
Archivos de usuarios (evidencias, avatares privados) sin `preHandler: authenticate` son accesibles públicamente.
**How to apply**: cualquier `/uploads/evidence/`, `/uploads/receipts/` necesita autenticación. Los logos de gym y assets de plataforma pueden ser públicos.

## 6. Rate limit faltante en endpoints de tokens
`/auth/refresh`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` deben tener rate limit estricto.
**How to apply**: usar `authRateLimit` (10 req/15min en prod, 50 en dev) definido en `auth.routes.ts`.
