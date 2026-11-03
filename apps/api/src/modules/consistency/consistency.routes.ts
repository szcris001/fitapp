import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth.middleware'

export async function consistencyRoutes(app: FastifyInstance) {
  app.get('/consistency-badges/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const [badges, gym] = await Promise.all([
      prisma.consistencyBadge.findMany({ where: { userId: user.userId }, orderBy: { periodStart: 'desc' } }),
      prisma.gym.findUnique({ where: { id: user.gymId }, select: { consistencyIncentiveText: true } }),
    ])
    // El premio es el vigente hoy, no un snapshot de cuando se otorgó la insignia
    // (a diferencia de PillarAward.metadata) — es solo texto informativo del gym.
    return reply.send(badges.map(b => ({ ...b, incentiveText: gym?.consistencyIncentiveText ?? null })))
  })
}
