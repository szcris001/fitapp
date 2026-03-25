import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth.middleware'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

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
})

export async function superAdminRoutes(app: FastifyInstance) {
  app.get('/superadmin/gyms', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const gyms = await prisma.gym.findMany({
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

  app.get('/superadmin/stats', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const [totalGyms, activeGyms, suspendedGyms, totalUsers, totalMembers] = await Promise.all([
      prisma.gym.count(),
      prisma.gym.count({ where: { status: 'ACTIVE' } }),
      prisma.gym.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      prisma.user.count({ where: { role: 'MEMBER' } }),
    ])
    return reply.send({ totalGyms, activeGyms, suspendedGyms, totalUsers, totalMembers })
  })

  app.post('/superadmin/gyms', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = createGymSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { gymName, gymSlug, adminName, adminEmail, adminPassword, subscriptionPlan } = parsed.data

    const existing = await prisma.gym.findUnique({ where: { slug: gymSlug } })
    if (existing) return reply.status(409).send({ error: 'El slug ya está en uso' })

    const passwordHash = await bcrypt.hash(adminPassword, 10)

    const gym = await prisma.gym.create({
      data: {
        name: gymName,
        slug: gymSlug,
        subscriptionPlan,
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            passwordHash,
            role: 'ADMIN',
          },
        },
      },
      include: { users: { where: { role: 'ADMIN' } } },
    })

    return reply.status(201).send({ gym, admin: gym.users[0] })
  })

  app.patch('/superadmin/gyms/:id/status', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const { status } = request.body as any
    if (!['ACTIVE', 'SUSPENDED', 'TRIAL'].includes(status)) {
      return reply.status(400).send({ error: 'Estado inválido' })
    }
    const gym = await prisma.gym.update({ where: { id }, data: { status } })
    return reply.send(gym)
  })

  app.patch('/superadmin/gyms/:id/subscription', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const { subscriptionPlan } = request.body as any
    const gym = await prisma.gym.update({ where: { id }, data: { subscriptionPlan } })
    return reply.send(gym)
  })

  app.get('/superadmin/gyms/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const gym = await prisma.gym.findUnique({
      where: { id },
      include: {
        users: { where: { role: 'ADMIN' }, select: { id: true, name: true, email: true } },
        _count: { select: { users: true, classes: true } },
      },
    })
    if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
    return reply.send(gym)
  })
}
