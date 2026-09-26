---
name: project_wod_results_design
description: Diseño WOD Results + Leaderboard aprobado 2026-06-11. Enum WodScoreType, tabla WodResult, 4 endpoints, lógica formatScore en service.
metadata:
  type: project
---

# Diseño: WOD Results + Leaderboard (aprobado 2026-06-11)

## Modelo de datos

**Enum nuevo**: `WodScoreType { TIME REPS WEIGHT ROUNDS CUSTOM }`

**Campo nuevo en `Wod`**: `scoreType WodScoreType @default(REPS)`

**Tabla nueva `WodResult`**:
- `id` uuid PK
- `gymId` FK Gym (multi-tenancy)
- `wodId` FK Wod (onDelete: Cascade)
- `userId` FK User (el atleta)
- `score Float @default(0)` — segundos para TIME, reps, kg, o rounds.decimals para ROUNDS
- `scoreText String?` — solo para CUSTOM
- `rx Boolean @default(true)` — true = Rx, false = Scaled
- `notes String?`
- `recordedBy String` — FK User (el coach que registró)
- `@@unique([wodId, userId])` — un resultado por atleta por WOD
- `@@index([gymId, wodId])`
- `@@index([wodId, rx, score])`

Relaciones a agregar en User: `wodResults WodResult[]` + `wodResultsRecorded WodResult[] @relation("WodResultRecordedBy")`
Relaciones a agregar en Gym: `wodResults WodResult[]`
Relaciones a agregar en Wod: `results WodResult[]`

**Migración**: `add_wod_results_and_score_type`

## Endpoints

- `POST /wods/:id/results` — COACH|ADMIN. Body: {userId, score, scoreText?, rx, notes?}. 409 si ya existe. 404 si userId no es del mismo gym.
- `GET /wods/:id/leaderboard` — cualquier rol autenticado. Query: `?rx=all|true|false`. Response incluye rank, scoreFormatted.
- `PUT /wods/:id/results/:userId` — COACH|ADMIN
- `DELETE /wods/:id/results/:userId` — COACH|ADMIN

## Invariantes de negocio

- `gymId` del WodResult se propaga desde el Wod (ya filtrado por gymId del JWT), nunca del body.
- `userId` en el resultado se valida con `findFirst({ where: { id: userId, gymId } })` antes de insertar. Sin esto un coach podría registrar resultados para atletas de otro gym.
- Ordenación del leaderboard: RX primero, luego Scaled. Dentro de cada grupo: TIME ASC, resto DESC. El `rank` se reinicia en 1 al cambiar de grupo.
- Convención ROUNDS: `score = 5.12` significa 5 rounds + 12 reps. Service valida que parte decimal × 100 <= 99.

## formatScore (lógica en service)

| scoreType | input | output |
|---|---|---|
| TIME | 225 | "3:45" |
| REPS | 87 | "87 reps" |
| WEIGHT | 150 | "150 kg" |
| ROUNDS | 5.12 | "5+12" |
| CUSTOM | 0 + scoreText="DNF" | "DNF" |

## Archivos a tocar

- `prisma/schema.prisma` — enum + campo + modelo + relaciones
- `apps/api/src/modules/wod/wod.schema.ts` — nuevo archivo (4 schemas Zod)
- `apps/api/src/modules/wod/wod.routes.ts` — 4 endpoints nuevos + extensión PUT /wods/:id con scoreType
- `apps/api/src/modules/wod/wod.service.ts` — 4 funciones nuevas + formatScore
- `apps/api/src/modules/wod/__tests__/wod-results.integration.test.ts` — nuevo archivo de tests

## Orden de invocación

1. backend-dev (migración + schema Zod + routes + service)
2. web-dev + mobile-dev en paralelo (UI)
3. qa-engineer (tests integración)

**Why:** El módulo WOD ya existía completo (71 tests) pero sin forma de registrar resultados de atletas. Es la funcionalidad central para que un gym compare rendimiento entre atletas.
**How to apply:** Al diseñar extensiones del módulo WOD, respetar el archivo `wod.schema.ts` como único punto de verdad de los schemas Zod exportados.
