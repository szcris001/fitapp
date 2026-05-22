---
name: buildApp() Pattern para Integration Tests Fastify
description: Patrón validado para construir app Fastify mínima en tests de integración sin levantar puerto
type: feedback
---

El patrón `buildApp()` que funciona en FitHub para integration tests de Fastify:

```typescript
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })  // logger: false evita ruido en test output

  // JWT con mismo secret que la app real (desde process.env o fallback)
  await app.register(jwt, { secret: process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion' })

  // Registrar SOLO los módulos que se van a testear (no toda la app)
  await app.register(authRoutes, { prefix: '/api' })

  await app.ready()  // await ready() es obligatorio antes de inject()
  return app
}
```

Reglas clave:
- `logger: false` — evita que vitest ahogue el output con logs de Fastify
- Registrar `@fastify/jwt` con `await` (es async)
- Llamar `await app.ready()` antes de usar `app.inject()`
- NO registrar toda la app (evitar efectos secundarios de cron jobs, ensureSystemTemplates, etc.)
- Cerrar la app en `afterAll` con `await app.close()`

Para probar rutas que necesitan el hook `requireActiveGym`, incluirlo solo si el test lo necesita explícitamente.

**Why:** Patrón validado con 18 tests pasando. Sin él, los tests de inject() fallaban silenciosamente.
**How to apply:** Replicar este patrón para otros módulos (classes, plans, users, etc.) en sus propias suites de integración.
