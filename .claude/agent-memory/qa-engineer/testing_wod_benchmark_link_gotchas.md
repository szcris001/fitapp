---
name: testing_wod_benchmark_link_gotchas
description: Gotchas al testear el link Wod.benchmarkId↔Benchmark (feat/wod-benchmark-link, 2026-10-19) — nunca crear benchmarks oficiales nuevos, resolveBenchmarkId, benchmarkHistory en users
metadata:
  type: feedback
---

# Gotchas de testing: Wod.benchmarkId ↔ Benchmark (feat/wod-benchmark-link)

## NUNCA crear benchmarks oficiales nuevos en tests de otros módulos

`seedBenchmarks.test.ts` cuenta `prisma.benchmark.count({ where: { isOfficial: true,
gymId: null } })` y espera **exactamente 113** (27 GIRL + 10 HERO + 66 OPEN + 10 GAMES).
Vitest en `apps/api` corre archivos de test en paralelo (workers separados) sobre la
misma DB (`vitest.config.ts` solo tiene `sequence.concurrent:false`, que es intra-archivo,
no inter-archivo). Si un test de otro módulo crea un `Benchmark` con
`isOfficial:true, gymId:null` y lo borra en su propio `afterAll`, de todos modos puede
coincidir en el tiempo con una corrida de `seedBenchmarks.test.ts` y hacerle fallar el
conteo exacto (113 o 114).

**Patrón correcto para testear "benchmarkId oficial":** usar uno YA sembrado, nunca crear:
```ts
const official = await prisma.benchmark.findFirst({ where: { isOfficial: true, gymId: null } })
if (!official) throw new Error('No hay benchmarks oficiales — correr el seed antes de este test')
```
Los benchmarks custom (`isOfficial:false`) sí se pueden crear y borrar libremente — no
afectan ese conteo. Confirmado corriendo `DATABASE_ADMIN_URL`: tras seed hay 113, Kelly es
uno de los GIRL (id no fijo entre entornos, por eso `findFirst` y no hardcodear un id).

## resolveBenchmarkId (wod.routes.ts) — contrato exacto a testear

`resolveBenchmarkId(gymId, benchmarkId)`:
- `undefined` (no viene en el body) → `undefined` = no tocar el campo en el `data` de Prisma.
- `null` (explícito) → `null` = desvincula.
- uuid válido de catálogo accesible (`{gymId:null,isOfficial:true} OR {gymId}`) → ese id.
- cualquier otro uuid (random, o de OTRO gym custom) → el string literal `'INVALID'` → la
  ruta responde 404 `{ error: 'Benchmark no encontrado' }` ANTES de tocar la DB (ni crea ni
  actualiza el WOD). Mismo código de error para "no existe" y "existe pero es de otro gym"
  — no hay forma de diferenciar por la respuesta (ni debería, es information disclosure
  evitado a propósito).
- zod rechaza con 400 si el string ni siquiera es un UUID bien formado (`.uuid().nullish()`
  en el schema, antes de llegar a `resolveBenchmarkId`).

**Importante para PUT**: si el `benchmarkId` del body es inválido, la validación ocurre
DESPUÉS de `findFirst` del WOD pero ANTES del `$transaction` que borra/recrea bloques — el
WOD original (título, bloques, benchmarkId previo) queda intacto. Útil para testear "no se
modifica nada si falla la validación cruzada".

## GET /benchmarks y GET /benchmarks/:id — ahora `authenticate`, no `requireCoachOrAdmin`

Un MEMBER ya puede listar y ver detalle del catálogo (antes 403). El filtro de aislamiento
sigue siendo el mismo `OR: [{gymId:null,isOfficial:true},{gymId:user.gymId}]` — un MEMBER
de Gym A pidiendo el detalle de un benchmark custom de Gym B sigue dando 404. El
leaderboard (`/benchmarks/:id/leaderboard`) y el board (`/benchmarks/board`) siguen
`requireCoachOrAdmin`, sin cambios — no asumir que todo el módulo se abrió.

## benchmarkHistory en GET /users/:id (y /users/me, mismo service)

`getUserById` incluye `wodResults` con `where: { wod: { benchmarkId: { not: null } } }` y
los remapea a `benchmarkHistory` (el campo `wodResults` crudo nunca llega a la respuesta —
se destructura y descarta). Un `WodResult` de un WOD sin benchmark NO aparece ahí aunque
exista en DB. `scoreFormatted` reusa `formatScore` de `wod.service.ts` (ahora exportada) —
para un WOD `scoreType:'TIME'` con `score:240` el formato esperado es `'4:00'`.

**Al testear**: crear un ClassType dedicado para el fixture de WOD (no reusar uno de otra
suite) y limpiar en orden: `wodResult` → `wod` → `benchmark` → `classType` (FK). `recordedBy`
en `WodResult` es NOT NULL (FK a User) — usar el propio `memberAId` como `recordedBy` al
insertar directo por Prisma simula "el alumno registró su propio resultado".

## Suites extendidas (no archivos nuevos)

- `apps/api/src/modules/wod/__tests__/wod.integration.test.ts`: dos describes nuevos al
  final — "benchmarkId — link con el catálogo" (8 tests) y "/wod-results/me incluye
  benchmarkName..." (3 tests).
- `apps/api/src/modules/analytics/__tests__/benchmark.integration.test.ts`: describe nuevo
  "catálogo de lectura abierto a MEMBER" (5 tests), reutiliza el `app`/fixtures del archivo
  existente (un solo `Fastify` global, no por-describe como en wod.integration).
- `apps/api/src/modules/users/__tests__/users.integration.test.ts`: describe nuevo
  "benchmarkHistory..." (2 tests) insertado entre Suite 3 y Suite 4.

Ver también [[testing_wod_gotchas]] (orden de cleanup FK, GET /wods/class devuelve array,
my-loads cross-gym) y memoria del architect
`.claude/agent-memory/architect/project_wod_benchmark_link.md` (diseño completo, por qué
`SetNull` y no duplicar en `BenchmarkResult`).
