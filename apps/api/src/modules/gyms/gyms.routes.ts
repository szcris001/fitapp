import { FastifyInstance, FastifyRequest } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { updateGymSchema } from './gyms.schema'
import { getGym, updateGym, getGymStats } from './gyms.service'
import { prisma } from '../../lib/prisma'
import path from 'path'
import fs from 'fs'

export async function gymRoutes(app: FastifyInstance) {
  app.get('/gyms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getGym(user.gymId))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.put('/gyms/me', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = updateGymSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.send(await updateGym(user.gymId, parsed.data))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/gyms/me/stats', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getGymStats(user.gymId))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.post('/gyms/me/logo', { preHandler: requireAdmin }, async (request: FastifyRequest, reply) => {
    const user = request.user as any
    try {
      const data = await (request as any).file() as MultipartFile
      if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })

      const uploadsDir = path.join(process.cwd(), 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

      const ext = path.extname(data.filename) || '.png'
      const filename = `logo_${user.gymId}${ext}`
      const filepath = path.join(uploadsDir, filename)

      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(filepath)
        data.file.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })

      const logoUrl = `/uploads/${filename}`
      await prisma.gym.update({ where: { id: user.gymId }, data: { logoUrl } })

      return reply.send({ logoUrl })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })
}
