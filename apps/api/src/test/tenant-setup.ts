/**
 * Setup global de vitest: toda instancia de Fastify creada en los tests registra el
 * contexto de tenant (lib/tenant-hook.ts) y el error handler global (lib/http-error.ts),
 * igual que src/index.ts en producción.
 * Así los tests de rutas corren bajo RLS cuando la base usa el rol fitapp_app:
 * un flujo autenticado que dependa de ver datos de otro gym falla aquí, no en prod.
 */
import { vi } from 'vitest'

vi.mock('fastify', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fastify')>()
  const { registerTenantContext } = await import('../lib/tenant-hook')
  const { registerErrorHandler } = await import('../lib/http-error')
  const real = mod.default
  const withTenantContext = ((opts?: Parameters<typeof real>[0]) => {
    const app = real(opts)
    registerTenantContext(app)
    registerErrorHandler(app)
    return app
  }) as typeof real
  Object.assign(withTenantContext, real)
  return { ...mod, default: withTenantContext }
})
