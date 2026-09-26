import 'dotenv/config'
import { PrismaClient } from '../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { getTenantContext } from './tenant-context'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en el archivo .env')
}

const adapter = new PrismaPg({ connectionString })

/**
 * Modelos con Row Level Security activo en PostgreSQL (ver
 * prisma/migrations/20260616000000_enable_rls y 20260625000000_rls_missing_tables).
 * Solo estos modelos necesitan la envoltura transaccional de RLS — el resto
 * (Gym, Movement, tablas de superadmin/config global, PasswordResetToken,
 * RefreshToken, etc.) no tiene policy y no la necesita.
 *
 * IMPORTANTE: si se agrega RLS a una tabla nueva vía migración, hay que sumar
 * el modelo aquí — si no, la query pasará por la conexión "cruda" del pool sin
 * SET LOCAL y RLS bloqueará todo (FORCE ROW LEVEL SECURITY sin bypass) o,
 * peor, quedará con el gymId de una conexión reciclada de otro request.
 */
const RLS_MODELS = new Set([
  'user', 'class', 'classType', 'gymSkill', 'plan', 'wod', 'wodResult',
  'benchmark', 'fintocLink', 'bankMovement',
  'membership', 'booking', 'rmRecord', 'gymnasticProgress',
  'gymSkillMilestone', 'wodBlock', 'wodMovement', 'benchmarkResult',
])

/**
 * Prisma Client Extension — inyecta RLS de forma transparente para todos los
 * services que ya usan `prisma.<model>.<method>()` directamente.
 *
 * ⚠️ NO APLICADA TODAVÍA — ver el `export const prisma` más abajo.
 *
 * Por qué existe (ver `lib/tenant-context.ts` para más detalle): el hook
 * global de Fastify NO puede confiar en `set_config(..., is_local=FALSE)`
 * fuera de una transacción, porque @prisma/adapter-pg usa un pool de
 * conexiones (pg.Pool) y Prisma puede ejecutar cada operación en una
 * conexión física distinta del pool. Sin este extension, el gymId seteado
 * por un request podía quedar "pegado" a una conexión que el pool reasigna
 * a otro request concurrente — condición de carrera con riesgo real de fuga
 * de datos entre gyms o bloqueos RLS intermitentes.
 *
 * La solución intentada: por cada operación sobre un modelo tenant-scoped,
 * abrir una transacción corta y hacer `SET LOCAL app.current_gym_id` + la
 * query real dentro de esa misma transacción — GARANTIZA que ambos
 * statements corren en la misma conexión física, sin importar cómo el pool
 * reparta conexiones entre requests concurrentes. El gymId viene de
 * AsyncLocalStorage (contexto de request), no de un parámetro explícito,
 * para no tener que tocar los ~50 archivos de servicio existentes.
 *
 * BUG CONOCIDO (por qué está desactivada): varios services abren su propia
 * transacción explícita (`prisma.$transaction(async (tx) => {...})`) para
 * hacer varias operaciones atómicamente — p.ej. `POST /superadmin/gyms`
 * (crea Gym + User en la misma tx). Si adentro de esa tx se llama a
 * `tx.user.create()`, esta extensión lo intercepta otra vez (Prisma propaga
 * la extensión a `tx`) y abre OTRA transacción nueva sobre `client` (el
 * cliente base) — una transacción completamente distinta y desconectada de
 * la original. El `User` recién creado ahí no ve el `Gym` que la tx externa
 * todavía no confirmó → `Foreign key constraint violated: User_gymId_fkey`.
 * Reproducido en `POST /superadmin/gyms` (test "crea gym correctamente").
 * Antes de reactivar, hay que resolver el anidamiento de transacciones —
 * ninguna opción evidente sin verificar antes el comportamiento real de
 * `this` dentro de `$allOperations` cuando la extensión corre sobre un
 * cliente `tx` en vez del cliente base.
 *
 * Nota de performance: una transacción por query tiene overhead extra vs.
 * ejecutar la query suelta. Es aceptable porque RLS es defensa en
 * profundidad, no la capa primaria — la primaria sigue siendo el filtro
 * `gymId` explícito en cada service (ver CLAUDE.md, regla multi-tenancy).
 */
function withRlsExtension(client: PrismaClient) {
  return client.$extends({
    name: 'rls-tenant-context',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelName = model ? model.charAt(0).toLowerCase() + model.slice(1) : undefined

          // Modelos globales / sin policy RLS → ejecutar directo, sin envoltura.
          if (!modelName || !RLS_MODELS.has(modelName)) {
            return query(args)
          }

          const { gymId, bypassRls } = getTenantContext()

          // IMPORTANTE: la transacción se abre sobre `client` (el cliente BASE,
          // sin extensión), nunca sobre el cliente ya extendido. Verificado
          // empíricamente: invocar `tx.<model>.<operation>()` dentro de una
          // transacción abierta desde el cliente extendido vuelve a pasar por
          // $allOperations (Prisma propaga la extensión a `tx`), causando
          // recursión infinita hasta agotar el pool. Usar el cliente base
          // rompe ese ciclo porque `tx` derivado de él no tiene la extensión.
          return client.$transaction(async (tx) => {
            if (bypassRls || !gymId) {
              await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'true', TRUE)`
              await tx.$executeRaw`SELECT set_config('app.current_gym_id', '', TRUE)`
            } else {
              await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'false', TRUE)`
              await tx.$executeRaw`SELECT set_config('app.current_gym_id', ${gymId}::text, TRUE)`
            }

            return (tx as any)[model as string][operation](args)
          })
        },
      },
    },
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// El role de la app (`fitapp`, ver DATABASE_URL) tiene BYPASSRLS vía el role
// `fitapp_superadmin` otorgado en la migración `20260616000000_enable_rls`,
// así que aunque las tablas tengan FORCE ROW LEVEL SECURITY activo, este
// cliente no queda bloqueado — RLS queda inerte (ni protege ni rompe nada)
// hasta que `withRlsExtension` se resuelva y se aplique explícitamente.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
