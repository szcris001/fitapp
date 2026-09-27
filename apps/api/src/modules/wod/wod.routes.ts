import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { authenticate, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'
import { calculateLoad } from './wod.utils'
import { includeBlocks } from './wod.service'
import { gymDayRange, gymDayStart, getGymTimezone } from '../../lib/gym-day'

// Payload del JWT: { userId, gymId, role }
interface AuthUser {
  userId: string
  gymId: string
  role: string
}

function formatScore(score: number, scoreText: string | null, scoreType: string): string {
  if (scoreType === 'TIME') {
    const mins = Math.floor(score / 60)
    const secs = String(Math.round(score % 60)).padStart(2, '0')
    return `${mins}:${secs}`
  }
  if (scoreType === 'CUSTOM') {
    return scoreText ?? ''
  }
  return String(score)
}

function toFloat(v: any) { return v != null && v !== '' ? Number(v) : null }

function sanitizeMovement(m: any, order: number) {
  return {
    order,
    movementName:   m.movementName   ?? '',
    repScheme:      m.repScheme      ?? null,
    percentage:     m.percentage != null && m.percentage !== '' ? Number(m.percentage) : null,
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
    scheme:   b.scheme  ?? null,
    timecap:  b.timecap ?? null,
    notes:    b.notes   ?? null,
    order:    bi,
    movements: {
      create: (b.movements as any[]).map((m: any, mi: number) => sanitizeMovement(m, mi)),
    },
  }))
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

    // One WOD per classType per day (día local del gym)
    const tz = await getGymTimezone(user.gymId)
    const existing = await prisma.wod.findFirst({
      where: { gymId: user.gymId, classTypeId, date: gymDayRange(date, tz) },
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
          date: gymDayStart(date, tz),
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
      where: { gymId: user.gymId, classTypeId: cls.classTypeId, date: gymDayRange(cls.startsAt, await getGymTimezone(user.gymId)) },
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
      where: { gymId: user.gymId, classTypeId: cls.classTypeId, date: gymDayRange(cls.startsAt, await getGymTimezone(user.gymId)) },
      include: includeBlocks,
    })
    if (!wod) return reply.send([])
    const allMovements = wod.blocks.flatMap(b => b.movements)
    // Una sola consulta de RMs (más recientes primero) en vez de una por movimiento;
    // el match sigue siendo "contiene, sin distinguir mayúsculas"
    const [gym, rms] = await Promise.all([
      prisma.gym.findUnique({ where: { id: user.gymId }, select: { weightRounding: true } }),
      prisma.rmRecord.findMany({
        where: { userId: user.userId },
        orderBy: { recordedAt: 'desc' },
        select: { movementName: true, weightKg: true },
      }),
    ])
    const rounding = gym?.weightRounding ?? 2.5

    const loads = allMovements.map((m) => {
      const name = m.movementName.toLowerCase()
      const rm = rms.find(r => r.movementName.toLowerCase().includes(name))
      const calculatedKg = (rm && m.percentage)
        ? calculateLoad(rm.weightKg, m.percentage, rounding)
        : null
      return { ...m, calculatedKg, rmKg: rm?.weightKg || null }
    })
    return reply.send(loads)
  })

  // ─── LIST ALL (calendar) ─────────────────────────────────────────────────────
  app.get('/wods', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { from, to } = request.query as any
    const where: any = { gymId: user.gymId }
    if (from || to) {
      // from/to son días locales del gym (inclusive)
      const tz = await getGymTimezone(user.gymId)
      if (from) where.date = { ...where.date, gte: gymDayRange(from, tz).gte }
      if (to) where.date = { ...where.date, lt: gymDayRange(to, tz).lt }
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
    const { title, date, blocks, scoreType } = request.body as any

    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    try {
      await prisma.wodBlock.deleteMany({ where: { wodId: id } })
      const updated = await prisma.wod.update({
        where: { id },
        data: {
          title,
          ...(date !== undefined ? { date: gymDayStart(date, await getGymTimezone(user.gymId)) } : {}),
          blocks: { create: sanitizeBlocks(blocks ?? []) },
          ...(scoreType !== undefined ? { scoreType } : {}),
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

  // ─── RESULTS: POST (crear/actualizar resultado) ──────────────────────────────
  app.post('/wods/:id/results', { preHandler: requireCoachOrAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    const { id } = request.params as { id: string }
    const body = request.body as {
      userId: string
      score: number
      scoreText?: string
      rx: boolean
      notes?: string
    }

    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    // Verificar que el atleta pertenece al mismo gym
    const athlete = await prisma.user.findFirst({
      where: { id: body.userId, gymId: user.gymId },
      select: { id: true },
    })
    if (!athlete) return reply.status(404).send({ error: 'Usuario no encontrado en este gym' })

    try {
      const result = await prisma.wodResult.upsert({
        where: { wodId_userId: { wodId: id, userId: body.userId } },
        create: {
          gymId: user.gymId,
          wodId: id,
          userId: body.userId,
          score: body.score,
          scoreText: body.scoreText ?? null,
          rx: body.rx,
          notes: body.notes ?? null,
          recordedBy: user.userId,
        },
        update: {
          score: body.score,
          scoreText: body.scoreText ?? null,
          rx: body.rx,
          notes: body.notes ?? null,
          recordedBy: user.userId,
        },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      })
      return reply.status(201).send(result)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al registrar resultado' })
    }
  })

  // ─── RESULTS: GET leaderboard ────────────────────────────────────────────────
  app.get('/wods/:id/leaderboard', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    const { id } = request.params as { id: string }
    const { rx: rxFilter = 'all' } = request.query as { rx?: string }

    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    const where: { wodId: string; rx?: boolean } = { wodId: id }
    if (rxFilter === 'true') where.rx = true
    if (rxFilter === 'false') where.rx = false

    // Determinar orden según scoreType
    const isAscending = wod.scoreType === 'TIME'
    const orderBy: { score: 'asc' | 'desc' } | { createdAt: 'asc' } =
      wod.scoreType === 'CUSTOM'
        ? { createdAt: 'asc' }
        : { score: isAscending ? 'asc' : 'desc' }

    const rawResults = await prisma.wodResult.findMany({
      where,
      orderBy,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    // Separar RX y Scaled, calcular rank independiente
    const rxEntries = rawResults.filter(r => r.rx)
    const scaledEntries = rawResults.filter(r => !r.rx)

    const mapWithRank = (entries: typeof rawResults, category: 'rx' | 'scaled') =>
      entries.map((entry, index) => ({
        rank: index + 1,
        category,
        id: entry.id,
        userId: entry.userId,
        user: entry.user,
        score: entry.score,
        scoreText: entry.scoreText,
        scoreFormatted: formatScore(entry.score, entry.scoreText, wod.scoreType),
        rx: entry.rx,
        notes: entry.notes,
        recordedBy: entry.recordedBy,
        createdAt: entry.createdAt,
      }))

    const entries = [...mapWithRank(rxEntries, 'rx'), ...mapWithRank(scaledEntries, 'scaled')]

    return reply.send({
      wodId: id,
      scoreType: wod.scoreType,
      total: entries.length,
      entries,
    })
  })

  // ─── RESULTS: GET /me (miembro ve su propio resultado) ──────────────────────
  app.get('/wods/:id/results/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    const { id: wodId } = request.params as { id: string }

    const wod = await prisma.wod.findFirst({ where: { id: wodId, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    const result = await prisma.wodResult.findUnique({
      where: { wodId_userId: { wodId, userId: user.userId } },
    })

    if (!result) return reply.status(200).send(null)

    const scoreFormatted = formatScore(result.score, result.scoreText, wod.scoreType)
    return reply.send({ ...result, scoreFormatted })
  })

  // ─── RESULTS: POST /me (miembro registra su propio resultado) ────────────────
  app.post('/wods/:id/results/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    const { id: wodId } = request.params as { id: string }

    const memberResultSchema = z.object({
      score: z.number().min(0),
      scoreText: z.string().optional(),
      rx: z.boolean().default(false),
      notes: z.string().max(500).optional(),
    })

    const parseResult = memberResultSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parseResult.error.flatten() })
    }
    const body = parseResult.data

    const wod = await prisma.wod.findFirst({ where: { id: wodId, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    const result = await prisma.wodResult.upsert({
      where: { wodId_userId: { wodId, userId: user.userId } },
      create: {
        gymId: user.gymId,
        wodId,
        userId: user.userId,
        score: body.score,
        scoreText: body.scoreText ?? null,
        rx: body.rx,
        notes: body.notes ?? null,
        recordedBy: user.userId,
      },
      update: {
        score: body.score,
        scoreText: body.scoreText ?? null,
        rx: body.rx,
        notes: body.notes ?? null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    const scoreFormatted = formatScore(result.score, result.scoreText, wod.scoreType)
    return reply.status(201).send({ ...result, scoreFormatted })
  })

  // ─── RESULTS: PUT (actualizar resultado) ─────────────────────────────────────
  app.put('/wods/:id/results/:userId', { preHandler: requireCoachOrAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    const { id, userId } = request.params as { id: string; userId: string }
    const body = request.body as {
      score?: number
      scoreText?: string
      rx?: boolean
      notes?: string
    }

    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    const existing = await prisma.wodResult.findUnique({
      where: { wodId_userId: { wodId: id, userId } },
    })
    if (!existing) return reply.status(404).send({ error: 'Resultado no encontrado' })

    try {
      const updated = await prisma.wodResult.update({
        where: { wodId_userId: { wodId: id, userId } },
        data: {
          ...(body.score !== undefined ? { score: body.score } : {}),
          ...(body.scoreText !== undefined ? { scoreText: body.scoreText } : {}),
          ...(body.rx !== undefined ? { rx: body.rx } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          recordedBy: user.userId,
        },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      })
      return reply.send(updated)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar resultado' })
    }
  })

  // ─── RESULTS: DELETE ─────────────────────────────────────────────────────────
  app.delete('/wods/:id/results/:userId', { preHandler: requireCoachOrAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    const { id, userId } = request.params as { id: string; userId: string }

    const wod = await prisma.wod.findFirst({ where: { id, gymId: user.gymId } })
    if (!wod) return reply.status(404).send({ error: 'WOD no encontrado' })

    const existing = await prisma.wodResult.findUnique({
      where: { wodId_userId: { wodId: id, userId } },
    })
    if (!existing) return reply.status(404).send({ error: 'Resultado no encontrado' })

    await prisma.wodResult.delete({
      where: { wodId_userId: { wodId: id, userId } },
    })
    return reply.send({ ok: true })
  })

  // ─── IMPORT ──────────────────────────────────────────────────────────────────
  app.post('/wods/import', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const wods = request.body as any[]
    const created = []
    const errors = []
    const tz = await getGymTimezone(user.gymId)

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
            date: gymDayStart(wodData.date, tz),
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
