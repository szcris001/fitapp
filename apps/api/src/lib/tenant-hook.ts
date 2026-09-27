import { FastifyInstance } from 'fastify'
import { tenantContextStorage } from './tenant-context'

/**
 * Contexto de tenant por request para RLS (ver lib/tenant-context.ts y lib/prisma.ts).
 *
 * onRequest abre un contexto de sistema (bypass) para todo el ciclo de vida del
 * request; si trae un JWT válido con gymId, preHandler lo restringe a ese gym y
 * usuario. Así toda query de un request autenticado corre bajo RLS aunque el
 * service olvide filtrar por gymId. Registrar antes que las rutas.
 */
export function registerTenantContext(app: FastifyInstance) {
  app.addHook('onRequest', (_request, _reply, done) => {
    tenantContextStorage.run({ gymId: null, userId: null, bypassRls: true }, done)
  })

  app.addHook('preHandler', async (request) => {
    if (!request.headers.authorization) return
    try {
      await request.jwtVerify()
    } catch {
      return // las rutas protegidas responden 401 con authenticate()
    }
    const user = request.user as { userId?: string; gymId?: string | null }
    const store = tenantContextStorage.getStore()
    if (!store || !user?.gymId) return // SUPER_ADMIN sin gym: sigue como sistema
    store.gymId = user.gymId
    store.userId = user.userId ?? null
    store.bypassRls = false
  })
}
