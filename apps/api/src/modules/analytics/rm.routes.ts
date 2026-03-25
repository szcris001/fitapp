import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createRmSchema, createGymnasticProgressSchema } from './rm.schema'
import {
  getRmsByUser, createRm, getGymRmEvolution,
  getGymnasticProgressByUser, createGymnasticProgress,
} from './rm.service'

export async function rmRoutes(app: FastifyInstance) {
  app.get('/rms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getRmsByUser(user.userId))
  })

  app.get('/rms/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const { userId } = request.params as any
    return reply.send(await getRmsByUser(userId))
  })

  app.post('/rms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = createRmSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const rm = await createRm(user.userId, user.gymId, parsed.data)
      return reply.status(201).send(rm)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.get('/rms/gym-evolution', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getGymRmEvolution(user.gymId))
  })

  app.get('/gymnastic-progress/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getGymnasticProgressByUser(user.userId))
  })

  app.get('/gymnastic-progress/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const { userId } = request.params as any
    return reply.send(await getGymnasticProgressByUser(userId))
  })

  app.post('/gymnastic-progress/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = createGymnasticProgressSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const progress = await createGymnasticProgress(user.userId, user.gymId, parsed.data)
      return reply.status(201).send(progress)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
