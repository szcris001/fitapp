import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Las migraciones corren con el usuario admin (dueño de las tablas). La app en
// runtime usa DATABASE_URL con el rol fitapp_app, sin superusuario ni bypass de RLS.
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_ADMIN_URL o DATABASE_URL debe estar definida')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
  },
})
