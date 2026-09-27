---
name: Diseño Refresh Token — módulo auth
description: Decisiones de diseño para implementar refresh tokens en FitHub. Aprobado 2026-05-05.
type: project
---

# Refresh Token — Decisiones de diseño

**Fecha**: 2026-05-05

## Decisiones tomadas

**Almacenamiento**: Tabla nueva `RefreshToken`, no campo en `User`.
**Why:** Un campo en User limita a una sesión por usuario. Ya existe el patrón PasswordResetToken como referencia. La rotación y el multi-device requieren registros independientes por sesión.
**How to apply:** Si se propone un campo en User como alternativa, rechazar con esta justificación.

**Token real vs hash en DB**: Solo se almacena SHA-256 del token. Token en claro solo viaja por red, nunca persiste en DB.
**Why:** Si la DB se expone, los hashes no son directamente utilizables como tokens.
**How to apply:** Cualquier servicio que acceda a RefreshToken debe recibir el token en claro y calcular el hash antes de buscar.

**Rotación**: Activada. Cada uso de refresh invalida el token anterior y emite uno nuevo.
**Why:** Tokens de larga vida (7d) son riesgo si se filtran. Rotación permite detección de reutilización. Costo de implementación es mínimo con Prisma $transaction.
**How to apply:** En POST /auth/refresh, siempre hacer update+create en la misma transacción.

**Expiraciones**: access token 15min (`JWT_EXPIRES_IN=15m`), refresh token 7 días (`REFRESH_TOKEN_EXPIRES_DAYS=7`). Ambos en env vars.
**Why:** 15min es estándar. 7d tiene poca fricción para usuarios diarios de una app de gym. Subir a 30d post-MVP sin cambio de schema.

**Logout idempotente**: POST /auth/logout devuelve 204 incluso si el token ya estaba revocado.
**Why:** Network retries y bugs de cliente no deben mostrar errores al usuario cuando el resultado final es el mismo.

## Schema Prisma

```prisma
model RefreshToken {
  id          String    @id @default(uuid())
  userId      String
  tokenHash   String    @unique
  deviceHint  String?
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}
```

## Endpoints diseñados

- `POST /auth/login` — modificado para devolver `{ token, refreshToken, user }` y crear RefreshToken en DB.
- `POST /auth/refresh` — body: `{ refreshToken }`, response: `{ token, refreshToken }`, sin JWT previo.
- `POST /auth/logout` — body: `{ refreshToken }`, preHandler: authenticate, response: 204.

## Archivos a tocar

1. `apps/api/prisma/schema.prisma` — nueva tabla RefreshToken + relación en User
2. `apps/api/src/modules/auth/auth.service.ts` — createRefreshToken, rotateRefreshToken, revokeRefreshToken
3. `apps/api/src/modules/auth/auth.routes.ts` — login modificado + 2 endpoints nuevos
4. `apps/api/.env` — JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_DAYS
5. `apps/web/store/auth.store.ts` y `lib/api.ts` — guardar refreshToken, interceptor de retry
6. `apps/mobile/src/store/auth.store.ts` y `lib/api.ts` — idem

## Pendiente post-MVP

- Cron job semanal para limpiar tokens expirados en DB
- Endpoint `DELETE /auth/sessions` para revocar todos los tokens de un usuario
- Subir refresh a 30 días si la retención lo justifica
