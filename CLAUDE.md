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
- `lib/api.ts` — Axios instance; **API URL is hardcoded** to a local network IP — update for your environment
- Screens in `screens/`

### Shared patterns

Both web and mobile use **Zustand** for auth state and **Axios** for API calls with the same interceptor pattern (attach token, handle 401 logout). Validation uses **Zod** in all three apps.

## Database

PostgreSQL 16 managed by Prisma. Key models: `Gym`, `User`, `Plan`, `Membership`, `ClassType`, `Class`, `Booking`, `Wod`, `WodMovement`, `RmRecord`, `GymnasticProgress`, `GymSkillMilestone`, `GymSkill`.

Migrations live in `apps/api/prisma/migrations/`. Always run `prisma migrate dev` from `apps/api/`.

## Environment Variables

**`apps/api/.env`**
```
DATABASE_URL="postgresql://fitapp:fitapp123@localhost:5432/fitapp_dev"
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
