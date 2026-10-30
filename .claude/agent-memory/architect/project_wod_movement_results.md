---
name: project_wod_movement_results
description: Diseño desglose por movimiento en WodResult aprobado e implementado 2026-10-29 — columna Json (no tabla nueva), POST /wods/:id/results/me extendido, GET /wods/:id abierto a authenticate
metadata:
  type: project
---

# Diseño: desglose por movimiento en resultado de WOD (2026-10-29)

## Contexto

Cristian probó registrar un resultado de WOD en mobile y pidió poder anotar
qué hizo el alumno en cada movimiento (ej. Barbara: Pull-up 20x5, Push-up
30x5, Sit-up 40x5, Air Squat 50x5), además del total que ya se usaba para
rankear. 3 decisiones cerradas ANTES de este diseño (no reabrir):
1. Mostrar desglose solo si hay >1 movimiento "relevante" = movimientos de
   bloques `type === 'WOD'` ([[project_wod_block_type]]); si el WOD no tiene
   ningún bloque `WOD` (legacy, pre-feature-de-tipos), usar `OTHER` como
   fallback. `WARMUP`/`SKILL_STRENGTH`/`COOLDOWN` nunca cuentan.
2. El total (`score`/`scoreText`) sigue siendo manual, no se calcula desde el
   desglose — el desglose es puramente informativo, no toca
   `formatScore`/leaderboard/ranking.
3. RX/Scaled no cambia en modelo ni leaderboard, solo se oculta del
   formulario del alumno (trabajo de UI, no de este diseño).

## Decisión de modelo: columna Json, no tabla nueva

`WodResult.movementResults Json?` — snapshot libre `[{ movementId,
movementName, value }]`, sin FK real a `WodMovement`. Mismo patrón "snapshot,
no referencia viva" que ya usa este módulo (ver `Wod.benchmarkId` en
[[project_wod_benchmark_link]]): si el coach edita/borra el movimiento
después, el historial del alumno no se rompe ni se actualiza.

**Por qué no tabla relacional**: el desglose no se consulta vía índice, no
participa de ningún cálculo (ranking, formatScore), es puramente informativo.
Si en el futuro se pide analítica/reportes por movimiento (ej. "promedio de
reps en Pull-up de todo el gym"), ahí sí conviene revisar y migrar a tabla
relacional — hoy no hay ese pedido.

Migración `20261029000000_add_wod_result_movement_results` (workaround shadow
DB rota, ver [[project_gym_cascade_delete]]). **Sin cambios de RLS**: columna
nueva en tabla ya protegida (`WodResult` ya tiene `tenant_isolation` keyed en
`gymId`, confirmado contra el `migration.sql` real de
`20260927010000_rls_enforced`, no contra el schema).

## Contrato de API

- `POST /wods/:id/results/me` (único endpoint tocado para escritura, el que
  ya usa el alumno): `memberResultSchema` suma `movementResults?:
  { movementId: string(max 100), movementName: string(max 200), value:
  string(max 500) }[]` (max 50 items). Semántica: **overwrite completo**
  igual que el resto del endpoint (unconditional en `create`/`update`, no
  `...(x !== undefined ? ...)`) — reenviar el form sin `movementResults`
  borra un desglose previamente guardado. Gotcha de Prisma: un `null` literal
  no tipa contra `Json?` generado — hace falta `Prisma.DbNull` (importado de
  `../../generated/prisma`) para limpiar la columna a SQL NULL.
- `GET /wods/:id/results/me` no necesitó cambios de código: `movementResults`
  llega gratis en el `...result` que ya devuelve (sin `select` explícito).
- **Permiso corregido por inconsistencia detectada**: `GET /wods/:id` pasó de
  `requireCoachOrAdmin` a `authenticate`. Era el único de los 3 endpoints de
  lectura de WOD que bloqueaba MEMBER/ATHLETE pese a devolver exactamente los
  mismos campos (`blocks[].movements[]` con `type`) que `GET /wods` y `GET
  /wods/class/:classId` (ambos `authenticate`-only) ya exponían a cualquier
  rol. El alumno lo necesita como fuente del catálogo de movimientos cuando
  llega al formulario sin pasar por `/wods/class/:classId` (ej. desde
  `ProgressScreen`, historial). No expone nada nuevo — mismo dato, mismo gym,
  solo lo nivela con sus hermanos.
- El endpoint del coach (`POST /wods/:id/results`, `PUT
  /wods/:id/results/:userId`) **no** se tocó — fuera del pedido explícito de
  Cristian (solo el self-report del alumno).

## Tests (`wod.integration.test.ts`)

Suite nueva `movementResults`: guardar con desglose + reflejo en GET, guardar
sin desglose (compat hacia atrás), overwrite completo borra desglose previo,
`value` de 501 chars → 400, aislamiento cross-gym (admin de otro gym → 404).
Test viejo de `GET /wods/:id` (`MEMBER → 403`) actualizado a `200` por el
cambio de permiso — es la única regresión de comportamiento esperada y
deliberada de este pase. 110/110 verde en el módulo, `rls.integration.test.ts`
22/22, `tsc --noEmit` limpio.

## Fuera de alcance (Cristian, modo directo)

UI de `MemberWodScreen.tsx`/`LogResultModal` en mobile: ocultar RX/Scaled del
formulario del alumno, armar los inputs por movimiento, resolver la regla
"bloques WOD→fallback OTHER" del lado del cliente (el backend expone
`blocks[].type` y `blocks[].movements[]`, pero cuál bloque usar para el
desglose es una decisión de UI, no del contrato). Nada de `apps/mobile` ni
`apps/web` tocado en este pase.

Ver también [[project_wod_block_type]] (por qué `type === 'WOD'` identifica
el bloque puntuado) y [[project_wod_benchmark_link]] (patrón snapshot/no-FK
ya usado en este módulo).
