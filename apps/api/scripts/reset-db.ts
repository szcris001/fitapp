import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '../.env') })

import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Iniciando limpieza de base de datos...')

  await prisma.wodMovement.deleteMany()
  console.log('✓ WodMovement')

  await prisma.wod.deleteMany()
  console.log('✓ Wod')

  await prisma.booking.deleteMany()
  console.log('✓ Booking')

  await prisma.rmRecord.deleteMany()
  console.log('✓ RmRecord')

  await prisma.gymnasticProgress.deleteMany()
  console.log('✓ GymnasticProgress')

  await prisma.gymSkillMilestone.deleteMany()
  console.log('✓ GymSkillMilestone')

  await prisma.gymSkill.deleteMany()
  console.log('✓ GymSkill')

  await prisma.membership.deleteMany()
  console.log('✓ Membership')

  await prisma.class.deleteMany()
  console.log('✓ Class')

  await prisma.classType.deleteMany()
  console.log('✓ ClassType')

  await prisma.plan.deleteMany()
  console.log('✓ Plan')

  await prisma.gymSubscriptionPayment.deleteMany()
  console.log('✓ GymSubscriptionPayment')

  await prisma.gymSubscription.deleteMany()
  console.log('✓ GymSubscription')

  await prisma.passwordResetToken.deleteMany()
  console.log('✓ PasswordResetToken')

  const deleted = await prisma.user.deleteMany({
    where: { role: { not: 'SUPER_ADMIN' } },
  })
  console.log(`✓ Users eliminados: ${deleted.count} (SUPER_ADMIN conservado)`)

  await prisma.gym.deleteMany()
  console.log('✓ Gym')

  console.log('\nBase de datos limpia. Solo queda el SUPER_ADMIN.')
}

main()
  .catch(err => { console.error('Error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
