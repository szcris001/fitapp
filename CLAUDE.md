# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FitApp is a CrossFit/gym management platform — a **pnpm + Turbo monorepo** with three apps:
- `apps/api` — Fastify REST API (Node.js + TypeScript + Prisma + PostgreSQL)
- `apps/web` — Next.js 16 admin dashboard (App Router + Tailwind CSS)
- `apps/mobile` — React Native Expo app for gym members

## Commands

### Root (all apps via Turbo)
```bash
pnpm dev        # Start all dev servers
pnpm build      # Build all apps
pnpm lint       # Lint all apps
```

### API (`apps/api`)
```bash
pnpm dev                                          # nodemon on port 3001
pnpm build                                        # tsc compile
pnpm prisma migrate dev --name "migration_name"   # Create and apply migration
pnpm prisma studio                                # Browse/edit database
```

### Web (`apps/web`)
```bash
pnpm dev    # Next.js on port 3000
pnpm build
pnpm lint
```

### Mobile (`apps/mobile`)
```bash
pnpm start          # Expo dev menu
pnpm android        # Start on Android
pnpm ios            # Start on iOS
```

### Infrastructure
```bash
docker-compose up   # Start PostgreSQL 16 (port 5432) and Redis 7 (port 6379)
```

There is no test framework configured yet.

## Architecture

### API (`apps/api/src/`)

Domain-modular structure under `modules/`:
```
modules/
├── auth/           login, registration
├── users/          user CRUD
├── gyms/           gym management, skills
├── plans/          membership plans
├── classes/        class types, scheduling, bookings
├── wod/            workouts of the day
├── analytics/      RM tracking, AI analysis (Anthropic SDK)
├── payments/       Stripe integration
└── superadmin/     super admin operations
```

Each module has `{domain}.routes.ts` (Fastify routes + Zod validation) and `{domain}.service.ts` (business logic). Routes are registered in `src/index.ts`.

Auth uses `@fastify/jwt`. Roles: `SUPER_ADMIN`, `ADMIN`, `COACH`, `MEMBER`. Custom middleware validates JWT and attaches user to request.

Prisma client is a singleton at `src/lib/prisma.ts`, generated to `src/generated/prisma`.

### Web (`apps/web/`)

Next.js App Router. Key areas:
- `/app/(dashboard)/` — Protected admin/coach routes
- `/app/login/` — Auth page
- `/app/superadmin/` — Super admin panel
- `store/auth.store.ts` — Zustand auth store (persisted to `localStorage`)
- `lib/api.ts` — Axios instance, auto-attaches JWT, redirects on 401

### Mobile (`apps/mobile/src/`)

React Navigation (Stack + Bottom Tabs). Key files:
- `store/auth.store.ts` — Zustand auth store (persisted to AsyncStorage)
- `lib/api.ts` — Axios instance; API URL comes from `EXPO_PUBLIC_API_BASE` (`.env.local`, no versionado — ver `.env.example`), default producción si no está seteada
- Screens in `screens/`

### Shared patterns

Both web and mobile use **Zustand** for auth state and **Axios** for API calls with the same interceptor pattern (attach token, handle 401 logout). Validation uses **Zod** in all three apps.

## Database

PostgreSQL 16 managed by Prisma. Key models: `Gym`, `User`, `Plan`, `Membership`, `ClassType`, `Class`, `Booking`, `Wod`, `WodMovement`, `RmRecord`, `GymnasticProgress`, `GymSkillMilestone`, `GymSkill`.

Migrations live in `apps/api/prisma/migrations/`. Always run `prisma migrate dev` from `apps/api/`.

## Equipo de agentes especializados

`AGENTS.md` (raíz) tiene el detalle completo — originalmente pensado para que Cristian invocara cada agente a mano (`> nombre-agente: ...`). En la práctica, delego yo proactivamente cuando la tarea calza, sin esperar a que se escriba el comando.

**Presupuesto real: Plan Pro, ~3-4 invocaciones de subagente por día.** Priorizar estos 4 casos (son el 90% del uso real, según `AGENTS.md`):
- `architect` — antes de cualquier cambio de esquema Prisma o feature nueva que toque el modelo de datos.
- `qa-engineer` — después de cerrar una feature, para tests de zonas de riesgo (multi-tenancy, cálculos críticos, pagos). Mantiene `QUALITY.md`.
- `security` — obligatorio antes de cada deploy a producción, o al agregar endpoints públicos / cambiar auth.
- `payments-specialist` — único autorizado a tocar `apps/api/src/modules/payments` (pasarelas, webhooks, conciliación Fintoc).

El resto (`backend-dev`, `web-dev`, `mobile-dev`, `product-owner`, `devops`) son excepcionales. La mayoría de las features de este repo tocan api+web+mobile en el mismo PR (`feat(api,web,mobile): ...`) — para esas, `architect` diseña si hay esquema nuevo y el resto (api, web, mobile) se implementa en **modo directo** en la misma sesión, no una invocación por plataforma. Reservar `backend-dev`/`web-dev`/`mobile-dev` solo para algo grande y aislado en una sola plataforma (ej. rediseño completo de una pantalla mobile, sin tocar api ni web). Un bug fix, un componente nuevo, o implementar un diseño ya aprobado también es modo directo.

Si ya van 3-4 invocaciones de subagente en la sesión/día, avisar antes de sumar una más en vez de seguir de largo sin decir nada.

