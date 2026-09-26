---
name: rls-state-fitapp
description: Estado del Row Level Security en PostgreSQL para FitApp — qué tablas tienen RLS, cuáles faltan, y el pendiente crítico del middleware Fastify
metadata:
  type: project
---

# Estado del RLS PostgreSQL — FitApp

**Última verificación**: 2026-06-25

## Migraciones RLS existentes

1. `20260616000000_enable_rls` — RLS en: User, Plan, ClassType, Class, Wod, GymSkill, FintocLink, BankMovement, WodResult, Benchmark
2. `20260625000000_rls_missing_tables` — RLS en: Membership, Booking, RmRecord, GymnasticProgress, GymSkillMilestone, WodBlock, WodMovement, BenchmarkResult

## Total tablas con RLS (18 al 2026-06-25)

Con gymId directo: User, Plan, ClassType, Class, Wod, GymSkill, FintocLink, BankMovement, WodResult, Benchmark, BenchmarkResult
Con gymId via join (subquery en policy): Membership, Booking, RmRecord, GymnasticProgress, GymSkillMilestone, WodBlock, WodMovement

## Tablas globales (sin RLS, correcto)
Gym, Movement (catálogo global), FitAppPlan, PlatformSettings, PlatformAsset, EmailTemplate, GymSubscription, GymSubscriptionPayment, PasswordResetToken, RefreshToken, Benchmark (con gymId=null para oficiales)

## PENDIENTE CRÍTICO (sin resolver)
El RLS no actúa porque NINGÚN middleware llama `SET LOCAL app.current_gym_id = $gymId` antes de las queries.
La policy USING hace `current_setting('app.current_gym_id', TRUE)` que devuelve NULL si no se setea.
Con NULL, la condición `"gymId" = NULL` es siempre FALSE — el RLS bloquearía TODAS las queries normales.
La policy tiene escape: `current_setting('app.bypass_rls', TRUE) = 'true'` y `pg_has_role(current_user, 'fitapp_superadmin', 'member')`.
Sin el middleware, el RLS actúa como capa de rechazo total (no como filtro). Por eso las queries funcionan (el DB user tiene el role fitapp_superadmin que bypasea el RLS).

**Para que el RLS sea una defensa real**: implementar middleware en Fastify que ejecute `prisma.$executeRaw\`SELECT set_config('app.current_gym_id', ${gymId}, TRUE)\`` después de verificar el JWT en cada request autenticado con gymId.

**Why**: el RLS es defensa en profundidad, no el control primario. Sin el middleware, es inerte pero no causa daño porque el control primario (gymId en queries Prisma) sigue funcionando.
