---
name: project_gym_cascade_delete
description: Diseño del borrado permanente en cascada de Gym aprobado 2026-10-04 (branch fix/class-types-import-disciplines, luego PR separado) — 19 FKs pasadas a onDelete Cascade
metadata:
  type: project
---

Diseño aprobado 2026-10-04 para que `DELETE /superadmin/gyms/:id/permanent`
(`apps/api/src/modules/superadmin/superadmin.routes.ts`) funcione de verdad:
`prisma.gym.delete` fallaba siempre con 400 ("existe una referencia relacionada")
porque la mayoría de las FKs hacia `Gym`/`User`/`Plan` eran `RESTRICT` (o
`SET NULL` para las opcionales `User.gymId` y `Benchmark.gymId`) por default de
Prisma, y todo gym del flujo normal tiene al menos un ADMIN.

**Cambio**: se pasaron 19 relaciones a `onDelete: Cascade` en
`apps/api/prisma/schema.prisma` — migración `20261004000000_add_gym_cascade_delete`:
- Directas a Gym (gymId propio, antes RESTRICT): `User.gym` (antes SET NULL, es
  opcional pero se fuerza Cascade a propósito — ver razón abajo), `Plan.gym`,
  `ClassType.gym`, `Class.gym`, `Wod.gym`, `GymSkill.gym`, `GymSubscription.gym`,
  `GymSubscriptionPayment.gym`, `FintocLink.gym`, `BankMovement.gym`,
  `WodResult.gym`, `FintocPaymentIntent.gym`, `Benchmark.gym` (antes SET NULL,
  opcional).
- Sin gymId propio, cascadean vía User/Plan/Class: `Booking.user`,
  `Booking.class`, `RmRecord.user`, `GymnasticProgress.user`,
  `Membership.user`, `Membership.plan`.

**Por qué `User.gym` se fuerza a Cascade en vez de dejar el SET NULL que ya
tenía**: dejarlo en SET NULL convertiría a los usuarios del gym borrado en
usuarios "flotantes" con `gymId: null` — ese valor normalmente solo lo tiene un
`SUPER_ADMIN` global. Un `ADMIN`/`COACH`/`MEMBER` con `gymId: null` es un estado
inválido que rompe los chequeos de [[security_rules]] (`user.gymId` de un
SUPER_ADMIN se asume no-null tras switch-sede; un ADMIN con gymId null nunca se
contempló). Decisión: estos usuarios deben desaparecer con su gym, no quedar
huérfanos.

**Razonamiento "diamante" (clave para no sobre-agregar Cascade)**: cuando
Postgres resuelve `DELETE FROM "Gym" WHERE id = X`, cascadea TODAS las FKs
directas a Gym en la misma operación. Si una tabla (ej. `Class`) ya desaparece
por su propio `gymId → Gym` Cascade, NO hace falta que sus otras FKs
(`Class.coachId → User`, `Class.classTypeId → ClassType`) también sean Cascade
— para cuando Postgres valida esas constraints, la fila de `Class` ya no
existe. Por esto NO se tocaron: `Class.coach`, `Class.classType`,
`Wod.classType`, `WodResult.user`, `WodResult.recordedByUser`,
`BankMovement.link` (FintocLink), `BankMovement.membership`,
`GymSubscriptionPayment.subscription`. Todas esas tablas ya desaparecen por su
propio camino directo (o vía User/Plan) hacia Gym dentro de la misma operación.

**Verificado contra las migraciones reales antes de tocar nada** (no solo
contra el schema): se confirmó con `grep` en `prisma/migrations/*/migration.sql`
que efectivamente estaban en `RESTRICT`/`SET NULL` como se esperaba — evita
asumir el default de Prisma sin chequear qué quedó realmente en la base.

**Problema de infra encontrado — shadow database rota desde la migración RLS**:
`prisma migrate dev` (y por lo tanto `--create-only`) falla SIEMPRE con P3006
al intentar aplicar `20260927010000_rls_enforced` contra la shadow database
efímera, porque esa migración tiene `REVOKE ALL ON TABLE "_prisma_migrations"
FROM fitapp_app` y la tabla de tracking no existe (o no es visible) en el
contexto de replay de la shadow db. Esto bloquea `migrate dev` para CUALQUIER
migración nueva desde esa fecha en adelante, para cualquier desarrollador.
**Workaround usado** (sin tocar la shadow db ni esa migración): generar el
diff con `prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma --script` (usa `prisma.config.ts` → `DATABASE_ADMIN_URL`,
compara contra el estado real de la DB, no contra la shadow db), escribir el
resultado a mano en una carpeta de migración nueva, y aplicar con `prisma
migrate deploy` (que no usa shadow db). Esto es idéntico en resultado a
`migrate dev` pero sin el bug. Vale la pena documentar este workaround en
CLAUDE.md o en un script — cualquier agente que intente `migrate dev` normal
en este repo después de 2026-09-27 se va a topar con esto.

Ver también [[project_patterns]] (invariantes multi-tenancy) y
[[security_rules]] (gymId de SUPER_ADMIN nunca null sin verificar).
