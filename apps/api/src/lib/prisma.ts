import 'dotenv/config'
import { PrismaClient } from '../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getTenantContext, TenantContext } from './tenant-context'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en el archivo .env')
}

/**
 * Pool de pg que fija el contexto de tenant en cada conexión que entrega.
 *
 * Todas las queries de Prisma pasan por `pool.connect()` (las sueltas vía
 * `pool.query()`, las transacciones con una sola conexión para toda la tx). El
 * contexto se captura de AsyncLocalStorage en el momento de pedir la conexión —
 * el del request que la pide — y se fija con set_config de sesión antes de
 * entregarla. Como se vuelve a fijar en cada checkout, una conexión reciclada
 * nunca conserva el gym de otro request. Si el valor ya era el mismo, no hay
 * viaje extra a la base.
 */
type TenantClient = pg.PoolClient & { __tenantKey?: string }

async function applyTenantContext(client: TenantClient, ctx: TenantContext) {
  const key = `${ctx.bypassRls}|${ctx.gymId ?? ''}|${ctx.userId ?? ''}`
  if (client.__tenantKey === key) return
  await client.query(
    `SELECT set_config('app.bypass_rls', $1, false),
            set_config('app.current_gym_id', $2, false),
            set_config('app.current_user_id', $3, false)`,
    [ctx.bypassRls ? 'on' : 'off', ctx.gymId ?? '', ctx.userId ?? ''],
  )
  client.__tenantKey = key
}

export class TenantAwarePool extends pg.Pool {
  connect(): Promise<pg.PoolClient>
  connect(cb: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: any) => void) => void): void
  connect(cb?: any): any {
    const ctx = getTenantContext() // contexto de quien pide la conexión
    if (typeof cb === 'function') {
      super.connect((err, client, release) => {
        if (err || !client) return cb(err, client, release)
        applyTenantContext(client, ctx).then(
          () => cb(undefined, client, release),
          (e) => { release(e); cb(e, undefined, () => {}) },
        )
      })
      return
    }
    return super.connect().then(async (client) => {
      try {
        await applyTenantContext(client, ctx)
      } catch (e) {
        client.release(e as Error)
        throw e
      }
      return client
    })
  }
}

// findFirst no acepta claves únicas compuestas (userId_classId: { userId, classId }):
// se expanden a sus campos. Todas las @@unique del schema usan el nombre por defecto.
function expandCompoundUnique(where: Record<string, any> = {}) {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(where)) {
    const isCompound = value && typeof value === 'object' && !Array.isArray(value)
      && key.includes('_') && Object.keys(value).sort().join('_') === key.split('_').sort().join('_')
    if (isCompound) Object.assign(out, value)
    else out[key] = value
  }
  return out
}

// Prisma no expone en el tipo si la operación corre dentro de un $transaction;
// __internalParams.transaction está presente en ese caso (verificado en Prisma 7.5)
function inTransaction(params: object): boolean {
  return Boolean((params as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction)
}

/**
 * findUnique se agrupa (dataloader de Prisma) con otros findUnique del mismo tick,
 * aunque vengan de requests distintos: la query combinada correría con el contexto
 * de uno solo. findFirst no se agrupa, así cada query usa el contexto de su request.
 */
function withoutCrossRequestBatching(client: PrismaClient) {
  const delegate = (model: string) => (client as any)[model.charAt(0).toLowerCase() + model.slice(1)]
  return client.$extends({
    name: 'no-cross-request-batching',
    query: {
      $allModels: {
        // Dentro de una transacción (interactiva o en lote) todo es del mismo request y
        // la query debe correr en la tx: se deja el findUnique original.
        findUnique({ model, args, query, ...params }) {
          if (inTransaction(params)) return query(args)
          return delegate(model).findFirst({ ...args, where: expandCompoundUnique(args.where) })
        },
        findUniqueOrThrow({ model, args, query, ...params }) {
          if (inTransaction(params)) return query(args)
          return delegate(model).findFirstOrThrow({ ...args, where: expandCompoundUnique(args.where) })
        },
      },
    },
  })
}

export function createPrismaClient(url: string) {
  const adapter = new PrismaPg(new TenantAwarePool({ connectionString: url }))
  return withoutCrossRequestBatching(new PrismaClient({ adapter }))
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient(connectionString)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
