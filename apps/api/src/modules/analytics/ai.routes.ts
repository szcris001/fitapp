import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { getRetentionAlerts, getAiInsights, getAthleteProjection } from './ai.service'

export async function aiRoutes(app: FastifyInstance) {
  app.get('/ai/retention-alerts', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getRetentionAlerts(user.gymId))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/ai/insights', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getAiInsights(user.gymId))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/ai/athlete-projection/:userId', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { userId } = request.params as any
    const targetUserId = user.role === 'ADMIN' ? userId : user.userId
    try {
      return reply.send(await getAthleteProjection(user.gymId, targetUserId))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })
}
