/**
 * Crea (o resetea la contraseña de) un SUPER_ADMIN. No hay flujo de registro público
 * para este rol — a diferencia de un gym nuevo (POST /auth/register, que crea un ADMIN
 * con su propio gym), un SUPER_ADMIN se crea una sola vez por entorno con este script.
 *
 * Idempotente por email: si ya existe, actualiza su contraseña (útil para rotarla) y
 * fuerza mustChangePassword en ambos casos, para no dejar la contraseña generada aquí
 * como definitiva.
 *
 *   SUPERADMIN_EMAIL=you@dominio.com SUPERADMIN_PASSWORD=... \
 *     DATABASE_ADMIN_URL=postgresql://admin:...@host/db \
 *     node dist/scripts/create-superadmin.js
 *
 * Usa DATABASE_ADMIN_URL (como seed-qa.ts): es una tarea de administración, fuera de RLS.
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma'

async function main() {
  const email = process.env.SUPERADMIN_EMAIL
  const password = process.env.SUPERADMIN_PASSWORD
  const name = process.env.SUPERADMIN_NAME || 'Super Admin'
  if (!email || !password) {
    console.error('[create-superadmin] faltan SUPERADMIN_EMAIL y/o SUPERADMIN_PASSWORD')
    process.exit(1)
  }
  if (password.length < 12) {
    console.error('[create-superadmin] SUPERADMIN_PASSWORD debe tener al menos 12 caracteres')
    process.exit(1)
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: (process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL)! }),
  })

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const existing = await prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN' } })

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, mustChangePassword: true },
      })
      console.log(`[create-superadmin] contraseña actualizada para ${email}`)
    } else {
      await prisma.user.create({
        data: { name, email, passwordHash, role: 'SUPER_ADMIN', gymId: null, mustChangePassword: true },
      })
      console.log(`[create-superadmin] creado ${email}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[create-superadmin] error:', err.message)
  process.exit(1)
})
