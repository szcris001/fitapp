import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createRmSchema, createGymnasticProgressSchema } from './rm.schema'
import {
  getRmsByUser, createRm, getGymRmEvolution,
  getGymnasticProgressByUser, createGymnasticProgress,
} from './rm.service'

export async function rmRoutes(app: FastifyInstance) {
  app.get('/rms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getRmsByUser(user.userId))
  })

  app.get('/rms/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const { userId } = request.params as any
    return reply.send(await getRmsByUser(userId))
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

  app.get('/gymnastic-progress/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getGymnasticProgressByUser(user.userId))
  })

  app.get('/gymnastic-progress/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const { userId } = request.params as any
    return reply.send(await getGymnasticProgressByUser(userId))
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
      const ext = path.extname(data.filename) || '.jpg'
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
      const updated = await prisma.gymnasticProgress.update({
        where: { id },
        data: { evidenceUrl, evidenceType }
      })
      return reply.send(updated)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/uploads/evidence/:filename', async (request, reply) => {
    const { filename } = request.params as any
    const fs = await import('fs')
    const path = await import('path')
    const filepath = path.join(process.cwd(), 'uploads', 'evidence', filename)
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
