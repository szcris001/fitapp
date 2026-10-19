---
name: project_wod_benchmark_link
description: Diseño Benchmark↔Wod aprobado 2026-10-19 — Wod.benchmarkId, historial de progreso vía join (sin duplicar en BenchmarkResult), permisos de lectura de catálogo abiertos
metadata:
  type: project
---

# Diseño: conectar Benchmark con WOD, resultado = progreso del alumno (aprobado 2026-10-19)

## Contexto / problema

`Wod`/`WodBlock`/`WodMovement`/`WodResult` (el WOD del día de una clase) y
`Benchmark`/`BenchmarkMovement`/`BenchmarkResult` (catálogo oficial + logging
ad-hoc del alumno) estaban totalmente desconectados. El editor web
(`ClassDetail.tsx` función `applyBenchmark`, línea ~349) solo copiaba texto al
form del WOD — una vez guardado no quedaba ningún rastro de que ese WOD vino de
"Fran". Encontrado investigando por qué un alumno no podía ver el listado de
benchmarks: `GET /benchmarks`/`GET /benchmarks/:id` eran `requireCoachOrAdmin`,
y la pantalla mobile `BenchmarksScreen.tsx` nunca se conectó a
`AppNavigator.tsx` (huérfana).

Pedido explícito de Cristian (verbatim, importante no reinterpretar): cuando un
alumno hace en clase un WOD basado en un benchmark, el resultado "pasa a ser
historia del progreso del alumno, no del wod, de la clase, ni del propio
benchmark" — mismo espíritu que `RmRecord`/`GymnasticProgress`/`PillarAward`
(registros per-user ya existentes). El WOD/clase/benchmark son solo
contexto/procedencia, nunca el dueño del dato.

## Modelo de datos (YA APLICADO en DB local)

- `Wod.benchmarkId String?` — FK a `Benchmark`, `onDelete: SetNull`.
  **Por qué SetNull y no Cascade/Restrict**: si se borra un benchmark custom
  del gym, el WOD ya planificado y los `WodResult` de los alumnos que ya lo
  corrieron NO deben desaparecer ni bloquear el borrado del benchmark — esa
  historia ya es del alumno, no del benchmark.
- `Benchmark.wods Wod[]` — relación inversa.
- `WodResult` gana `@@index([gymId, userId])` — la query de "mi historial"
  (`GET /wod-results/me`, y el nuevo include en `GET /users/:id`) filtraba por
  userId+gymId sin índice dedicado.
- Migración `20261019000000_add_wod_benchmark_link` en
  `apps/api/prisma/migrations/` — generada con el workaround documentado en
  [[project_gym_cascade_delete]] (`prisma migrate diff --from-config-datasource
  --to-schema prisma/schema.prisma --script` + escribir a mano + `migrate
  deploy`, NO `migrate dev`, shadow DB rota desde `20260927010000_rls_enforced`).
  **Aplicada y verificada**: `migrate diff` queda vacío después, policy
  `tenant_isolation` de `"Wod"` confirmada intacta vía `pg_get_expr` (no
  necesitó cambios — ya es `gymId = current_gym_id()` sin importar la columna
  nueva). No se tocó RLS de `Benchmark`/`BenchmarkResult`/`BenchmarkMovement`
  (ya estaban correctas: `Benchmark` permite `gymId IS NULL OR gymId =
  current_gym_id()`, hijas via EXISTS al padre).

## Decisión clave: NO duplicar en BenchmarkResult

El historial de progreso de benchmarks del alumno se lee vía join
`WodResult → Wod → Benchmark`, sin tabla nueva ni duplicación. `WodResult` ya
es un registro per-user (`userId` FK) — es la misma fila que ya era "del
alumno", solo le faltaba la trazabilidad hacia el benchmark de origen.

`BenchmarkResult`/`POST /benchmarks/:id/result` (logging ad-hoc, sin clase
asociada) **se mantienen sin cambios** — siguen siendo el camino para "el
alumno hizo el benchmark por su cuenta, fuera de una clase programada", y
siguen alimentando la Pizarra/TV del gym (`GET /benchmarks/board`,
`GET /benchmarks/:id/leaderboard`, usados en `apps/web/app/dashboard/wods/page.tsx`
y `apps/web/app/dashboard/wods/tv/page.tsx` — features vivas, no se tocan).

