import { FastifyInstance } from 'fastify'

// Token de solo lectura para /uploads: va en la query (?t=) de las URLs de imágenes,
// así que no puede servir para nada más (authenticate lo rechaza)
export const MEDIA_SCOPE = 'media'

export function signMediaToken(
  app: FastifyInstance,
  payload: { userId: string; gymId: string | null; role: string },
): string {
  return app.jwt.sign(
    { userId: payload.userId, gymId: payload.gymId, role: payload.role, scope: MEDIA_SCOPE },
    { expiresIn: process.env.MEDIA_TOKEN_EXPIRES_IN ?? '12h' },
  )
}
