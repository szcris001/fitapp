---
name: testing_refresh_token_gotchas
description: Gotchas de testing para endpoints de refresh token (POST /auth/refresh, POST /auth/logout)
type: project
---

## Comportamiento exacto (auth.service.ts)

**`revokeRefreshToken(userId, rawToken)`** — siempre retorna `void`, nunca lanza:
- Token no existe → early return silencioso (no-op)
- Token ya revocado (`revokedAt != null`) → early return silencioso (no-op)
- Token de otro usuario (`existing.userId !== userId`) → early return silencioso (no-op)
- Solo revoca si: existe + no revocado + pertenece al userId del JWT

**`rotateRefreshToken(rawToken)`** — lanza Error con mensajes específicos:
- No existe → "Refresh token inválido"
- Revocado (`revokedAt`) → "Refresh token revocado"
- Expirado (`expiresAt < now`) → "Refresh token expirado"
- Éxito → `{ userId, newRaw }` en `$transaction` (atómico: revoca viejo + crea nuevo)

**`POST /auth/logout`** — devuelve **200** (no 204) con `{ message: 'Sesión cerrada correctamente' }`.

## Verificar hash en DB

Los tokens se almacenan hasheados (SHA-256). Para verificar estado en DB desde tests:
```ts
import crypto from 'crypto'
function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}
// Luego:
const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } })
```

## Cleanup en afterAll

`RefreshToken` tiene `onDelete: Cascade` desde `User`. Basta con borrar el usuario y los tokens se borran solos. No hace falta `prisma.refreshToken.deleteMany()` antes de borrar usuarios.

## Casos de cross-user en logout

Cuando User1 hace logout con el refreshToken de User2 → 200, pero el token de User2 NO queda revocado (verificar con `findUnique` o intentando el refresh con el token de User2 → debe devolver 200).

## Buildapp sin hook de preHandler

Para los tests de refresh/logout, el `buildApp()` NO necesita el hook `preHandler` que silencia errores JWT (el que tienen otros tests). El middleware `authenticate` de la ruta ya maneja el 401. El hook solo se necesita si quieres un preHandler global con lógica adicional. Sin el hook, `POST /auth/logout` sin Authorization → 401 directo del middleware.

**Why:** El middleware `authenticate` en `auth.middleware.ts` llama `request.jwtVerify()` y devuelve `reply.status(401)` si falla. El hook global del test existente silencia el error pero no responde — las rutas individuales manejan el 401. Ambos enfoques producen el mismo resultado para estos tests.

**How to apply:** Para tests de refresh/logout, buildApp() mínimo = registro jwt + registro authRoutes. Sin hooks adicionales necesarios.
