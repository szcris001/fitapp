import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { prismaErrorMessage } from '../../lib/prismaError'
import { BenchmarkCategory } from '../../generated/prisma'

const VALID_CATEGORIES = ['GIRL', 'HERO', 'OPEN', 'GAMES', 'CUSTOM'] as const

const createBenchmarkSchema = z.object({
  nombre: z.string().min(1),
  categoria: z.enum(VALID_CATEGORIES),
  año: z.number().int().optional(),
  formato: z.string().min(1),
  duracionMins: z.number().int().positive().optional(),
  tiempoEstMin: z.number().int().positive().optional(),
  descripcion: z.string().optional(),
  notas: z.string().optional(),
  movimientos: z.array(z.object({
    nombre: z.string().min(1),
    repsEsquema: z.string().optional(),
    cargaRxKgHombre: z.number().positive().optional(),
    cargaRxKgMujer: z.number().positive().optional(),
    alturaRxCmHombre: z.number().int().positive().optional(),
    alturaRxCmMujer: z.number().int().positive().optional(),
    cargaScaled: z.string().optional(),
  })).min(1),
})

export async function benchmarkRoutes(app: FastifyInstance) {

  // ── List with filters ─────────────────────────────────────────────────────
  app.get('/benchmarks', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const q = request.query as any

    const where: any = {
      AND: [] as any[],
    }

    // Official + gym-specific custom benchmarks
    where.AND.push({
      OR: [
        { gymId: null, isOfficial: true },
        { gymId: user.gymId },
      ],
    })

    if (q.categoria) {
      where.AND.push({ categoria: q.categoria.toUpperCase() as BenchmarkCategory })
    }

    if (q.formato) {
      where.AND.push({ formato: { contains: q.formato, mode: 'insensitive' } })
    }

    if (q.nombre) {
      where.AND.push({ nombre: { contains: q.nombre, mode: 'insensitive' } })
    }

    if (q.año) {
      where.AND.push({ año: parseInt(q.año) })
    }

    if (q.duracionMaxMins) {
      where.AND.push({
        OR: [
          { duracionMins: { lte: parseInt(q.duracionMaxMins) } },
          { tiempoEstMin: { lte: parseInt(q.duracionMaxMins) } },
        ],
      })
    }

    if (q.movimiento) {
      where.AND.push({
        movimientos: {
          some: { nombre: { contains: q.movimiento, mode: 'insensitive' } },
        },
      })
    }

    const benchmarks = await prisma.benchmark.findMany({
      where,
      include: { movimientos: { orderBy: { orden: 'asc' } } },
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    })

    return reply.send(benchmarks)
  })

  // ── Get single ────────────────────────────────────────────────────────────
  app.get('/benchmarks/:id', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any

    const benchmark = await prisma.benchmark.findFirst({
      where: {
        id,
        OR: [{ gymId: null, isOfficial: true }, { gymId: user.gymId }],
      },
      include: { movimientos: { orderBy: { orden: 'asc' } } },
    })

    if (!benchmark) return reply.status(404).send({ error: 'Benchmark no encontrado' })
    return reply.send(benchmark)
  })

  // ── Create custom benchmark ───────────────────────────────────────────────
  app.post('/benchmarks', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createBenchmarkSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const { movimientos, ...rest } = parsed.data
    try {
      const benchmark = await prisma.benchmark.create({
        data: {
          ...rest,
          gymId: user.gymId,
          isOfficial: false,
          movimientos: {
            create: movimientos.map((m, i) => ({ ...m, orden: i })),
          },
        },
        include: { movimientos: { orderBy: { orden: 'asc' } } },
      })
      return reply.status(201).send(benchmark)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al crear el benchmark' })
    }
  })

  // ── Update custom benchmark ───────────────────────────────────────────────
  app.put('/benchmarks/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const parsed = createBenchmarkSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const existing = await prisma.benchmark.findFirst({
      where: { id, gymId: user.gymId, isOfficial: false },
    })
    if (!existing) return reply.status(404).send({ error: 'Benchmark no encontrado o no editable' })

    const { movimientos, ...rest } = parsed.data
    await prisma.benchmarkMovement.deleteMany({ where: { benchmarkId: id } })
    const benchmark = await prisma.benchmark.update({
      where: { id },
      data: {
        ...rest,
        movimientos: {
          create: movimientos.map((m, i) => ({ ...m, orden: i })),
        },
      },
      include: { movimientos: { orderBy: { orden: 'asc' } } },
    })
    return reply.send(benchmark)
  })

  // ── Delete custom benchmark ───────────────────────────────────────────────
  app.delete('/benchmarks/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any

    const existing = await prisma.benchmark.findFirst({
      where: { id, gymId: user.gymId, isOfficial: false },
    })
    if (!existing) return reply.status(404).send({ error: 'Benchmark no encontrado o no eliminable' })

    await prisma.benchmark.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Registrar resultado de benchmark (atleta) ─────────────────────────────
  app.post('/benchmarks/:id/result', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const schema = z.object({
      scoreType:  z.enum(['TIME', 'REPS', 'ROUNDS', 'WEIGHT', 'CUSTOM']),
      scoreValue: z.number().positive(),
      scoreNotes: z.string().optional(),
      isRx:       z.boolean().default(true),
      recordedAt: z.string().optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const benchmark = await prisma.benchmark.findFirst({
      where: { id, OR: [{ gymId: null, isOfficial: true }, { gymId: user.gymId }] },
    })
    if (!benchmark) return reply.status(404).send({ error: 'Benchmark no encontrado' })

    const result = await prisma.benchmarkResult.create({
      data: {
        benchmarkId: id,
        userId:      user.userId,
        gymId:       user.gymId,
        scoreType:   parsed.data.scoreType,
        scoreValue:  parsed.data.scoreValue,
        scoreNotes:  parsed.data.scoreNotes,
        isRx:        parsed.data.isRx,
        recordedAt:  parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : new Date(),
      },
      include: { benchmark: { select: { nombre: true } } },
    })
    return reply.status(201).send(result)
  })

  // ── Mi mejor resultado en un benchmark ────────────────────────────────────
  app.get('/benchmarks/:id/my-result', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any

    const results = await prisma.benchmarkResult.findMany({
      where: { benchmarkId: id, userId: user.userId, gymId: user.gymId },
      orderBy: { recordedAt: 'desc' },
    })
    return reply.send(results)
  })

  // ── Leaderboard del box para un benchmark ─────────────────────────────────
  app.get('/benchmarks/:id/leaderboard', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any

    // Mejor resultado por atleta (score más bajo para TIME, más alto para el resto)
    const allResults = await prisma.benchmarkResult.findMany({
      where: { benchmarkId: id, gymId: user.gymId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, gender: true } },
      },
      orderBy: { scoreValue: 'asc' },
    })

    // Agrupar por usuario — mantener solo el mejor resultado
    const bestByUser = new Map<string, typeof allResults[0]>()
    for (const r of allResults) {
      const existing = bestByUser.get(r.userId)
      if (!existing) { bestByUser.set(r.userId, r); continue }
      // Para TIME: menor es mejor. Para el resto: mayor es mejor
      const isBetter = r.scoreType === 'TIME'
        ? r.scoreValue < existing.scoreValue
        : r.scoreValue > existing.scoreValue
      if (isBetter) bestByUser.set(r.userId, r)
    }

    const leaderboard = Array.from(bestByUser.values())
      .sort((a, b) => a.scoreType === 'TIME'
        ? a.scoreValue - b.scoreValue
        : b.scoreValue - a.scoreValue)

    return reply.send(leaderboard)
  })

  // ── Todos los benchmarks con sus resultados del gym (para la Pizarra) ────
  app.get('/benchmarks/board', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any

    const benchmarks = await prisma.benchmark.findMany({
      where: { OR: [{ gymId: null, isOfficial: true }, { gymId: user.gymId }] },
      include: {
        movimientos: { orderBy: { orden: 'asc' } },
        resultados: {
          where: { gymId: user.gymId },
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, gender: true } },
          },
          orderBy: { scoreValue: 'asc' },
        },
      },
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    })

    return reply.send(benchmarks)
  })

  // ── RMs de todos los alumnos del gym (para la Pizarra) ────────────────────
  app.get('/rms/gym-board', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any

    const rms = await prisma.rmRecord.findMany({
      where: { user: { gymId: user.gymId } },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, gender: true } },
      },
      orderBy: [{ movementName: 'asc' }, { weightKg: 'desc' }],
    })

    // Agrupar por movimiento
    const byMovement: Record<string, { movement: string; records: typeof rms }> = {}
    for (const rm of rms) {
      if (!byMovement[rm.movementName]) {
        byMovement[rm.movementName] = { movement: rm.movementName, records: [] }
      }
      // Solo el mejor RM por usuario
      const existing = byMovement[rm.movementName].records.find(r => r.userId === rm.userId)
      if (!existing || rm.weightKg > existing.weightKg) {
        byMovement[rm.movementName].records = [
          ...byMovement[rm.movementName].records.filter(r => r.userId !== rm.userId),
          rm,
        ]
      }
    }

    // Ordenar cada movimiento por peso desc
    for (const key of Object.keys(byMovement)) {
      byMovement[key].records.sort((a, b) => b.weightKg - a.weightKg)
    }

    return reply.send(Object.values(byMovement).sort((a, b) => a.movement.localeCompare(b.movement)))
  })
}
