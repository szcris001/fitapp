import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexto de tenant del request actual, propagado con AsyncLocalStorage.
 *
 * lib/prisma.ts lo lee cada vez que toma una conexión del pool y fija en ella
 * app.current_gym_id / app.current_user_id / app.bypass_rls, que usan las
 * policies de RLS (migración 20260927010000_rls_enforced).
 *
 * - Request autenticado con gym → { gymId, userId, bypassRls: false }: RLS filtra.
 * - Sin contexto (cron, webhooks, login, seeds al arrancar) o SUPER_ADMIN sin gym
 *   → bypass: es código de sistema que opera sobre varios gyms a propósito.
 */
export interface TenantContext {
  gymId: string | null
  userId: string | null
  bypassRls: boolean
}

const SYSTEM_CONTEXT: TenantContext = { gymId: null, userId: null, bypassRls: true }

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>()

export function getTenantContext(): TenantContext {
  return tenantContextStorage.getStore() ?? SYSTEM_CONTEXT
}

export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return tenantContextStorage.run(ctx, fn)
}
