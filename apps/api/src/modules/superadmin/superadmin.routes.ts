import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth.middleware'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prismaErrorMessage } from '../../lib/prismaError'
import { sendWelcomeEmail } from '../../lib/email'
import { createGymSubscriptionCheckout, getGymSubscriptionStatus } from '../payments/payments.service'

async function requireSuperAdmin(request: any, reply: any) {
  await authenticate(request, reply)
  const user = request.user as any
  if (user.role !== 'SUPER_ADMIN') {
    return reply.status(403).send({ error: 'Acceso solo para super administrador' })
  }
}

const createGymSchema = z.object({
  gymName: z.string().min(2),
  gymSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  subscriptionPlan: z.enum(['trial', 'go_pro', 'business', 'business_pro']).default('trial'),
  trialDays: z.number().int().min(0).default(30),
})

export async function superAdminRoutes(app: FastifyInstance) {
  app.get('/superadmin/gyms', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const gyms = await prisma.gym.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { users: true, classes: true } },
        users: {
          where: { role: 'ADMIN' },
          select: { name: true, email: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(gyms)
  })

  app.get('/superadmin/gyms/history', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const gyms = await prisma.gym.findMany({
      where: { deletedAt: { not: null } },
      include: {
        _count: { select: { users: true, classes: true } },
        users: {
          where: { role: 'ADMIN' },
          select: { name: true, email: true },
          take: 1,
        },
      },
      orderBy: { deletedAt: 'desc' },
    })
    return reply.send(gyms)
  })

  app.delete('/superadmin/gyms/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const gym = await prisma.gym.findUnique({ where: { id } })
    if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
    if (gym.deletedAt) return reply.status(400).send({ error: 'El gimnasio ya está eliminado' })
    try {
      const updated = await prisma.gym.update({ where: { id }, data: { deletedAt: new Date(), status: 'SUSPENDED' } })
      return reply.send(updated)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al eliminar el gimnasio' })
    }
  })

  app.delete('/superadmin/gyms/:id/permanent', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const gym = await prisma.gym.findUnique({ where: { id } })
    if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
    if (!gym.deletedAt) return reply.status(400).send({ error: 'El gimnasio debe estar en el historial antes de eliminarlo permanentemente' })

    try {
      await prisma.gym.delete({ where: { id } })
      return reply.send({ ok: true })
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al eliminar permanentemente' })
    }
  })

  app.post('/superadmin/gyms/:id/restore', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const gym = await prisma.gym.findUnique({ where: { id } })
    if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
    if (!gym.deletedAt) return reply.status(400).send({ error: 'El gimnasio no está eliminado' })
    try {
      const updated = await prisma.gym.update({ where: { id }, data: { deletedAt: null, status: 'ACTIVE' } })
      return reply.send(updated)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al restaurar el gimnasio' })
    }
  })

  app.get('/superadmin/stats', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const [totalGyms, activeGyms, suspendedGyms, totalUsers, totalMembers, deletedGyms] = await Promise.all([
      prisma.gym.count({ where: { deletedAt: null } }),
      prisma.gym.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.gym.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      prisma.user.count({ where: { role: 'MEMBER' } }),
      prisma.gym.count({ where: { deletedAt: { not: null } } }),
    ])
    return reply.send({ totalGyms, activeGyms, suspendedGyms, totalUsers, totalMembers, deletedGyms })
  })

  app.post('/superadmin/gyms', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = createGymSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { gymName, gymSlug, adminName, adminEmail, adminPassword, subscriptionPlan, trialDays } = parsed.data

    // Solo bloquea si el slug está en uso por un gym NO eliminado
    const existingSlug = await prisma.gym.findFirst({ where: { slug: gymSlug, deletedAt: null } })
    if (existingSlug) return reply.status(409).send({ error: 'El slug ya está en uso' })

    const passwordHash = await bcrypt.hash(adminPassword, 10)

    // Si el email ya existe en un gym eliminado, reutilizamos ese usuario
    const existingUser = await prisma.user.findFirst({ where: { email: adminEmail } })
    if (existingUser) {
      const userGym = existingUser.gymId
        ? await prisma.gym.findUnique({ where: { id: existingUser.gymId } })
        : null
      // Bloquea solo si el gym asociado existe y NO está eliminado
      if (userGym && !userGym.deletedAt) {
        return reply.status(409).send({ error: 'El email del administrador ya está en uso' })
      }
    }

    let gym
    try {
      gym = await prisma.$transaction(async (tx) => {
        const newGym = await tx.gym.create({
          data: {
            name: gymName,
            slug: gymSlug,
            subscriptionPlan,
            ownerEmail: adminEmail,
          },
        })

        if (existingUser) {
          // Reutiliza el usuario del gym eliminado
          await tx.user.update({
            where: { id: existingUser.id },
            data: { name: adminName, passwordHash, role: 'ADMIN', gymId: newGym.id, mustChangePassword: true },
          })
        } else {
          await tx.user.create({
            data: { name: adminName, email: adminEmail, passwordHash, role: 'ADMIN', gymId: newGym.id, mustChangePassword: true },
          })
        }

        return tx.gym.findUnique({
          where: { id: newGym.id },
          include: { users: { where: { role: 'ADMIN' } } },
        })
      })
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al crear el gimnasio' })
    }

    // Crear GymSubscription inicial
    const fitPlan = await prisma.fitAppPlan.findFirst({ where: { slug: subscriptionPlan } })
    if (fitPlan && gym) {
      const start = new Date()
      const end = new Date()
      if (trialDays > 0) {
        // Con periodo de prueba
        end.setDate(end.getDate() + trialDays)
        await prisma.gymSubscription.create({
          data: { gymId: gym.id, planId: fitPlan.id, status: 'TRIAL', startsAt: start, endsAt: end },
        })
        await prisma.gym.update({ where: { id: gym.id }, data: { status: 'TRIAL' } })
      } else {
        // Sin trial: cobra de inmediato — gym queda SUSPENDED hasta que pague
        end.setDate(end.getDate() + fitPlan.durationDays)
        await prisma.gymSubscription.create({
          data: { gymId: gym.id, planId: fitPlan.id, status: 'EXPIRED', startsAt: start, endsAt: start },
        })
        await prisma.gym.update({ where: { id: gym.id }, data: { status: 'SUSPENDED' } })
      }
    }

    // Enviar correo de bienvenida
    let emailPreviewUrl: string | undefined
    let emailError: string | undefined
    try {
      const emailResult = await sendWelcomeEmail({
        adminName,
        adminEmail,
        gymName,
        gymSlug,
        tempPassword: adminPassword,
      })
      emailPreviewUrl = emailResult.previewUrl
    } catch (err: any) {
      emailError = err.message
      console.error('[SuperAdmin] Error enviando welcome email:', err.message)
    }

    return reply.status(201).send({ gym, admin: gym!.users[0], emailPreviewUrl, emailError })
  })

  app.patch('/superadmin/gyms/:id/status', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const { status } = request.body as any
    if (!['ACTIVE', 'SUSPENDED', 'TRIAL'].includes(status)) {
      return reply.status(400).send({ error: 'Estado inválido' })
    }
    try {
      const gym = await prisma.gym.update({ where: { id }, data: { status } })
      return reply.send(gym)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar el estado' })
    }
  })

  app.patch('/superadmin/gyms/:id/subscription', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const { subscriptionPlan } = request.body as any
    try {
      const plan = await prisma.fitAppPlan.findFirst({ where: { slug: subscriptionPlan } })
      const gym = await prisma.gym.update({ where: { id }, data: { subscriptionPlan } })

      // Sincronizar GymSubscription
      if (plan) {
        const start = new Date()
        const end = new Date(); end.setDate(end.getDate() + plan.durationDays)
        await prisma.gymSubscription.updateMany({
          where: { gymId: id, status: { in: ['ACTIVE', 'TRIAL'] } },
          data: { status: 'CANCELLED' },
        })
        await prisma.gymSubscription.create({
          data: { gymId: id, planId: plan.id, status: plan.isFree ? 'TRIAL' : 'ACTIVE', startsAt: start, endsAt: end },
        })
      }

      return reply.send(gym)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar la suscripción' })
    }
  })

  app.get('/superadmin/gyms/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const gym = await prisma.gym.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: { in: ['ADMIN', 'COACH'] } },
          select: { id: true, name: true, email: true, role: true },
        },
        _count: { select: { users: true, classes: true } },
      },
    })
    if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
    return reply.send(gym)
  })

  const resetPasswordSchema = z.object({
    userId:      z.string().uuid(),
    newPassword: z.string().min(6),
  })

  app.post('/superadmin/gyms/:id/reset-password', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = resetPasswordSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { userId, newPassword } = parsed.data

    const user = await prisma.user.findFirst({
      where: { id: userId, gymId: id, role: { in: ['ADMIN', 'COACH'] } },
    })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado en este gimnasio' })

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    })

    return reply.send({ ok: true, message: 'Contraseña actualizada correctamente' })
  })

  // Generar link de pago Stripe para la suscripción de un gym
  app.post('/superadmin/gyms/:id/checkout', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const { planId } = request.body as any
    if (!planId) return reply.status(400).send({ error: 'planId requerido' })
    try {
      const result = await createGymSubscriptionCheckout(id, planId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Estado de suscripción de un gym
  app.get('/superadmin/gyms/:id/subscription', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    try {
      return reply.send(await getGymSubscriptionStatus(id))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })


  const editGymSchema = z.object({
    name:             z.string().min(2).optional(),
    slug:             z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    ownerEmail:       z.string().email().optional().nullable(),
    subscriptionPlan: z.enum(['trial', 'go_pro', 'business', 'business_pro']).optional(),
    status:           z.enum(['ACTIVE', 'SUSPENDED', 'TRIAL']).optional(),
    address:          z.string().optional().nullable(),
    phone:            z.string().optional().nullable(),
    email:            z.string().email().optional().nullable(),
    instagram:        z.string().optional().nullable(),
    facebook:         z.string().optional().nullable(),
    adminName:        z.string().min(2).optional(),
    adminEmail:       z.string().email().optional(),
  })

  app.patch('/superadmin/gyms/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = editGymSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { adminName, adminEmail, ...gymData } = parsed.data

    if (gymData.slug) {
      const conflict = await prisma.gym.findFirst({ where: { slug: gymData.slug, NOT: { id } } })
      if (conflict) return reply.status(409).send({ error: 'El slug ya está en uso por otro gimnasio' })
    }

    if (adminEmail) {
      const conflict = await prisma.user.findFirst({ where: { email: adminEmail, NOT: { gymId: id } } })
      if (conflict) return reply.status(409).send({ error: 'El email del administrador ya está en uso' })
    }

    try {
      if (adminName || adminEmail) {
        await prisma.user.updateMany({
          where: { gymId: id, role: 'ADMIN' },
          data: {
            ...(adminName  ? { name: adminName }  : {}),
            ...(adminEmail ? { email: adminEmail } : {}),
          },
        })
      }

      const gym = await prisma.gym.update({
        where: { id },
        data: {
          ...gymData,
          ...(adminEmail ? { ownerEmail: adminEmail } : {}),
        },
        include: {
          users: { where: { role: 'ADMIN' }, select: { id: true, name: true, email: true } },
        },
      })

      return reply.send(gym)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar el gimnasio' })
    }
  })
}