**Tras cada PR mergeado a `master`**: agregar una entrada corta a `STATE.md` (qué se hizo, qué módulos/archivos, quién lo hizo — modo directo o qué agente). Es el único archivo pensado para sobrevivir entre sesiones de Claude Code — si no se actualiza, la próxima sesión arranca ciega.

## Reglas de Seguridad Obligatorias

Estas reglas aplican a **todos los agentes** que toquen código de la API. Violarlas es un bug de seguridad, no un bug de negocio.

### Multi-tenancy — REGLA NÚMERO 1

**Toda query Prisma en `apps/api/src/modules/` DEBE incluir `gymId` en el `where`.**

```typescript
// ✅ CORRECTO
prisma.user.findMany({ where: { gymId: user.gymId, ... } })

// ❌ INCORRECTO — expone datos de todos los gyms
prisma.user.findMany({ where: { email } })
```

Excepción: `auth/`, `superadmin/`, y tablas globales (`Gym`, `Movement`).

Verificar antes de cada PR:
```bash
grep -rn "prisma\.\(findMany\|findFirst\|update\|delete\)" apps/api/src/modules/ | grep -v "gymId\|userId\|superadmin\|auth"
```
Cualquier resultado es un bug de seguridad.

### Row Level Security — defensa en profundidad

RLS está aplicado en PostgreSQL (detalle: `docs/SECURITY.md` §7). No reemplaza la regla anterior.
- La app se conecta como `fitapp_app` (sin superusuario ni BYPASSRLS). Migraciones, seeds y scripts de admin usan `DATABASE_ADMIN_URL`.
- Cada request autenticado con gym corre sus queries con ese gym (`lib/tenant-hook.ts` + `TenantAwarePool` en `lib/prisma.ts`). Código de sistema sin request (cron, webhooks, callbacks, login) corre en bypass.
- **Tabla nueva con datos de un gym** → en la misma migración: `ENABLE`/`FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation` (ver `20260927010000_rls_enforced`) + caso en `src/lib/__tests__/rls.integration.test.ts`.
- Las queries de Prisma son perezosas: si se arma una query fuera del request y se ejecuta después, corre con el contexto del `await`, no con el de su creación.

Setup local tras `docker-compose up`: `pnpm prisma migrate deploy` y `npx ts-node src/scripts/setup-app-db-role.ts` (en `apps/api`).

### Autenticación en endpoints

- **Todo endpoint** de negocio debe tener `{ preHandler: authenticate }` o un middleware más restrictivo.
- **Archivos estáticos** (`/uploads/`, evidencias, avatares) **no son públicos** — deben validar JWT.
  - Para `<img src>` (no envía headers) usar el **token de medios**: `authenticateMedia` en la API y `mediaUrl(path)` en web/mobile. Ese token (`scope: 'media'`) solo sirve para `/uploads`; `authenticate` lo rechaza.
  - Única excepción pública: `/uploads/assets/` (assets de plataforma, se ven antes del login).
- Nunca asumir que una URL de archivo es secreta por ser larga o aleatoria.

### Parámetros del body vs JWT

**Nunca usar `gymId` o `userId` que vengan del body/params del cliente para autorizar acceso.**

```typescript
// ✅ CORRECTO — gymId del JWT, no del cliente
const gymId = request.user.gymId

// ❌ INCORRECTO — el cliente controla a qué gym accede
const gymId = request.body.gymId
```

Si el body incluye `coachId`, `classTypeId`, `planId` u otros IDs de recursos, **siempre verificar** que pertenecen al mismo `gymId`:
```typescript
const coach = await prisma.user.findFirst({ where: { id: body.coachId, gymId: user.gymId } })
if (!coach) return reply.status(403).send({ error: 'No autorizado' })
```

### JWT

- Todo `jwt.sign()` **DEBE incluir `expiresIn`**. Sin expiración = token eterno = riesgo crítico.
- El token solo lleva: `{ userId, gymId, role }`. Sin datos sensibles.

### Servir archivos estáticos

Usar siempre la función `safeResolvePath(base, filename)` de `src/lib/safe-path.ts`:
```typescript
// ✅ CORRECTO
const filePath = safeResolvePath(uploadsDir, filename)

// ❌ INCORRECTO — path traversal: ../../.env
const filePath = path.join(uploadsDir, filename)
```

### SUPER_ADMIN

- `requireAdmin` acepta SUPER_ADMIN pero **solo cuando tiene `gymId` en el JWT** (post switch-sede).
- SUPER_ADMIN con `gymId: null` solo puede acceder a rutas `/superadmin/*`.
- Nunca usar `user.gymId` de un SUPER_ADMIN sin verificar que no es `null`.

### Rate limiting en auth

Los endpoints `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh` deben tener `authRateLimit` aplicado. No agregar nuevos endpoints de auth sin rate limit.

---



**`apps/api/.env`**
```
DATABASE_ADMIN_URL="postgresql://fitapp:fitapp123@localhost:5432/fitapp_dev"   # migraciones, seeds
DATABASE_URL="postgresql://fitapp_app:<APP_DB_PASSWORD>@localhost:5432/fitapp_dev" # la app (sujeta a RLS)
APP_DB_PASSWORD="..."
JWT_SECRET="..."
PORT=3001
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
FRONTEND_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."
```

**`apps/web/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```
