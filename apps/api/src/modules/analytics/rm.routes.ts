import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createRmSchema, createGymnasticProgressSchema } from './rm.schema'
import {
  getRmsByUser, createRm, getGymRmEvolution,
  getGymnasticProgressByUser, createGymnasticProgress,
} from './rm.service'
import { prismaErrorMessage } from '../../lib/prismaError'
import { safeResolvePath } from '../../lib/safe-path'

export async function rmRoutes(app: FastifyInstance) {
  app.get('/rms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getRmsByUser(user.userId, user.gymId))
  })

  app.get('/rms/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { userId } = request.params as any
    const result = await getRmsByUser(userId, user.gymId)
    if (result === null) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send(result)
  })

  app.post('/rms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = createRmSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const rm = await createRm(user.userId, user.gymId, parsed.data)
      return reply.status(201).send(rm)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.get('/rms/gym-evolution', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getGymRmEvolution(user.gymId))
  })

  // ── Estadísticas mensuales del gym (últimos 6 meses) ─────────────────────
  app.get('/analytics/gym-stats', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const gymId = user.gymId

    // Últimos 6 meses
    const months: { label: string; start: Date; end: Date }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      d.setHours(0, 0, 0, 0)
      const end = new Date(d)
      end.setMonth(end.getMonth() + 1)
      end.setMilliseconds(-1)
      months.push({
        label: d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
        start: new Date(d),
        end,
      })
    }

    const [memberRows, attendanceRows, revenueRows] = await Promise.all([
      // Nuevos miembros (usuarios creados en el gym)
      Promise.all(months.map(m =>
        prisma.user.count({ where: { gymId, role: 'MEMBER', createdAt: { gte: m.start, lte: m.end } } })
      )),
      // Asistencias (bookings ATTENDED)
      Promise.all(months.map(m =>
        prisma.booking.count({
          where: { status: 'ATTENDED', class: { gymId, startsAt: { gte: m.start, lte: m.end } } },
        })
      )),
      // Ingresos (membresías pagadas)
      Promise.all(months.map(m =>
        prisma.membership.aggregate({
          where: { user: { gymId }, paidAt: { gte: m.start, lte: m.end } },
          _sum: { pricePaid: true },
        }).then(r => Math.round((r._sum.pricePaid ?? 0) / 100))
      )),
    ])

    const [totalMembers, activeMembers, totalClasses, attendedBookings] = await Promise.all([
      prisma.user.count({ where: { gymId, role: 'MEMBER' } }),
      prisma.membership.count({ where: { user: { gymId }, status: 'ACTIVE', endsAt: { gte: new Date() } } }),
      prisma.class.count({ where: { gymId } }),
      prisma.booking.count({ where: { status: 'ATTENDED', class: { gymId } } }),
    ])

    return reply.send({
      kpis: { totalMembers, activeMembers, totalClasses, attendedBookings },
      months: months.map((m, i) => ({
        label: m.label,
        newMembers: memberRows[i],
        attendances: attendanceRows[i],
        revenueCLP: revenueRows[i],
      })),
    })
  })

  app.get('/gymnastic-progress/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getGymnasticProgressByUser(user.userId, user.gymId))
  })

  app.get('/gymnastic-progress/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { userId } = request.params as any
    const result = await getGymnasticProgressByUser(userId, user.gymId)
    if (result === null) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send(result)
  })

  app.post('/gymnastic-progress/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = createGymnasticProgressSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const progress = await createGymnasticProgress(user.userId, user.gymId, parsed.data)
      return reply.status(201).send(progress)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/gymnastic-progress/:id/evidence', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    try {
      const data = await request.file()
      if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })
      const progress = await prisma.gymnasticProgress.findFirst({
        where: { id, userId: user.userId }
      })
      if (!progress) return reply.status(404).send({ error: 'Progresión no encontrada' })
      const fs = await import('fs')
      const path = await import('path')
      const uploadsDir = path.join(process.cwd(), 'uploads', 'evidence')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      // Extensión según el MIME declarado, nunca según el nombre que envía el cliente
      const EVIDENCE_MIME: Record<string, string> = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
        'video/mp4': '.mp4', 'video/quicktime': '.mov',
      }
      const ext = EVIDENCE_MIME[data.mimetype]
      if (!ext) return reply.status(400).send({ error: 'Formato no permitido (JPG, PNG, GIF, MP4 o MOV)' })
      const filename = `evidence_${id}_${Date.now()}${ext}`
      const filepath = path.join(uploadsDir, filename)
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createWriteStream(filepath)
        data.file.pipe(stream)
        stream.on('finish', resolve)
        stream.on('error', reject)
      })
      const evidenceType = data.mimetype.startsWith('video') ? 'video' : 'image'
      const evidenceUrl = `/uploads/evidence/${filename}`
      let updated
      try {
        updated = await prisma.gymnasticProgress.update({
          where: { id },
          data: { evidenceUrl, evidenceType }
        })
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al guardar la evidencia' })
      }
      return reply.send(updated)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // Las evidencias son privadas: requieren autenticación y pertenencia al userId
  app.get('/uploads/evidence/:filename', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { filename } = request.params as any
    const fs = await import('fs')
    const path = await import('path')

    const baseDir = path.resolve(process.cwd(), 'uploads', 'evidence')
    const filepath = safeResolvePath(baseDir, filename)
    if (!filepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })

    // Solo se sirven archivos evidence_<progressId>_<ts>.<ext>: el dueño de la progresión,
    // o COACH/ADMIN del mismo gym que el dueño
    const match = /^evidence_([^_]+)_/.exec(filename)
    if (!match) return reply.status(403).send({ error: 'Acceso denegado' })
    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'COACH'].includes(user.role)
    const progress = await prisma.gymnasticProgress.findFirst({
      where: isStaff
        ? { id: match[1], user: { gymId: user.gymId } }
        : { id: match[1], userId: user.userId },
      select: { id: true },
    })
    if (!progress || (isStaff && !user.gymId)) return reply.status(403).send({ error: 'Acceso denegado' })

    if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })

    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
    }
    reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    return reply.send(fs.createReadStream(filepath))
  })
}
