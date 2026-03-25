import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../../middlewares/auth.middleware'
import { createPlanSchema, createMembershipSchema } from './plans.schema'
import { listPlans, createPlan, deactivatePlan, assignMembership, renewMembership } from './plans.service'

export async function planRoutes(app: FastifyInstance) {
  app.get('/plans', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      const plans = await listPlans(user.gymId)
      return reply.send(plans)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.post('/plans', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createPlanSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }
    try {
      const plan = await createPlan(user.gymId, parsed.data)
      return reply.status(201).send(plan)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.delete('/plans/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    try {
      await deactivatePlan(user.gymId, id)
      return reply.send({ message: 'Plan desactivado' })
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.post('/memberships', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createMembershipSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }
    try {
      const membership = await assignMembership(user.gymId, parsed.data)
      return reply.status(201).send(membership)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/memberships/:userId/renew', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { userId } = request.params as any
    try {
      const membership = await renewMembership(user.gymId, userId)
      return reply.status(201).send(membership)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
