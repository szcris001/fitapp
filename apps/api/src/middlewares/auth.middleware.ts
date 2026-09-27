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

// Rutas que un SUPER_ADMIN sin gym seleccionado (gymId null) puede usar: su panel y
// las de multi-sede para elegir un gym. Todo lo demás usa user.gymId en las queries.
// (/gyms/me/subscription responde 400 por sí misma si no hay gym.)
const SUPER_ADMIN_NO_GYM_PATHS = [
  '/api/superadmin/',
  '/api/gyms/my-sedes',
  '/api/gyms/switch-sede',
  '/api/gyms/me/subscription',
]

function isSuperAdminNoGymPath(url: string) {
  return SUPER_ADMIN_NO_GYM_PATHS.some(p => url.startsWith(p))
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
  // SUPER_ADMIN sin gymId no puede operar sobre recursos de un gimnasio específico.
  // Los endpoints de negocio usan user.gymId en cada query — con gymId=null se obtendrían
  // resultados erróneos o queries fallidas. Bloquear aquí es la defensa correcta.
  if (user.role === 'SUPER_ADMIN' && !user.gymId && !isSuperAdminNoGymPath(request.url)) {
    return reply.status(403).send({ error: 'SUPER_ADMIN debe seleccionar un gimnasio para esta operación' })
  }
}

export async function requireCoachOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  const user = request.user as any
  if (!['ADMIN', 'SUPER_ADMIN', 'COACH'].includes(user.role)) {
    return reply.status(403).send({ error: 'Se requiere rol de coach o administrador' })
  }
  // Misma protección: SUPER_ADMIN sin gymId no puede operar sobre datos de gym
  if (user.role === 'SUPER_ADMIN' && !user.gymId && !isSuperAdminNoGymPath(request.url)) {
    return reply.status(403).send({ error: 'SUPER_ADMIN debe seleccionar un gimnasio para esta operación' })
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