**Gap conocido y documentado a propósito, NO resuelto en este diseño**: el
Board/TV sigue leyendo solo de `BenchmarkResult` — un benchmark hecho en una
clase programada (vía `WodResult` con `wod.benchmarkId` set) no aparece ahí.
Unificar ambas fuentes (dedupear "mejor marca por usuario" entre dos tablas)
es un cambio de servicio aparte que no fue pedido en este pase. Si Cristian lo
pide después, diseñar ahí mismo — no adelantarlo.

## Endpoints que cambian

- `POST /wods` / `PUT /wods/:id` (COACH|ADMIN): nuevo `benchmarkId?: string | null`
  en el body. Validar SIEMPRE contra el catálogo (`{gymId:null,isOfficial:true}
  OR {gymId:user.gymId}`) antes de persistir — nunca confiar en que el id del
  body "se ve bien" (mismo patrón que validar `coachId`/`classTypeId` de otros
  módulos). `undefined` = no tocar: `null` = desvincular explícito.
- `GET /wods`, `GET /wods/:id`, `GET /wods/class/:classId`: el include
  compartido `includeBlocks` (en `wod.service.ts`) suma
  `benchmark: { select: { id, nombre, categoria } }` — cambio additivo, no
  rompe nada existente.
- `GET /wod-results/me` y `GET /wods/:id/results/me` (authenticate): suman
  `benchmarkId`, `benchmarkName`, `benchmarkCategory` (nullable) a la
  respuesta, leídos del `wod.benchmark` incluido.
- `GET /users/:id` (`users.service.ts getUserById`, también usado por
  `GET /users/me`): nuevo campo `benchmarkHistory` — `WodResult` del usuario
  donde `wod.benchmarkId != null`, con `scoreFormatted` (reusa `formatScore`).
- `GET /benchmarks` y `GET /benchmarks/:id`: permiso bajado de
  `requireCoachOrAdmin` a `authenticate` — mismo patrón que `GET /movements`
  (catálogo de lectura, no sensible). Leaderboard/board de benchmarks quedan
  coach/admin-only, sin cambios (ranking no público).

## Refactor menor incluido

`formatScore`/`computeRank` vivían como funciones privadas en
`wod.routes.ts` (violación menor de "lógica de negocio fuera de routes").
Se mueven a `wod.service.ts` (exportadas) para reusarlas en
`users.service.ts` sin duplicar la lógica de formateo de score.

## Archivos a tocar (implementación, no hecha — solo schema/migración)

- `apps/api/prisma/schema.prisma` — HECHO.
- `apps/api/prisma/migrations/20261019000000_add_wod_benchmark_link/` — HECHO y aplicado.
- `apps/api/src/modules/wod/wod.service.ts` — extender `includeBlocks`, mover `formatScore`/`computeRank` acá.
- `apps/api/src/modules/wod/wod.routes.ts` — zod schemas + validación de `benchmarkId` en create/update, importar formatScore/computeRank, extender `GET /wod-results/me` y `GET /wods/:id/results/me`.
- `apps/api/src/modules/analytics/benchmark.routes.ts` — permiso de `GET /benchmarks` y `GET /benchmarks/:id`.
- `apps/api/src/modules/users/users.service.ts` — `getUserById`: include + mapeo de `benchmarkHistory`.
- `apps/web/app/dashboard/classes/_components/ClassDetail.tsx` — `form.benchmarkId`, `applyBenchmark` lo setea, `save()` lo manda.
- `apps/web/app/dashboard/users/[id]/page.tsx` — nueva sección en el bloque "Progreso y reconocimientos" (línea ~1026) con `member.benchmarkHistory`.
- `apps/mobile/src/screens/ProgressScreen.tsx` — usar `benchmarkName`/`benchmarkCategory` del `/wod-results/me` ya consumido (tab "Resultados", línea ~446).
- NO tocar en este pase: `apps/mobile/src/screens/BenchmarksScreen.tsx`, `apps/mobile/src/navigation/AppNavigator.tsx`, `GET /benchmarks/board`, `GET /benchmarks/:id/leaderboard`.

Ver también [[project_gym_cascade_delete]] (workaround de migraciones, patrón
`onDelete` razonado) y [[project_wod_results_design]] (diseño original de
`WodResult`/`formatScore`/leaderboard que este diseño extiende).
