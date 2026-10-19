import { prisma } from '../../lib/prisma'
import { formatScore } from '../wod/wod.service'

export type BenchmarkHistoryEntry = {
  id: string
  source: 'class' | 'personal'
  benchmarkId: string
  benchmarkName: string
  benchmarkCategory: string
  date: Date
  score: number
  scoreText: string | null
  scoreFormatted: string
  rx: boolean
}

/**
 * Historial unificado de benchmarks del alumno: junta las dos vías de carga que
 * conviven en el producto (pedido explícito de Cristian, 2026-10-19) —
 *
 *   - "class": WodResult de un WOD de clase que el coach vinculó a un benchmark
 *     del catálogo (Wod.benchmarkId). Ver diseño original en
 *     project_wod_benchmark_link (memoria del architect, 2026-10-19).
 *   - "personal": BenchmarkResult que el alumno cargó por su cuenta, fuera de
 *     una clase programada (POST /benchmarks/:id/result) — camino que ya
 *     existía y nunca se desconectó.
 *
 * Ninguna tabla se duplica ni se escribe acá — es un merge de lectura en
 * memoria, mismo patrón que calculateConsistency/awardSemesterPillarsForGym
 * (cruzan Booking+Wod+WodResult sin N+1): dos queries indexadas por
 * gymId+userId, combinar, ordenar por fecha.
 *
 * Nota sobre los scoreType: WodResult usa el enum WodScoreType (Wod.scoreType)
 * y BenchmarkResult guarda el mismo vocabulario como string suelto
 * (TIME|REPS|WEIGHT|ROUNDS|CUSTOM, ver comentario en schema.prisma) — mismas
 * unidades (segundos para TIME, kg para WEIGHT), por eso formatScore sirve
 * para ambas fuentes sin normalizar nada más.
 */
export async function getBenchmarkHistory(gymId: string, userId: string): Promise<BenchmarkHistoryEntry[]> {
  const [classEntries, personalEntries] = await Promise.all([
    prisma.wodResult.findMany({
      where: { gymId, userId, wod: { benchmarkId: { not: null } } },
      orderBy: { wod: { date: 'desc' } },
      include: {
        wod: {
          select: { date: true, scoreType: true, benchmark: { select: { id: true, nombre: true, categoria: true } } },
        },
      },
    }),
    prisma.benchmarkResult.findMany({
      where: { gymId, userId },
      orderBy: { recordedAt: 'desc' },
      include: { benchmark: { select: { id: true, nombre: true, categoria: true } } },
    }),
  ])

  // Prefijo del id por fuente: son dos tablas distintas, sus uuid nunca van a
  // colisionar entre sí, pero el prefijo deja la clave lista para usar como
  // key de lista en web/mobile sin que el cliente tenga que combinar id+source.
  const fromClass: BenchmarkHistoryEntry[] = classEntries.map(r => ({
    id: `class_${r.id}`,
    source: 'class',
    benchmarkId: r.wod.benchmark!.id,
    benchmarkName: r.wod.benchmark!.nombre,
    benchmarkCategory: r.wod.benchmark!.categoria,
    date: r.wod.date,
    score: r.score,
    scoreText: r.scoreText,
    scoreFormatted: formatScore(r.score, r.scoreText, r.wod.scoreType),
    rx: r.rx,
  }))

  const fromPersonal: BenchmarkHistoryEntry[] = personalEntries.map(r => ({
    id: `personal_${r.id}`,
    source: 'personal',
    benchmarkId: r.benchmark.id,
    benchmarkName: r.benchmark.nombre,
    benchmarkCategory: r.benchmark.categoria,
    date: r.recordedAt,
    score: r.scoreValue,
    scoreText: r.scoreNotes,
    scoreFormatted: formatScore(r.scoreValue, r.scoreNotes, r.scoreType),
    rx: r.isRx,
  }))

  return [...fromClass, ...fromPersonal].sort((a, b) => b.date.getTime() - a.date.getTime())
}
