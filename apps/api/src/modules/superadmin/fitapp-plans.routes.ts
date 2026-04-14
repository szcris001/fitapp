import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth.middleware'

async function requireSuperAdmin(request: any, reply: any) {
  await authenticate(request, reply)
  if ((request.user as any).role !== 'SUPER_ADMIN')
    return reply.status(403).send({ error: 'Acceso solo para super administrador' })
}

const SYSTEM_PLANS = [
  { slug: 'trial',        name: 'Trial',        priceCLP: 0,       priceUSD: 0,   durationDays: 30,  isFree: true,  color: 'gray',   features: ['Hasta 30 miembros', 'Clases ilimitadas', 'Sin soporte prioritario'] },
  { slug: 'go_pro',       name: 'Go Pro',       priceCLP: 29900,   priceUSD: 29,  durationDays: 30,  isFree: false, color: 'blue',   features: ['Hasta 100 miembros', 'Clases ilimitadas', 'Soporte por email', 'Reportes básicos'] },
  { slug: 'business',     name: 'Business',     priceCLP: 59900,   priceUSD: 59,  durationDays: 30,  isFree: false, color: 'purple', features: ['Miembros ilimitados', 'Multi-sede', 'Soporte prioritario', 'Reportes avanzados', 'API access'] },
  { slug: 'business_pro', name: 'Business Pro', priceCLP: 99900,   priceUSD: 99,  durationDays: 30,  isFree: false, color: 'gold',   features: ['Todo Business', 'Onboarding personalizado', 'SLA garantizado', 'Manager dedicado'] },
]

export async function ensureFitAppPlans() {
  for (const p of SYSTEM_PLANS) {
    await prisma.fitAppPlan.upsert({
      where: { slug: p.slug },
      create: p,
      update: { color: p.color },
    })
  }
}

const planSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional().nullable(),
  priceCLP:     z.number().int().min(0),
  priceUSD:     z.number().int().min(0).optional(),
  durationDays: z.number().int().min(1).optional(),
  features:     z.array(z.string()).optional(),
  isActive:     z.boolean().optional(),
  isFree:       z.boolean().optional(),
  color:        z.string().optional().nullable(),
})

export async function fitAppPlansRoutes(app: FastifyInstance) {
  app.get('/superadmin/fitapp-plans', { preHandler: requireSuperAdmin }, async (_req, reply) => {
    const plans = await prisma.fitAppPlan.findMany({ orderBy: { priceCLP: 'asc' } })
    return reply.send(plans)
  })

  app.post('/superadmin/fitapp-plans', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = planSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const slug = `plan_${Date.now()}`
    const plan = await prisma.fitAppPlan.create({ data: { slug, ...parsed.data, features: parsed.data.features ?? [] } })
    return reply.status(201).send(plan)
  })

  app.patch('/superadmin/fitapp-plans/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = planSchema.partial().safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const plan = await prisma.fitAppPlan.update({ where: { id }, data: parsed.data })
    return reply.send(plan)
  })

  app.delete('/superadmin/fitapp-plans/:id', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const plan = await prisma.fitAppPlan.findUnique({ where: { id } })
    if (!plan) return reply.status(404).send({ error: 'Plan no encontrado' })
    const inUse = await prisma.gymSubscription.count({ where: { planId: id, status: 'ACTIVE' } })
    if (inUse > 0) return reply.status(400).send({ error: 'El plan tiene suscripciones activas' })
    await prisma.fitAppPlan.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}
