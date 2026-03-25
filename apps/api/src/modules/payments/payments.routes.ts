import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { createCheckoutSchema } from './payments.schema'
import { createCheckoutSession, handleStripeWebhook, getPaymentHistory, getRevenueStats } from './payments.service'

export async function paymentRoutes(app: FastifyInstance) {
  app.post('/payments/checkout', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const session = await createCheckoutSession(user.gymId, parsed.data.planId, parsed.data.userId)
      return reply.send(session)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/payments/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string
    if (!signature) return reply.status(400).send({ error: 'Sin firma Stripe' })
    try {
      const result = await handleStripeWebhook(
        Buffer.from(JSON.stringify(request.body)),
        signature,
      )
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.get('/payments/history', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getPaymentHistory(user.gymId))
  })

  app.get('/payments/revenue', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getRevenueStats(user.gymId))
  })
}
