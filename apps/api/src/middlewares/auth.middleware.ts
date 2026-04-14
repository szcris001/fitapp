import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'

// Rutas permitidas aunque el gym esté suspendido (pago + lectura básica de suscripción)
const ALLOWED_SUSPENDED_PATHS = [
  '/api/auth/',
  '/api/gyms/me/subscription',
  '/api/payments/webhook',
  '/api/superadmin/',
]

function isSuspendedAllowed(url: string) {
  return ALLOWED_SUSPENDED_PATHS.some(p => url.startsWith(p))
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'Token inválido o expirado' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  const user = request.user as any
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return reply.status(403).send({ error: 'Se requiere rol de administrador' })
  }
}

export async function requireCoachOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  const user = request.user as any
  if (!['ADMIN', 'SUPER_ADMIN', 'COACH'].includes(user.role)) {
    return reply.status(403).send({ error: 'Se requiere rol de coach o administrador' })
  }
}

/**
 * Verifica que el gym del usuario tenga suscripción activa.
 * No bloquea a SUPER_ADMIN ni rutas de pago/suscripción.
 */
export async function requireActiveGym(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  if (!user?.gymId || user.role === 'SUPER_ADMIN') return

  // Permitir rutas de pago y suscripción aunque esté suspendido
  if (isSuspendedAllowed(request.url)) return

  const gym = await prisma.gym.findUnique({ where: { id: user.gymId }, select: { status: true } })
  if (gym?.status === 'SUSPENDED') {
    return reply.status(402).send({
      error: 'Suscripción vencida',
      code: 'GYM_SUSPENDED',
      message: 'La suscripción de tu gimnasio ha vencido. Por favor renueva para continuar.',
    })
  }
}
