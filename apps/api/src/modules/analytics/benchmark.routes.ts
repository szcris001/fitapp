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
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

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
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

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
}
