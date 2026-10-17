import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth.middleware'

export async function consistencyRoutes(app: FastifyInstance) {
  app.get('/consistency-badges/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const badges = await prisma.consistencyBadge.findMany({
      where: { userId: user.userId },
      orderBy: { periodStart: 'desc' },
    })
    return reply.send(badges)
  })
}
