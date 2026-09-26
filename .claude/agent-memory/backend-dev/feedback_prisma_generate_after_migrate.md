---
name: prisma_generate_after_migrate
description: prisma migrate dev no siempre regenera el client automáticamente en este proyecto — hay que correr prisma generate explícitamente cuando el build falla con "Property X does not exist on type PrismaClient"
type: feedback
---

Cuando se corre `prisma migrate dev` y luego `pnpm build` inmediatamente, el cliente Prisma puede no haberse regenerado aún y TypeScript lanza errores del tipo `Property 'refreshToken' does not exist on type 'PrismaClient'`.

**Why:** La configuración de `prisma.config.ts` y el output custom en `src/generated/prisma` puede no activar la regeneración automática en todos los entornos.

**How to apply:** Después de cualquier `prisma migrate dev` que agregue modelos nuevos, correr `pnpm prisma generate` explícitamente antes de `pnpm build` si aparecen errores de tipo en el cliente Prisma.
