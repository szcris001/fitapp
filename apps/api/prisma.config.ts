import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Las migraciones corren con el usuario admin (dueño de las tablas). La app en
// runtime usa DATABASE_URL con el rol fitapp_app, sin superusuario ni bypass de RLS.
// Sin URL (p. ej. `prisma generate` en el build de Docker) no se define datasource:
// Prisma solo la exige en los comandos que se conectan a la base.
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(url ? { datasource: { url } } : {}),
})
