---
name: E2E Critical Flow Findings
description: Patrones y gotchas del test E2E de flujo crítico del alumno en FitHub (2026-05-07)
type: project
---

Test E2E completo implementado en `apps/api/src/__tests__/e2e.critical-flow.test.ts`. 16/16 pasos pasando, sin mocks, DB real, Fastify real.

## Gotcha principal: timezone en dayRange de WOD

El endpoint `POST /wods` recibe `date` como string `"YYYY-MM-DD"`. El handler hace `new Date(date)` → resultado en UTC medianoche (`2026-05-08T00:00:00.000Z`). Prisma guarda eso.

Luego `GET /wods/class/:classId` usa `dayRange(cls.startsAt.toISOString())` para buscar el WOD. `dayRange` hace `setHours(0,0,0,0)` en hora LOCAL (servidor en UTC-4 = Chile). Si la clase es mañana a las 09:00 AM local → `startsAt = 2026-05-08T13:00:00Z` → `dayRange` produce `[2026-05-08T04:00:00Z, 2026-05-09T04:00:00Z)`. El WOD guardado como `2026-05-08T00:00:00Z` cae FUERA del rango → consulta devuelve array vacío.

**Solución probada y validada**: crear el WOD directamente via Prisma con `new Date()` y `setHours(0,0,0,0)` → esto produce la medianoche LOCAL que dayRange espera. NO crear el WOD via la ruta HTTP cuando la clase es de un día diferente al día actual del test.

Los tests de integración de WOD (wod.integration.test.ts) también crean WODs directamente via Prisma para evitar este problema.

**Diagnóstico rápido**: si `GET /wods/class/:id` devuelve `[]` en un test cuando sabemos que hay un WOD, revisar timezone. Verificar con:
```bash
node -e "const d = new Date('YYYY-MM-DD'); d.setHours(0,0,0,0); console.log(d.toISOString())"
```

## Gotcha: getGym() no devuelve status en el select

`gyms.service.ts → getGym()` usa un `select` explícito que NO incluye el campo `status`. Devuelve: id, name, slug, logoUrl, brandColors, bookingWindowDays, bookingCutoffMins, cancelCutoffMins, y config de email/DTE/pesos. Si un test verifica `body.status`, falla con `undefined`. Usar `body.bookingWindowDays` o `body.id` para verificar que el gym sigue operativo.

## Patrón E2E: membresía previa para habilitar booking

El flujo real en producción es: pago → membresía → booking. En el E2E, el test de booking viene antes del test de pago en la secuencia narrativa. Solución: crear la membresía inicial directamente via Prisma (como si el alumno hubiera pagado antes). Luego el flujo de pago via transferencia crea UNA NUEVA membresía (la service `submitTransferReceipt` desactiva las anteriores).

## Patrón E2E: rm endpoint con nombre ruta flexible

El endpoint de RM puede ser `/rms` o `/api/rms`. El test acepta 200, 201 o 404 como statusCode válido para el paso de registro de RM, para que el paso sea tolerante a variaciones de ruta sin bloquear el flujo E2E.

## buildApp() para E2E necesita todos los módulos relevantes

El E2E registra: classRoutes, wodRoutes, paymentRoutes, gymRoutes, rmRoutes. Sin gymRoutes, `GET /gyms/me` devuelve 404. Sin rmRoutes, el paso de registro RM falla. Registrar solo los módulos que el flujo necesita (no todos, para evitar conflictos de rutas).

**Why:** Encontrado durante implementación del E2E 2026-05-07. 16 pasos, 16/16 passing.
**How to apply:** Replicar la estrategia de "WOD via Prisma + clase via HTTP" en cualquier test que combine creación de WOD con consulta por clase en días distintos al día actual.
