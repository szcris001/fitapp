---
name: seed_benchmarks_findings
description: Hallazgos al testear seed de benchmarks de CrossFit — idempotencia confirmada, gotcha de Prisma con OR+null en campos no-nullable
type: feedback
---

# Seed benchmarks — hallazgos de testing

## Resultado
El seed (prisma/seed.ts) es correcto e idempotente. No hay bug de duplicación. Usa `externalId` como clave de upsert manual (findUnique → create/update). 113 benchmarks: 27 GIRL + 10 HERO + 66 OPEN + 10 GAMES.

## Estrategia de test elegida
Ejecutar el seed real con `execSync('npx tsx prisma/seed.ts', { cwd, env })` desde dentro del test de Vitest. Esto testea exactamente cómo se usa en producción (no una reimplementación). El mismo prisma singleton de los tests consulta la DB después.

**Why:** El seed no exporta funciones — solo ejecuta `main()` al final. Importarlo directamente ejecutaría `main()` en el momento del import. Usar `execSync` con `tsx` es la forma más directa de testear el script tal cual existe, sin modificar el código de producción.

**How to apply:** Siempre que el código a testear sea un script que se auto-ejecuta (seed, migration, cli), usar `execSync` con el intérprete correcto (`tsx` para TypeScript) en lugar de intentar importarlo.

## Gotcha crítico de Prisma: OR con null en campos no-nullable
Prisma 7.x lanza `PrismaClientValidationError: Argument 'nombre' is missing` cuando se usa `OR: [{ nombre: '' }, { nombre: null }]` sobre un campo `String` (no nullable en el schema). Solo acepta `{ nombre: '' }` cuando el campo no es nullable.

**Why:** Prisma genera tipos estrictos desde el schema. `String` (sin `?`) no acepta `null` en el where. `String?` sí acepta `null`.

**How to apply:** Antes de escribir un where con OR que incluya `null`, verificar en schema.prisma si el campo tiene `?`. Si no tiene `?`, omitir el branch `null` del OR — simplemente filtrar por el valor vacío o usar una query distinta.

## Aislamiento de datos en tests con seed global
El seed crea benchmarks con `gymId = null` e `isOfficial = true`. Para no interferir con benchmarks personalizados de gyms reales en la DB de dev, todas las queries de test filtran por `{ isOfficial: true, gymId: null }`.

El cleanup es condicional: si los benchmarks existían ANTES del test (entorno dev con seed ya corrido), no se borran en afterAll. Si no existían (CI limpio), se borran. Esto protege el entorno de dev.

## Conteos exactos del seed (2026-04-30)
- GIRL: 27 (girl-001 a girl-027)
- HERO: 10 (hero-001 a hero-010)
- OPEN: 66 (open-2011-01 a open-2024-06, todos con campo `año`)
- GAMES: 10 (games-*)
- TOTAL: 113
- Todos los OPEN tienen campo `año` no nulo (verificado)
- Todos tienen al menos un movimiento con nombre no vacío
