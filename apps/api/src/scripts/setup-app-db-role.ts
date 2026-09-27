/**
 * Habilita el login del rol de base de datos de la app (fitapp_app).
 *
 * La migración 20260927010000_rls_enforced crea el rol sin LOGIN (una contraseña
 * no puede ir en una migración versionada). Este script, idempotente, se corre
 * después de `prisma migrate deploy` con el usuario admin:
 *
 *   DATABASE_ADMIN_URL=postgresql://admin:...@host/db APP_DB_PASSWORD=... \
 *     node dist/scripts/setup-app-db-role.js
 *
 * La app se conecta luego con DATABASE_URL=postgresql://fitapp_app:<APP_DB_PASSWORD>@host/db
 */
import pg from 'pg'

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL
  const password = process.env.APP_DB_PASSWORD
  if (!adminUrl || !password) {
    console.log('[setup-app-db-role] DATABASE_ADMIN_URL o APP_DB_PASSWORD no definidos — se omite')
    return
  }
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    // ALTER ROLE no acepta parámetros: la contraseña se escapa como literal
    await client.query(`ALTER ROLE fitapp_app LOGIN PASSWORD ${client.escapeLiteral(password)}`)
    console.log('[setup-app-db-role] fitapp_app habilitado para login')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[setup-app-db-role] error:', err.message)
  process.exit(1)
})
