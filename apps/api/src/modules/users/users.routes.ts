import { FastifyInstance, FastifyRequest } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createUserSchema, updateUserSchema } from './users.schema'
import { listUsers, getUserById, createUser, updateUser } from './users.service'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'
import path from 'path'
import fs from 'fs'

const AVATAR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

// Guarda uploads/avatars/avatar_<userId>.<ext> y devuelve su URL; null si el tipo no está permitido
async function saveAvatarFile(data: MultipartFile, userId: string): Promise<string | null> {
  const ext = AVATAR_MIME[data.mimetype]
  if (!ext) {
    data.file.resume()
    return null
  }
  const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars')
  await fs.promises.mkdir(uploadsDir, { recursive: true })
  const filename = `avatar_${userId}${ext}`
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(path.join(uploadsDir, filename))
    data.file.pipe(writeStream)
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
  return `/uploads/avatars/${filename}`
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { status, role } = request.query as any
    return reply.send(await listUsers(user.gymId, status, role))
  })

  // Cualquier usuario autenticado puede leer su propio perfil
  app.get('/users/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getUserById(user.gymId, user.userId))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.get('/users/export', { preHandler: [requireCoachOrAdmin] }, async (req, reply) => {
    const { format = 'csv', status = 'all', role = 'MEMBER' } = req.query as any
    const gymId = (req.user as any).gymId

    const whereStatus = status === 'all' ? {} : {
      memberships: { some: { status: status as any } },
    }

    const users = await prisma.user.findMany({
      where: {
        gymId,
        role: role as any,
        ...whereStatus,
      },
      include: {
        memberships: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          include: { plan: { select: { name: true } } },
          orderBy: { endsAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })

    const header = ['Nombre', 'Email', 'Teléfono', 'RUT', 'Género', 'Plan activo', 'Vencimiento', 'Estado', 'Registrado']
    const rows = users.map(u => {
      const membership = u.memberships[0]
      const memberStatus = membership
        ? membership.status === 'ACTIVE' ? 'Activo' : 'Trial'
        : 'Inactivo'
      const plan = membership?.plan?.name ?? ''
      const endsAt = membership?.endsAt
        ? new Date(membership.endsAt).toLocaleDateString('es-CL')
        : ''
      const gender = u.gender === 'M' ? 'Masculino' : u.gender === 'F' ? 'Femenino' : ''
      const createdAt = new Date(u.createdAt).toLocaleDateString('es-CL')

      const escape = (val: any) => {
        // Previene CSV Injection (OWASP): si Excel/Sheets abre una celda que empieza con
        // = + - @ (o tab/CR) como fórmula, puede ejecutar código o llamar a una URL externa.
        // Un '-prefijo neutraliza eso sin cambiar el valor visible en un editor de texto plano.
        let str = String(val ?? '')
        if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }

      return [u.name, u.email, u.phone ?? '', u.rut ?? '', gender, plan, endsAt, memberStatus, createdAt]
        .map(escape)
        .join(',')
    })

    const csv = [header.join(','), ...rows].join('\r\n')
    const filename = `miembros_${new Date().toISOString().split('T')[0]}.csv`
    const bom = '﻿'

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(bom + csv)
  })

  app.get('/users/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    // Members solo pueden leer su propio perfil
    if (!['ADMIN', 'SUPER_ADMIN', 'COACH'].includes(user.role) && user.userId !== id) {
      return reply.status(403).send({ error: 'Acceso denegado' })
    }
    try {
      return reply.send(await getUserById(user.gymId, id))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.post('/users', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createUserSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
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
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
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

  // Cualquier usuario autenticado puede eliminar su propia cuenta y todos sus datos
  app.delete('/users/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    await prisma.$transaction([
      prisma.booking.deleteMany({ where: { userId: user.userId } }),
      prisma.rmRecord.deleteMany({ where: { userId: user.userId } }),
      prisma.gymnasticProgress.deleteMany({ where: { userId: user.userId } }),
      prisma.wodResult.deleteMany({ where: { userId: user.userId } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.userId } }),
      prisma.membership.deleteMany({ where: { userId: user.userId } }),
      prisma.user.delete({ where: { id: user.userId } }),
    ])
    return reply.status(200).send({ ok: true, message: 'Cuenta eliminada correctamente' })
  })

  // Cualquier usuario autenticado puede subir su propio avatar
  app.post('/users/me/avatar', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    const user = request.user as any
    try {
      const data = await (request as any).file() as MultipartFile
      if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })

      const avatarUrl = await saveAvatarFile(data, user.userId)
      if (!avatarUrl) {
        return reply.status(400).send({ error: 'Tipo de archivo no permitido. Solo se aceptan JPG, PNG o WebP.' })
      }
      await prisma.user.update({ where: { id: user.userId }, data: { avatarUrl } })
      return reply.send({ avatarUrl })
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })

  app.post('/users/:id/avatar', { preHandler: requireAdmin }, async (request: FastifyRequest, reply) => {
    const admin = request.user as any
    const { id } = request.params as any
    try {
      const existing = await prisma.user.findFirst({ where: { id, gymId: admin.gymId } })
      if (!existing) return reply.status(404).send({ error: 'Usuario no encontrado' })

      const data = await (request as any).file() as MultipartFile
      if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })

      const avatarUrl = await saveAvatarFile(data, id)
      if (!avatarUrl) {
        return reply.status(400).send({ error: 'Tipo de archivo no permitido. Solo se aceptan JPG, PNG o WebP.' })
      }
      try {
        await prisma.user.update({ where: { id }, data: { avatarUrl } })
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al guardar el avatar' })
      }
      return reply.send({ avatarUrl })
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })
}
