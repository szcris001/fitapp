/**
 * seedBenchmarks.test.ts
 *
 * Tests de integración para el seed de benchmarks oficiales de CrossFit.
 *
 * Qué verifica:
 * 1. Conteos correctos tras la primera corrida (27 Girls, 10 Heroes, 66 Open, 10 Games = 113)
 * 2. Idempotencia: correr el seed 2 y 3 veces no duplica registros
 * 3. Integridad de datos: nombre no vacío, externalId único tras múltiples corridas
 *
 * Estrategia de aislamiento:
 * - El seed usa externalId como clave de upsert (findUnique por externalId → create o update).
 * - Los benchmarks oficiales tienen gymId = null (globales, no ligados a un gym).
 * - Contamos SOLO los benchmarks con isOfficial = true y gymId = null para no interferir
 *   con benchmarks personalizados creados por gyms en la DB de desarrollo.
 * - Cleanup: al terminar, no borramos los benchmarks oficiales (ya existían en dev);
 *   si NO existían antes del test, los borramos. Detectamos cuáles existían antes con
 *   una snapshot de externalIds al inicio.
 *
 * Cómo correr:
 *   cd /home/cristiansilva/fitapp/apps/api && pnpm test src/__tests__/seedBenchmarks.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/prisma'
import { BenchmarkCategory } from '../generated/prisma'

// ─── Constantes derivadas del seed ────────────────────────────────────────────

const EXPECTED_TOTAL = 113
const EXPECTED_BY_CATEGORY: Record<BenchmarkCategory, number> = {
  GIRL: 27,
  HERO: 10,
  OPEN: 66,
  GAMES: 10,
  CUSTOM: 0,
}

// externalIds de benchmarks oficiales (todos los del seed tienen uno)
const OFFICIAL_IDS_PRESENT_BEFORE_TEST = new Set<string>()

// ─── Función que replica la lógica del seed ───────────────────────────────────
// En lugar de ejecutar el script como subproceso (que requiere ts-node + dotenv),
// importamos la lógica directamente para que vitest la controle.
// Esto también nos da acceso al mismo prisma singleton, con la misma DB.

async function runSeed(): Promise<{ created: number; updated: number }> {
  // Importamos el array BENCHMARKS del seed de forma dinámica para evitar que la
  // llamada a main() al final del archivo se ejecute durante la importación.
  // El seed exporta solo los datos; la función main() se llama al final con
  // `main().catch(...)` — eso se ejecuta en tiempo de import cuando el módulo
  // se carga como script. Para evitar eso, copiamos aquí la lógica de main()
  // y usamos el prisma del test (mismo singleton, misma DB).

  // Leemos el BENCHMARKS array directamente del módulo compilado.
  // Como el seed no exporta nada, lo extraemos vía una re-implementación
  // que importa solo los datos inline.
  //
  // ALTERNATIVA LIMPIA: la función runSeed() llama a prisma directamente
  // con los mismos datos que el seed, para verificar exactamente el comportamiento
  // de upsert sin depender de cómo se invoca el script.

  // Para no duplicar los 500+ líneas de datos, usamos una estrategia diferente:
  // invocamos el seed como módulo Node.js aislado y verificamos la DB después.
  // Pero como eso requiere spawn, usamos la función importada a continuación.

  return runSeedLogic()
}

// Función que replica exactamente la lógica del main() del seed
// usando el prisma del test (mismo singleton).
async function runSeedLogic(): Promise<{ created: number; updated: number }> {
  // Importamos los datos del seed. El archivo termina con main().catch(...)
  // que se ejecutaría al importar — así que usamos una importación condicional
  // con una variable de entorno para inhibir la llamada automática a main().
  //
  // En lugar de eso, extraemos los datos directamente. La forma más limpia
  // es que el test llame a la función de seed exportada. Como el seed actual
  // no exporta nada, usamos child_process con ts-node.
  //
  // DECISIÓN FINAL: usamos `tsx` (ya disponible en devDeps) para ejecutar
  // el seed en un subproceso, que es lo más cercano a cómo se usa en producción.
  // Luego verificamos la DB.

  const { execSync } = await import('child_process')

  execSync('npx tsx prisma/seed.ts', {
    cwd: '/home/cristiansilva/fitapp/apps/api',
    env: { ...process.env },
    stdio: 'pipe', // silencia stdout del seed en la salida de tests
  })

  // Devolvemos un resultado simbólico; lo que importa es la DB
  return { created: -1, updated: -1 }
}

// ─── Helpers de query ─────────────────────────────────────────────────────────

async function countOfficialBenchmarks(): Promise<number> {
  return prisma.benchmark.count({
    where: { isOfficial: true, gymId: null },
  })
}

async function countByCategory(categoria: BenchmarkCategory): Promise<number> {
  return prisma.benchmark.count({
    where: { isOfficial: true, gymId: null, categoria },
  })
}

async function getOfficialExternalIds(): Promise<string[]> {
  const records = await prisma.benchmark.findMany({
    where: { isOfficial: true, gymId: null, externalId: { not: null } },
    select: { externalId: true },
  })
  return records.map(r => r.externalId!).filter(Boolean)
}

// ─── Setup: snapshot de estado previo ────────────────────────────────────────

beforeAll(async () => {
  // Guardamos los externalIds que ya existían ANTES del test
  // para poder hacer cleanup quirúrgico en afterAll.
  const existing = await getOfficialExternalIds()
  existing.forEach(id => OFFICIAL_IDS_PRESENT_BEFORE_TEST.add(id))
})

// ─── Cleanup: borramos solo lo que NO existía antes ──────────────────────────

afterAll(async () => {
  // Si antes del test no había benchmarks oficiales, los borramos todos.
  // Si ya había algunos (entorno de dev con seed previo), no tocamos nada.
  // Esto evita romper el entorno de desarrollo.
  if (OFFICIAL_IDS_PRESENT_BEFORE_TEST.size === 0) {
    await prisma.benchmark.deleteMany({
      where: { isOfficial: true, gymId: null },
    })
  }
  // Si ya existían (dev ya tenía seed), no limpiamos — el seed es idempotente
  // y el entorno queda igual que antes del test.
  await prisma.$disconnect()
})

// ─── Suite principal ───────────────────────────────────────────────────────────

describe('seedBenchmarks — Primera corrida', () => {
  beforeAll(async () => {
    await runSeed()
  }, 60_000) // timeout generoso: la primera corrida puede tardar si inserta 113 registros

  it('produce exactamente 113 benchmarks oficiales en total', async () => {
    const total = await countOfficialBenchmarks()
    expect(total).toBe(EXPECTED_TOTAL)
  })

  it('produce exactamente 27 benchmarks de categoría GIRL', async () => {
    const count = await countByCategory('GIRL')
    expect(count).toBe(EXPECTED_BY_CATEGORY.GIRL)
  })

  it('produce exactamente 10 benchmarks de categoría HERO', async () => {
    const count = await countByCategory('HERO')
    expect(count).toBe(EXPECTED_BY_CATEGORY.HERO)
  })

  it('produce exactamente 66 benchmarks de categoría OPEN', async () => {
    const count = await countByCategory('OPEN')
    expect(count).toBe(EXPECTED_BY_CATEGORY.OPEN)
  })

  it('produce exactamente 10 benchmarks de categoría GAMES', async () => {
    const count = await countByCategory('GAMES')
    expect(count).toBe(EXPECTED_BY_CATEGORY.GAMES)
  })

  it('cada benchmark oficial tiene un nombre no vacío', async () => {
    // nombre es String (no nullable) en el schema — solo chequeamos string vacío
    const blancos = await prisma.benchmark.findMany({
      where: {
        isOfficial: true,
        gymId: null,
        nombre: '',
      },
    })
    expect(blancos).toHaveLength(0)
  })

  it('todos los benchmarks oficiales tienen externalId asignado', async () => {
    const sinId = await prisma.benchmark.count({
      where: { isOfficial: true, gymId: null, externalId: null },
    })
    expect(sinId).toBe(0)
  })

  it('los externalIds son únicos (sin duplicados)', async () => {
    const ids = await getOfficialExternalIds()
    const unicos = new Set(ids)
    expect(unicos.size).toBe(ids.length)
    // Si hay duplicados, este test falla y el mensaje mostrará el delta
    expect(ids.length).toBe(EXPECTED_TOTAL)
  })
})

describe('seedBenchmarks — Idempotencia (segunda corrida)', () => {
  beforeAll(async () => {
    // La primera corrida ya se ejecutó en la suite anterior.
    // Corremos el seed una segunda vez.
    await runSeed()
  }, 60_000)

  it('el total sigue siendo 113 tras la segunda corrida (no duplica)', async () => {
    const total = await countOfficialBenchmarks()
    expect(total).toBe(EXPECTED_TOTAL)
  })

  it('GIRL sigue siendo 27 tras la segunda corrida', async () => {
    expect(await countByCategory('GIRL')).toBe(EXPECTED_BY_CATEGORY.GIRL)
  })

  it('HERO sigue siendo 10 tras la segunda corrida', async () => {
    expect(await countByCategory('HERO')).toBe(EXPECTED_BY_CATEGORY.HERO)
  })

  it('OPEN sigue siendo 66 tras la segunda corrida', async () => {
    expect(await countByCategory('OPEN')).toBe(EXPECTED_BY_CATEGORY.OPEN)
  })

  it('GAMES sigue siendo 10 tras la segunda corrida', async () => {
    expect(await countByCategory('GAMES')).toBe(EXPECTED_BY_CATEGORY.GAMES)
  })

  it('los externalIds siguen siendo únicos tras la segunda corrida', async () => {
    const ids = await getOfficialExternalIds()
    const unicos = new Set(ids)
    expect(unicos.size).toBe(ids.length)
    expect(ids.length).toBe(EXPECTED_TOTAL)
  })
})

describe('seedBenchmarks — Idempotencia (tercera corrida)', () => {
  beforeAll(async () => {
    await runSeed()
  }, 60_000)

  it('el total sigue siendo 113 tras la tercera corrida (no duplica)', async () => {
    const total = await countOfficialBenchmarks()
    expect(total).toBe(EXPECTED_TOTAL)
  })

  it('externalIds siguen siendo únicos tras la tercera corrida', async () => {
    const ids = await getOfficialExternalIds()
    const unicos = new Set(ids)
    expect(unicos.size).toBe(ids.length)
    expect(ids.length).toBe(EXPECTED_TOTAL)
  })
})

describe('seedBenchmarks — Integridad de datos', () => {
  it('cada benchmark oficial tiene al menos un movimiento asociado', async () => {
    // Buscamos benchmarks sin movimientos
    const sinMovimientos = await prisma.benchmark.findMany({
      where: { isOfficial: true, gymId: null },
      include: { movimientos: true },
    })

    const vacios = sinMovimientos.filter(b => b.movimientos.length === 0)
    expect(vacios).toHaveLength(0)
  })

  it('todos los movimientos tienen nombre no vacío', async () => {
    // Buscamos movimientos de benchmarks oficiales con nombre vacío o nulo
    const benchmarkIds = await prisma.benchmark.findMany({
      where: { isOfficial: true, gymId: null },
      select: { id: true },
    })

    const ids = benchmarkIds.map(b => b.id)

    // nombre es String (no nullable) en BenchmarkMovement — solo chequeamos string vacío
    const movimientosBlancos = await prisma.benchmarkMovement.findMany({
      where: {
        benchmarkId: { in: ids },
        nombre: '',
      },
    })

    expect(movimientosBlancos).toHaveLength(0)
  })

  it('el campo formato no está vacío en ningún benchmark oficial', async () => {
    // formato es String (no nullable) en el schema — solo chequeamos string vacío
    const sinFormato = await prisma.benchmark.count({
      where: {
        isOfficial: true,
        gymId: null,
        formato: '',
      },
    })
    expect(sinFormato).toBe(0)
  })

  it('todos los benchmarks OPEN tienen año asignado', async () => {
    const sinAno = await prisma.benchmark.count({
      where: {
        isOfficial: true,
        gymId: null,
        categoria: 'OPEN',
        año: null,
      },
    })
    expect(sinAno).toBe(0)
  })
})
