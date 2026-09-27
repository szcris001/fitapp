/**
 * setup-test-data.ts
 *
 * Script que crea el usuario de test E2E en la DB de desarrollo si no existe.
 * Se ejecuta manualmente ANTES de correr los tests E2E la primera vez:
 *
 *   cd apps/api && npx ts-node ../web/e2e/fixtures/setup-test-data.ts
 *
 * Crea:
 *  - Un gym con slug "e2e-test-gym"
 *  - Un admin con email "e2e-admin@fitapp.test" / password "E2eAdmin123!"
 *
 * Idempotente: si ya existen, no hace nada.
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../../apps/api/src/generated/prisma'

const prisma = new PrismaClient()

const GYM_SLUG = process.env.E2E_GYM_SLUG ?? 'e2e-test-gym'
const GYM_NAME = 'E2E Test Gym'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@fitapp.test'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin123!'

async function main() {
  console.log('[setup-test-data] Iniciando...')

  // Crear gym si no existe
  let gym = await prisma.gym.findUnique({ where: { slug: GYM_SLUG } })
  if (!gym) {
    gym = await prisma.gym.create({
      data: {
        name: GYM_NAME,
        slug: GYM_SLUG,
        email: 'gym@e2e.test',
        plan: 'BASIC',
        status: 'ACTIVE',
      },
    })
    console.log(`[setup-test-data] Gym creado: ${gym.id} (${gym.slug})`)
  } else {
    console.log(`[setup-test-data] Gym ya existe: ${gym.id} (${gym.slug})`)
  }

  // Crear admin si no existe
  let admin = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL, gymId: gym.id },
  })
  if (!admin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
    admin = await prisma.user.create({
      data: {
        name: 'Admin E2E',
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'ADMIN',
        gymId: gym.id,
        gender: 'OTHER',
        status: 'ACTIVE',
      },
    })
    console.log(`[setup-test-data] Admin creado: ${admin.id} (${admin.email})`)
  } else {
    console.log(`[setup-test-data] Admin ya existe: ${admin.id} (${admin.email})`)
  }

  console.log()
  console.log('Credenciales para los tests E2E:')
  console.log(`  E2E_GYM_SLUG=${GYM_SLUG}`)
  console.log(`  E2E_ADMIN_EMAIL=${ADMIN_EMAIL}`)
  console.log(`  E2E_ADMIN_PASSWORD=${ADMIN_PASSWORD}`)
  console.log()
  console.log('O crear el archivo apps/web/.env.e2e con esas variables.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
