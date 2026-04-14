import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth.middleware'

async function requireSuperAdmin(request: any, reply: any) {
  await authenticate(request, reply)
  if ((request.user as any).role !== 'SUPER_ADMIN')
    return reply.status(403).send({ error: 'Acceso solo para super administrador' })
}

export async function gymSubscriptionsRoutes(app: FastifyInstance) {
  // GET — listar todas las suscripciones con info del gym y plan
  app.get('/superadmin/gym-subscriptions', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { status } = request.query as any
    const where: any = {}
    if (status) where.status = status

    const subs = await prisma.gymSubscription.findMany({
      where,
      include: {
        gym:  { select: { id: true, name: true, slug: true, country: true, ownerEmail: true, status: true } },
        plan: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { endsAt: 'asc' },
    })
    return reply.send(subs)
  })

  // GET — suscripción activa de un gym
  app.get('/superadmin/gym-subscriptions/:gymId', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { gymId } = request.params as any
    const sub = await prisma.gymSubscription.findFirst({
      where: { gymId, status: { in: ['ACTIVE', 'TRIAL'] } },
      include: { plan: true, payments: { orderBy: { createdAt: 'desc' } } },
    })
    return reply.send(sub ?? null)
  })

  // POST — crear o renovar suscripción para un gym
  app.post('/superadmin/gym-subscriptions', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const schema = z.object({
      gymId:   z.string(),
      planId:  z.string(),
      startsAt: z.string().optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { gymId, planId, startsAt } = parsed.data
    const plan = await prisma.fitAppPlan.findUnique({ where: { id: planId } })
    if (!plan) return reply.status(404).send({ error: 'Plan no encontrado' })

    const start = startsAt ? new Date(startsAt) : new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + plan.durationDays)

    // Cancelar suscripción activa anterior
    await prisma.gymSubscription.updateMany({
      where: { gymId, status: { in: ['ACTIVE', 'TRIAL'] } },
      data:  { status: 'CANCELLED' },
    })

    const sub = await prisma.gymSubscription.create({
      data: {
        gymId, planId,
        status:   plan.isFree ? 'TRIAL' : 'ACTIVE',
        startsAt: start,
        endsAt:   end,
      },
      include: { plan: true },
    })

    // Sincronizar subscriptionPlan en Gym
    await prisma.gym.update({ where: { id: gymId }, data: { subscriptionPlan: plan.slug } })

    return reply.status(201).send(sub)
  })

  // PATCH — cambiar estado manualmente
  app.patch('/superadmin/gym-subscriptions/:id/status', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const { status } = request.body as any
    const sub = await prisma.gymSubscription.update({ where: { id }, data: { status } })
    return reply.send(sub)
  })
}
