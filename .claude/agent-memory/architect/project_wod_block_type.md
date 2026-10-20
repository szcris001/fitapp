---
name: project_wod_block_type
description: Diseño WodBlockType aprobado e implementado 2026-10-20 — enum de fase de clase en WodBlock, default OTHER, resuelve bug de applyBenchmark() que pisaba todos los bloques
metadata:
  type: project
---

# Diseño: tipo de bloque en WOD (`WodBlockType`), aprobado 2026-10-20

## Contexto / problema

Cristian compartió la estructura oficial de una clase de CrossFit (fuentes:
CrossFit.com, CrossFit Journal): pizarra/briefing (no se guarda, decisión de
Cristian) → calentamiento → habilidad/fuerza (un solo tipo combinado, no se
separan) → WOD (acá se aplican los benchmarks, ver
[[project_wod_benchmark_link]]) → vuelta a la calma. Los bloques son
**opcionales y libres**: el coach arma los que quiera ese día, el tipo
clasifica, no obliga.

`WodBlock.title` era texto libre — no había forma de que el sistema supiera
cuál bloque ES el WOD. Esto causaba un bug de UX real: `applyBenchmark()` en
`ClassDetail.tsx` hacía `setForm(f => ({ ...f, blocks: [unSoloBloque] }))` —
reemplazaba TODOS los bloques del WOD (borraba calentamiento/fuerza ya
escritos) porque no había manera de apuntar solo al bloque `WOD`.

## Modelo de datos (aplicado en DB local)

- Enum `WodBlockType`: `WARMUP`, `SKILL_STRENGTH`, `WOD`, `COOLDOWN`, `OTHER`.
  Nombres en inglés, consistentes con `WodScoreType`/`BenchmarkCategory` ya
  existentes en el schema.
- `WodBlock.type WodBlockType @default(OTHER)` — **no nullable, con default**
  (no nullable sin default). Elegido así y no nullable porque:
  - cubre los ~cientos de `WodBlock` existentes (todos sin tipo hoy) sin
    backfill manual.
  - cubre los bloques nuevos que el coach deje sin elegir (son opcionales).
  - consistente con el patrón ya usado en `Wod.scoreType WodScoreType
    @default(REPS)` — mismo módulo, misma convención.
- Migración `20261020000000_add_wod_block_type`, generada y aplicada con el
  workaround ya documentado en [[project_gym_cascade_delete]] (`prisma
  migrate diff --from-config-datasource --to-schema prisma/schema.prisma
  --script` + migration.sql a mano + `prisma migrate deploy`, NO `migrate
  dev` — shadow DB rota desde `20260927010000_rls_enforced`). Verificado:
  `migrate diff` queda vacío después.
- **RLS: no necesitó cambios.** Confirmado en la DB real (`pg_get_expr` sobre
  `pg_policy`) que la policy `tenant_isolation` de `"WodBlock"` es un `EXISTS
  (SELECT 1 FROM "Wod" p WHERE p.id = "WodBlock"."wodId")` — no depende de
  ninguna columna propia de `WodBlock`, así que agregar `type` no la afecta.
  Mismo razonamiento que ya se confirmó para `Wod.benchmarkId` en
  [[project_wod_benchmark_link]].

## Contrato de API

- `wodBlockSchema` en `apps/api/src/modules/wod/wod.routes.ts` suma `type:
  z.enum(WodBlockType).default('OTHER')` — opcional en el payload (default
  aplicado por Zod si se omite), mismo espíritu "libre" que el resto de los
  campos del bloque (`title`, `scheme`, `timecap`, `notes` son todos
  nullish).
- `sanitizeBlocks()` (mismo archivo) persiste `type: b.type ?? 'OTHER'` al
  crear los `WodMovement`/`WodBlock` vía `prisma.wod.create`/`update`.
- `POST /wods` y `PUT /wods/:id` son los únicos endpoints que escriben
  bloques (PUT borra y recrea todos los bloques del WOD en una transacción,
  patrón ya existente, no cambiado).
- Lectura: `includeBlocks` (`wod.service.ts`) no cambió — el include ya trae
  todas las columnas del modelo `WodBlock`, así que `type` llega gratis a
  `GET /wods`, `GET /wods/:id`, `GET /wods/class/:classId`, y dentro de cada
  bloque en `GET /wod-results/me` (vía `wod` incluido). Cambio puramente
  additivo, no rompe contratos existentes de web/mobile.
- `apps/api/src/modules/wod/wod.schema.ts` es código muerto (no importado por
  nada, `wod.routes.ts` define sus propios schemas inline) — no se tocó, no
  es parte del contrato real.

## Verificación

- `tsc --noEmit` limpio.
- `wod.integration.test.ts` 79/79 verde, `rls.integration.test.ts` 22/22
  verde, corridos después del cambio (sin regresiones).
- Nota de entorno (no relacionada al diseño): el rol `fitapp_app` local tenía
  el login deshabilitado al momento de correr los tests — se re-habilitó con
  `npx ts-node src/scripts/setup-app-db-role.ts` (idempotente, documentado en
  el propio script). Puede volver a pasar en cualquier sesión local nueva.

## Fuera de alcance (para Cristian, modo directo)

- UI del editor de bloques en
  `apps/web/app/dashboard/classes/_components/ClassDetail.tsx` (selector de
  `type` por bloque).
- **La razón de ser de este diseño**: arreglar `applyBenchmark()` en el mismo
  archivo para que reemplace solo el bloque con `type === 'WOD'` (crearlo si
  no existe) en vez de pisar `blocks` completo.
- UI mobile donde se muestran los bloques de un WOD — ningún archivo mobile
  tocado en este pase.

Ver también [[project_wod_benchmark_link]] (por qué el WOD es el bloque
donde se aplican benchmarks) y [[project_patterns]] (convención de enums +
default en este módulo).
