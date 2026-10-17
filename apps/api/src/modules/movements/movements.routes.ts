import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { normalizeMovementName } from '../../lib/text'

// Catálogo transversal (consumido por wod, progresiones/RM y settings), no una
// config de un gym ni un registro de resultados — módulo propio, mismo patrón
// global+custom que Benchmark en analytics/benchmark.routes.ts.
//
// Nota: ya existe GET /movements/:filename en index.ts (sin prefijo /api, sirve
// GIFs de movimientos) — no colisiona con este módulo, que registra bajo /api.

const createMovementSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100),
  categoria: z.string().trim().min(1, 'La categoría no puede estar vacía').max(50),
})

export async function movementRoutes(app: FastifyInstance) {
  // GET es `authenticate` (no requireCoachOrAdmin como /benchmarks): el propio
  // MEMBER necesita leer el catálogo directo desde su pantalla de progresión/RM.
  app.get('/movements', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { categoria } = request.query as any

    const where: any = {
      OR: [{ gymId: null, isOfficial: true }, { gymId: user.gymId }],
    }
    if (categoria) where.categoria = categoria

    const movements = await prisma.movement.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    })
    return reply.send(movements)
  })

  app.post('/movements', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createMovementSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const key = normalizeMovementName(parsed.data.nombre)
    const custom = await prisma.movement.findMany({ where: { gymId: user.gymId, isOfficial: false } })
    if (custom.some(m => normalizeMovementName(m.nombre) === key)) {
      return reply.status(409).send({ error: 'Ya existe un movimiento con ese nombre en tu gimnasio' })
    }

    const movement = await prisma.movement.create({
      data: { ...parsed.data, gymId: user.gymId, isOfficial: false },
    })
    return reply.status(201).send(movement)
  })

  app.delete('/movements/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any

    const existing = await prisma.movement.findFirst({
      where: { id, gymId: user.gymId, isOfficial: false },
    })
    if (!existing) return reply.status(404).send({ error: 'Movimiento no encontrado o no eliminable' })

    await prisma.movement.delete({ where: { id } })
    return reply.status(204).send()
  })
}
