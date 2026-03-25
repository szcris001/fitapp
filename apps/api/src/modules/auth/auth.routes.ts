import { FastifyInstance } from 'fastify'
import { loginSchema } from './auth.schema'
import { loginUser } from './auth.service'

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }
    try {
      const user = await loginUser(parsed.data)
      const token = app.jwt.sign(user)
      return reply.status(200).send({ token, user })
    } catch (err: any) {
      return reply.status(401).send({ error: err.message })
    }
  })
}
