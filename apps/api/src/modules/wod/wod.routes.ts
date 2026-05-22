import { FastifyInstance } from 'fastify'
import { authenticate, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'

function toFloat(v: any) { return v != null && v !== '' ? Number(v) : null }

function sanitizeMovement(m: any, order: number) {
  return {
    order,
    movementName:   m.movementName   ?? '',
    repScheme:      m.repScheme      ?? null,
    weightRookieM:  toFloat(m.weightRookieM),
    weightRookieF:  toFloat(m.weightRookieF),
    weightScaleM:   toFloat(m.weightScaleM),
    weightScaleF:   toFloat(m.weightScaleF),
    weightRxM:      toFloat(m.weightRxM),
    weightRxF:      toFloat(m.weightRxF),
    scaledMovement: m.scaledMovement ?? null,
    notes:          m.notes          ?? null,
    roundWeights:   m.roundWeights   ?? null,
    sets:           m.sets  != null ? Number(m.sets)  : null,
    reps:           m.reps  != null ? Number(m.reps)  : null,
  }
}

function sanitizeBlocks(blocks: any[]) {
  return blocks.map((b: any, bi: number) => ({
    title:    b.title   ?? null,
    timecap:  b.timecap ?? null,
    order:    bi,
    movements: {
      create: (b.movements as any[]).map((m: any, mi: number) => sanitizeMovement(m, mi)),
    },
  }))
}

const includeBlocks = {
  blocks: {
    orderBy: { order: 'asc' as const },
    include: { movements: { orderBy: { order: 'asc' as const } } },
  },
}

/** Normaliza una fecha a medianoche local (sin hora) para comparar por día */
function dayRange(dateStr: string) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return { gte: d, lt: new Date(d.getTime() + 86_400_000) }
}

export async function wodRoutes(app: FastifyInstance) {

  // ─── CREATE ─────────────────────────────────────────────────────────────────
  app.post('/wods', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { classTypeId, title, date, blocks } = request.body as any

    // Verify classType belongs to this gym
    const classType = await prisma.classType.findFirst({
      where: { id: classTypeId, gymId: user.gymId },
    })
    if (!classType) return reply.status(404).send({ error: 'Tipo de clase no encontrado' })

    // One WOD per classType per day
    const existing = await prisma.wod.findFirst({
      where: { gymId: user.gymId, classTypeId, date: dayRange(date) },
    })
    if (existing) {
      return reply.status(400).send({ error: 'Ya existe una planificación para este tipo de clase en esa fecha' })
    }

    try {
      const wod = await prisma.wod.create({
        data: {
          gymId: user.gymId,
          classTypeId,
          title,
          date: new Date(date),
          blocks: { create: sanitizeBlocks(blocks ?? []) },
        },
        include: includeBlocks,
      })
      return reply.status(201).send(wod)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al crear el WOD' })
    }
  })

  // ─── GET BY CLASS (resuelve por classTypeId + fecha de la clase) ─────────────
  app.get('/wods/class/:classId', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const cls = await prisma.class.findFirst({
      where: { id: classId, gymId: user.gymId },
      select: { classTypeId: true, startsAt: true },
    })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })
    const wods = await prisma.wod.findMany({
      where: { gymId: user.gymId, classTypeId: cls.classTypeId, date: dayRange(cls.startsAt.toISOString()) },
      include: includeBlocks,
      orderBy: { date: 'desc' },
    })
    return reply.send(wods)
  })

  // ─── MY LOADS (mobile compat) ─────────────────────────────────────────────
  app.get('/wods/class/:classId/my-loads', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const cls = await prisma.class.findFirst({
      where: { id: classId, gymId: user.gymId },
      select: { classTypeId: true, startsAt: true },
    })
    if (!cls) return reply.send([])
    const wod = await prisma.wod.findFirst({
      where: { gymId: user.gymId, classTypeId: cls.classTypeId, date: dayRange(cls.startsAt.toISOString()) },
      include: includeBlocks,
    })
    if (!wod) return reply.send([])
    const allMovements = wod.blocks.flatMap(b => b.movements)
    const loads = await Promise.all(allMovements.map(async (m) => {
      const rm = await prisma.rmRecord.findFirst({
        where: { userId: user.userId, movementName: { contains: m.movementName, mode: 'insensitive' } },
        orderBy: { recordedAt: 'desc' },
      })
      return { ...m, calculatedKg: null, rmKg: rm?.weightKg || null }
    }))
    return reply.send(loads)
  })

  // ─── LIST ALL (calendar) ─────────────────────────────────────────────────────
  app.get('/wods', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { from, to } = request.query as any
    const where: any = { gymId: user.gymId }
    if (from) where.date = { ...where.date, gte: new Date(from) }
    if (to) {
      const toDate = new Date(to)
      toDate.setUTCHours(23, 59, 59, 999)
      where.date = { ...where.date, lte: toDate }
    }
    const wods = await prisma.wod.findMany({
      where,
      include: {
        ...includeBlocks,
        classType: { select: { id: true, name: true, color: true } },
      },
      orderBy: { date: 'asc' },
    })
    return reply.send(wods)
  })

  // ─── UPDATE ──────────────────────────────────────────────────────────────────
  app.put('/wods/:id', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const { title, date, blocks } = request.body as any

    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    try {
      await prisma.wodBlock.deleteMany({ where: { wodId: id } })
      const updated = await prisma.wod.update({
        where: { id },
        data: {
          title,
          date: new Date(date),
          blocks: { create: sanitizeBlocks(blocks ?? []) },
        },
        include: includeBlocks,
      })
      return reply.send(updated)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar WOD' })
    }
  })

  // ─── DELETE ──────────────────────────────────────────────────────────────────
  app.delete('/wods/:id', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })
    await prisma.wod.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // ─── IMPORT ──────────────────────────────────────────────────────────────────
  app.post('/wods/import', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const wods = request.body as any[]
    const created = []
    const errors = []

    for (const wodData of wods) {
      try {
        const classType = await prisma.classType.findFirst({
          where: { id: wodData.classTypeId, gymId: user.gymId },
        })
        if (!classType) { errors.push(`Tipo de clase no encontrado: ${wodData.classTypeId}`); continue }

        const wod = await prisma.wod.create({
          data: {
            gymId: user.gymId,
            classTypeId: wodData.classTypeId,
            title: wodData.title,
            date: new Date(wodData.date),
            blocks: { create: sanitizeBlocks(wodData.blocks ?? []) },
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
