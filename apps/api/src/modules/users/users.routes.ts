import { FastifyInstance, FastifyRequest } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createUserSchema, updateUserSchema } from './users.schema'
import { listUsers, getUserById, createUser, updateUser } from './users.service'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'
import path from 'path'
import fs from 'fs'

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { status, role } = request.query as any
    return reply.send(await listUsers(user.gymId, status, role))
  })

  app.get('/users/:id', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    try {
      return reply.send(await getUserById(user.gymId, id))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.post('/users', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createUserSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.status(201).send(await createUser(user.gymId, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.put('/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const parsed = updateUserSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.send(await updateUser(user.gymId, id, parsed.data))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.post('/users/:id/reset-password', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const { id } = request.params as any
    const { newPassword } = request.body as any
    if (!newPassword || newPassword.length < 6) {
      return reply.status(400).send({ error: 'La contraseña debe tener al menos 6 caracteres' })
    }
    const existing = await prisma.user.findFirst({ where: { id, gymId: admin.gymId } })
    if (!existing) return reply.status(404).send({ error: 'Usuario no encontrado' })
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } })
    return reply.send({ ok: true })
  })

  app.post('/users/:id/avatar', { preHandler: requireAdmin }, async (request: FastifyRequest, reply) => {
    const admin = request.user as any
    const { id } = request.params as any
    try {
      const existing = await prisma.user.findFirst({ where: { id, gymId: admin.gymId } })
      if (!existing) return reply.status(404).send({ error: 'Usuario no encontrado' })

      const data = await (request as any).file() as MultipartFile
      if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })

      const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

      const ext = path.extname(data.filename) || '.png'
      const filename = `avatar_${id}${ext}`
      const filepath = path.join(uploadsDir, filename)

      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(filepath)
        data.file.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })

      const avatarUrl = `/uploads/avatars/${filename}`
      try {
        await prisma.user.update({ where: { id }, data: { avatarUrl } })
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al guardar el avatar' })
      }
      return reply.send({ avatarUrl })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })
}
