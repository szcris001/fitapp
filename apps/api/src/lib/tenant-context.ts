import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexto de tenant (gymId) propagado por request vía AsyncLocalStorage.
 *
 * Por qué existe: el Prisma Client Extension en `lib/prisma.ts` necesita saber,
 * en cada query, a qué gym pertenece el request actual para poder inyectar
 * `SET LOCAL app.current_gym_id` dentro de la misma transacción/conexión física
 * que ejecuta esa query. Como Prisma usa un pool de conexiones (vía @prisma/adapter-pg
 * → pg.Pool), NO se puede confiar en `set_config(..., is_local=FALSE)` a nivel de
 * hook global: la conexión que ejecuta el `set_config` puede no ser la misma que
 * ejecuta la query real de la ruta, y el pool reutiliza conexiones entre requests
 * concurrentes. AsyncLocalStorage resuelve el "cómo sé qué gymId aplica aquí" sin
 * tener que pasar `tx`/`gymId` explícitamente por cada uno de los ~50 archivos de
 * servicio que hoy importan `prisma` directamente.
 */
export interface TenantContext {
  gymId: string | null
  bypassRls: boolean
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>()

export function getTenantContext(): TenantContext {
  return tenantContextStorage.getStore() ?? { gymId: null, bypassRls: true }
}

export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return tenantContextStorage.run(ctx, fn)
}
