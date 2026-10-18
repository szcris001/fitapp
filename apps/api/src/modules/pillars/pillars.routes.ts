import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { updatePillarSchema, createManualPillarSchema, createPillarAwardSchema, configSchemaFor } from './pillars.schema'

export async function pillarRoutes(app: FastifyInstance) {
  // Awards del propio alumno — cualquier autenticado lee los suyos.
  app.get('/pillars/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const awards = await prisma.pillarAward.findMany({
      where: { userId: user.userId },
      include: { pillar: true },
      orderBy: { awardedAt: 'desc' },
    })
    return reply.send(awards)
  })

  // Catálogo del gym — lo consume tanto la pantalla de settings como el selector
  // del modal de otorgamiento manual, por eso no se restringe a requireAdmin.
  app.get('/pillars', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const pillars = await prisma.pillar.findMany({
      where: { gymId: user.gymId },
      orderBy: { order: 'asc' },
    })
    return reply.send(pillars)
  })

  app.put('/pillars/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const parsed = updatePillarSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const existing = await prisma.pillar.findFirst({ where: { id, gymId: user.gymId } })
    if (!existing) return reply.status(404).send({ error: 'Pilar no encontrado' })

    if (parsed.data.config !== undefined) {
      const configParsed = configSchemaFor(existing.type).safeParse(parsed.data.config)
      if (!configParsed.success) {
        return reply.status(400).send({ error: 'Configuración inválida', details: configParsed.error.flatten() })
      }
    }

    const updated = await prisma.pillar.update({ where: { id }, data: parsed.data as any })
    return reply.send(updated)
  })

  // Solo se pueden crear pilares MANUAL — los 4 automáticos son singleton,
  // sembrados al crear el gym (ver seedDefaultPillarsForGym), solo editables.
  app.post('/pillars', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createManualPillarSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const count = await prisma.pillar.count({ where: { gymId: user.gymId } })
    const pillar = await prisma.pillar.create({
      data: { ...parsed.data, gymId: user.gymId, type: 'MANUAL', config: {}, order: count },
    })
    return reply.status(201).send(pillar)
  })

  // Otorgamiento manual: el admin/coach elige alumno + pilar MANUAL + mensaje opcional.
  app.post('/pillars/:id/awards', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const parsed = createPillarAwardSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const pillar = await prisma.pillar.findFirst({ where: { id, gymId: user.gymId, type: 'MANUAL', isActive: true } })
    if (!pillar) return reply.status(404).send({ error: 'Pilar no encontrado o no es de otorgamiento manual' })

    // gymId del JWT, no del body — el body solo trae el userId del alumno a reconocer.
    const target = await prisma.user.findFirst({ where: { id: parsed.data.userId, gymId: user.gymId, role: 'MEMBER' } })
    if (!target) return reply.status(404).send({ error: 'Alumno no encontrado' })

    const award = await prisma.pillarAward.create({
      data: {
        gymId: user.gymId,
        userId: target.id,
        pillarId: pillar.id,
        periodStart: null,
        periodEnd: null,
        awardedById: user.userId,
        metadata: parsed.data.message ? { message: parsed.data.message } : {},
      },
    })
    return reply.status(201).send(award)
  })
}
