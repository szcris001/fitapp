import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { z } from 'zod'

const pushSchema = z.object({
  target: z.enum(['all', 'active', 'expiring', 'inactive', 'individual']),
  userId: z.string().uuid().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
})

const emailSchema = z.object({
  target: z.enum(['all', 'active', 'expiring', 'inactive', 'individual']),
  userId: z.string().uuid().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
})

async function getTargetUsers(gymId: string, target: string, userId?: string) {
  if (target === 'individual' && userId) {
    return prisma.user.findMany({ where: { id: userId, gymId }, select: { id: true, name: true, email: true } })
  }
  if (target === 'active') {
    return prisma.user.findMany({
      where: { gymId, role: 'MEMBER', memberships: { some: { status: 'ACTIVE' } } },
      select: { id: true, name: true, email: true },
    })
  }
  if (target === 'inactive') {
    return prisma.user.findMany({
      where: { gymId, role: 'MEMBER', memberships: { none: { status: 'ACTIVE' } } },
      select: { id: true, name: true, email: true },
    })
  }
  if (target === 'expiring') {
    const memberships = await prisma.membership.findMany({
      where: {
        user: { gymId },
        status: 'ACTIVE',
        endsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    return memberships.map(m => m.user)
  }
  return prisma.user.findMany({
    where: { gymId, role: 'MEMBER' },
    select: { id: true, name: true, email: true },
  })
}

export async function messageRoutes(app: FastifyInstance) {
  app.post('/messages/push', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = pushSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const targets = await getTargetUsers(user.gymId, parsed.data.target, parsed.data.userId)

    return reply.send({
      message: 'Notificación enviada',
      recipients: targets.length,
      note: 'Integración con Expo Push pendiente — los destinatarios han sido identificados',
      targets: targets.map(t => ({ id: t.id, name: t.name, email: t.email })),
    })
  })

  app.post('/messages/email', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = emailSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const targets = await getTargetUsers(user.gymId, parsed.data.target, parsed.data.userId)

    return reply.send({
      message: 'Emails enviados',
      recipients: targets.length,
      note: 'Integración con Resend pendiente — los destinatarios han sido identificados',
      targets: targets.map(t => ({ id: t.id, name: t.name, email: t.email })),
    })
  })
}
