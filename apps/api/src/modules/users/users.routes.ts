import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { createUserSchema, updateUserSchema } from './users.schema'
import { listUsers, getUserById, createUser, updateUser } from './users.service'

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { status, role } = request.query as any
    return reply.send(await listUsers(user.gymId, status, role))
  })

  app.get('/users/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    try {
      return reply.send(await getUserById(user.gymId, id))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.post('/users', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createUserSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.status(201).send(await createUser(user.gymId, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.put('/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const parsed = updateUserSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.send(await updateUser(user.gymId, id, parsed.data))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })
}
