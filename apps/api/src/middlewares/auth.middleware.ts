import { FastifyRequest, FastifyReply } from 'fastify'

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
