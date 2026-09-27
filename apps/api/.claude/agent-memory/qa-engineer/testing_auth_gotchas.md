---
name: Auth Testing Gotchas
description: Comportamientos reales de auth que los tests confirmaron — paths superadmin vs gym, gym suspendido, cleanup de DB
type: project
---

Hallazgos confirmados por los tests de integración de auth (2026-04-30, 18/18 passing, 0 bugs):

1. **Dos paths de login completamente separados**. Sin `gymSlug` → busca solo `SUPER_ADMIN` en toda la DB. Con `gymSlug` → busca usuario dentro del gym. Un ADMIN de gym NO puede loguearse en el path de superadmin aunque use las mismas credenciales.

2. **Gym SUSPENDIDO rechaza login con 401**. El mensaje es "Este gimnasio está suspendido". Se lanza antes de verificar credenciales del usuario, en `auth.service.ts:57`.

3. **El JWT devuelto por login incluye**: `userId`, `gymId` (null para superadmin), `email`, `name`, `role`, `avatarUrl` (solo gym path), `mustChangePassword`. No incluye `passwordHash` ni ningún campo sensible.

4. **El campo `gymId` en el JWT es `null` para SUPER_ADMIN** (no ausente, sino explícitamente null). Esto importa para tests de multi-tenancy: el middleware `requireActiveGym` hace `if (!user?.gymId || user.role === 'SUPER_ADMIN') return` — superadmin nunca es bloqueado por gym suspendido.

5. **Tokens expirados**: `app.jwt.sign({...}, { expiresIn: -1 })` genera un token expirado válido para tests. `GET /api/auth/me` devuelve 401 con `{ error: 'Token inválido o expirado' }`.

6. **Cleanup de DB**: el `@@unique([gymId, email])` en el modelo User requiere borrar por `id` en cleanup, no por email+gymId, para evitar conflictos con runs paralelos. La estrategia `deleteMany({ where: { id: { in: [...ids] } } })` es segura.

7. **El hook `preHandler` de `index.ts`** intenta `jwtVerify()` para todos los requests `/api/` con `Authorization`. Si falla, no responde 401 — deja que la ruta individual lo maneje. Esto significa que la `buildApp()` de tests puede simplificarse: no necesita replicar el hook completo de `requireActiveGym`.

**Why:** Confirmado con 18 tests contra DB real en fitapp_dev.
**How to apply:** Usar este conocimiento al diseñar tests de multi-tenancy y otros módulos que dependan de auth.
