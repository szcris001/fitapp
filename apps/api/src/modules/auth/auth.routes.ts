import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { loginSchema } from './auth.schema'
import {
  loginUser,
  forgotPassword,
  resetPassword,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from './auth.service'
import { authenticate } from '../../middlewares/auth.middleware'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

const forgotSchema = z.object({
  email: z.string().email(),
  gymSlug: z.string().optional(),
})

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
})

export async function authRoutes(app: FastifyInstance) {
  // Rate limit en rutas sensibles: más permisivo en dev para no bloquear pruebas
  const isDev = process.env.NODE_ENV !== 'production'
  const authRateLimit = {
    config: {
      rateLimit: { max: isDev ? 50 : 10, timeWindow: '15 minutes' },
    },
  }

  app.post('/auth/login', { ...authRateLimit }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const user = await loginUser(parsed.data)
      const token = app.jwt.sign(user, { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' })
      const refreshToken = await createRefreshToken(user.userId)
      return reply.status(200).send({ token, refreshToken, user })
    } catch (err: any) {
      return reply.status(401).send({ error: err.message })
    }
  })

  app.post('/auth/refresh', { ...authRateLimit }, async (request, reply) => {
    const parsed = refreshBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const { userId, newRaw } = await rotateRefreshToken(parsed.data.refreshToken)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, gymId: true, email: true, name: true, role: true, avatarUrl: true, mustChangePassword: true },
      })
      if (!user) return reply.status(401).send({ error: 'Sesión inválida' })
      const payload = {
        userId: user.id,
        gymId: user.gymId,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
        mustChangePassword: user.mustChangePassword,
      }
      const token = app.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' })
      return reply.status(200).send({ token, refreshToken: newRaw })
    } catch (err: any) {
      return reply.status(401).send({ error: err.message })
    }
  })

  app.post('/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    const parsed = refreshBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const { userId } = request.user as any
    await revokeRefreshToken(userId, parsed.data.refreshToken)
    return reply.status(200).send({ message: 'Sesión cerrada correctamente' })
  })

  app.post('/auth/forgot-password', { ...authRateLimit }, async (request, reply) => {
    const parsed = forgotSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    // Always return 200 to avoid email enumeration
    await forgotPassword(parsed.data.email, parsed.data.gymSlug).catch(err =>
      console.error('[Auth] forgot-password error:', err.message),
    )
    return reply.send({ message: 'Si el correo existe, recibirás un link para restablecer tu contraseña.' })
  })

  // Perfil propio — cualquier usuario autenticado
  app.get('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as any
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, role: true, avatarUrl: true, gymId: true },
    })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send(user)
  })

  app.put('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as any
    const schema = z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(6).optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { name, email, phone, currentPassword, newPassword } = parsed.data
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })

    const updateData: any = {}
    if (name) updateData.name = name
    if (phone !== undefined) updateData.phone = phone

    if (email && email !== user.email) {
      // Verificar unicidad solo dentro del mismo gimnasio (multi-tenancy)
      // El email puede existir en otro gym — eso es válido por diseño
      const existing = await prisma.user.findFirst({
        where: { email, gymId: user.gymId ?? null, NOT: { id: userId } },
      })
      if (existing) return reply.status(400).send({ error: 'El email ya está en uso' })
      updateData.email = email
    }

    if (newPassword) {
      if (!currentPassword) return reply.status(400).send({ error: 'Debes ingresar tu contraseña actual' })
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) return reply.status(400).send({ error: 'Contraseña actual incorrecta' })
      updateData.passwordHash = await bcrypt.hash(newPassword, 10)
      updateData.mustChangePassword = false
    }

    let updated
    try {
      updated = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, name: true, email: true, phone: true, role: true, avatarUrl: true },
      })
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar el perfil' })
    }
    return reply.send(updated)
  })

  app.post('/auth/reset-password', { ...authRateLimit }, async (request, reply) => {
    const parsed = resetSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      await resetPassword(parsed.data.token, parsed.data.password)
      return reply.send({ message: 'Contraseña actualizada correctamente' })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
