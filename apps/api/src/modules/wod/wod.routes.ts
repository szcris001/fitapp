import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'

export async function wodRoutes(app: FastifyInstance) {
  app.post('/wods', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    if (!['ADMIN', 'COACH'].includes(user.role)) {
      return reply.status(403).send({ error: 'Sin permisos' })
    }
    const { classId, title, description, date, movements } = request.body as any
    try {
      const cls = await prisma.class.findFirst({ where: { id: classId, gymId: user.gymId } })
      if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })

      // Check for duplicate WOD: same class + same calendar date
      const dateStart = new Date(date)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000)
      const existing = await prisma.wod.findFirst({
        where: { classId, date: { gte: dateStart, lt: dateEnd } },
      })
      if (existing) {
        return reply.status(400).send({ error: 'Ya existe una planificación para esta clase en esa fecha' })
      }

      let wod
      try {
        wod = await prisma.wod.create({
          data: {
            classId,
            title,
            description,
            date: new Date(date),
            movements: { create: movements },
          },
          include: { movements: true },
        })
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al crear el WOD' })
      }
      return reply.status(201).send(wod)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/wods/class/:classId', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const wods = await prisma.wod.findMany({
      where: { classId, class: { gymId: user.gymId } },
      include: { movements: true },
      orderBy: { date: 'desc' },
    })
    return reply.send(wods)
  })

  app.get('/wods/class/:classId/my-loads', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const wod = await prisma.wod.findFirst({
      where: { classId, class: { gymId: user.gymId } },
      include: { movements: true },
      orderBy: { date: 'desc' },
    })
    if (!wod) return reply.send([])

    const loads = await Promise.all(wod.movements.map(async (m) => {
      if (!m.percentage) return { ...m, calculatedKg: null }
      const rm = await prisma.rmRecord.findFirst({
        where: { userId: user.userId, movementName: { contains: m.movementName, mode: 'insensitive' } },
        orderBy: { recordedAt: 'desc' },
      })
      const calculatedKg = rm ? Math.round((rm.weightKg * m.percentage) / 100) : null
      return { ...m, calculatedKg, rmKg: rm?.weightKg || null }
    }))
    return reply.send(loads)
  })

  app.get('/wods', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { from, to } = request.query as any
    const where: any = { class: { gymId: user.gymId } }
    if (from) where.date = { ...where.date, gte: new Date(from) }
    if (to) {
      const toDate = new Date(to)
      toDate.setUTCHours(23, 59, 59, 999)
      where.date = { ...where.date, lte: toDate }
    }
    const wods = await prisma.wod.findMany({
      where,
      include: {
        movements: true,
        class: { include: { classType: { select: { name: true, color: true } } } },
      },
      orderBy: { date: 'asc' },
    })
    return reply.send(wods)
  })

  app.put('/wods/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    if (!['ADMIN', 'COACH'].includes(user.role)) return reply.status(403).send({ error: 'Sin permisos' })
    const { id } = request.params as any
    const { title, description, date, movements } = request.body as any

    const wod = await prisma.wod.findFirst({ where: { id, class: { gymId: user.gymId } } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    try {
      await prisma.wodMovement.deleteMany({ where: { wodId: id } })
      const updated = await prisma.wod.update({
        where: { id },
        data: {
          title,
          description,
          date: new Date(date),
          movements: { create: movements },
        },
        include: { movements: true },
      })
      return reply.send(updated)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar WOD' })
    }
  })

  app.delete('/wods/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    if (!['ADMIN', 'COACH'].includes(user.role)) return reply.status(403).send({ error: 'Sin permisos' })
    const { id } = request.params as any
    const wod = await prisma.wod.findFirst({ where: { id, class: { gymId: user.gymId } } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })
    await prisma.wodMovement.deleteMany({ where: { wodId: id } })
    await prisma.wod.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  app.post('/wods/import', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    if (!['ADMIN', 'COACH'].includes(user.role)) {
      return reply.status(403).send({ error: 'Sin permisos' })
    }
    const wods = request.body as any[]
    const created = []
    const errors = []

    for (const wodData of wods) {
      try {
        const cls = await prisma.class.findFirst({
          where: { id: wodData.classId, gymId: user.gymId },
        })
        if (!cls) { errors.push(`Clase no encontrada: ${wodData.classId}`); continue }

        const wod = await prisma.wod.create({
          data: {
            classId: wodData.classId,
            title: wodData.title,
            description: wodData.description,
            date: new Date(wodData.date),
            movements: { create: wodData.movements },
          },
        })
        created.push(wod)
      } catch (err: any) {
        errors.push(err.message)
      }
    }
    return reply.send({ created: created.length, errors })
  })
}
