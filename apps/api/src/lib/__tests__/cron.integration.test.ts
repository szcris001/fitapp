/**
 * cron.integration.test.ts
 *
 * runMembershipExpiryStatusJob es la única pieza de cron.ts exportada/testeada
 * directamente hoy — el resto de los jobs no tiene tests dedicados (ver
 * bookings.integration.test.ts para la cobertura real de reservas/confirmación,
 * que sí ejercita runPendingConfirmExpiryJob indirectamente). Se agrega este test
 * puntual porque el bug que motivó el job (Membership.status nunca llegaba a
 * EXPIRED) era precisamente del tipo "nadie lo nota hasta que se audita a mano".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '../prisma'
import { runMembershipExpiryStatusJob } from '../cron'

const GYM_SLUG = 'qa-cron-membership-expiry'
const TEST_PASSWORD = 'password123'

let gymId: string
let planId: string
const createdUserIds: string[] = []
const createdMembershipIds: string[] = []

async function createMember(name: string, email: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
  const user = await prisma.user.create({ data: { gymId, name, email, passwordHash, role: 'MEMBER' } })
  createdUserIds.push(user.id)
  return user.id
}

beforeAll(async () => {
  const gym = await prisma.gym.create({ data: { name: 'QA Cron Membership Expiry', slug: GYM_SLUG, status: 'ACTIVE' } })
  gymId = gym.id
  const plan = await prisma.plan.create({
    data: { gymId, name: 'QA Plan Cron', priceCents: 10000, currency: 'CLP', durationDays: 30, isActive: true },
  })
  planId = plan.id
})

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  await prisma.plan.delete({ where: { id: planId } })
  await prisma.gym.delete({ where: { id: gymId } })
})

describe('runMembershipExpiryStatusJob', () => {
  it('membresía ACTIVE vencida → pasa a EXPIRED', async () => {
    const userId = await createMember('QA Vencida Active', 'qa-cron-expired-active@test.local')
    const endsAt = new Date(Date.now() - 60 * 60 * 1000) // venció hace 1h
    const membership = await prisma.membership.create({
      data: { userId, planId, status: 'ACTIVE', startsAt: new Date(endsAt.getTime() - 30 * 24 * 60 * 60 * 1000), endsAt, pricePaid: 10000, currency: 'CLP' },
    })
    createdMembershipIds.push(membership.id)

    await runMembershipExpiryStatusJob()

    const updated = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(updated?.status).toBe('EXPIRED')
  })

  it('membresía TRIAL vencida → también pasa a EXPIRED', async () => {
    const userId = await createMember('QA Vencida Trial', 'qa-cron-expired-trial@test.local')
    const endsAt = new Date(Date.now() - 60 * 60 * 1000)
    const membership = await prisma.membership.create({
      data: { userId, planId, status: 'TRIAL', startsAt: new Date(endsAt.getTime() - 30 * 24 * 60 * 60 * 1000), endsAt, pricePaid: 0, currency: 'CLP' },
    })
    createdMembershipIds.push(membership.id)

    await runMembershipExpiryStatusJob()

    const updated = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(updated?.status).toBe('EXPIRED')
  })

  it('membresía ACTIVE vigente → no se toca', async () => {
    const userId = await createMember('QA Vigente', 'qa-cron-still-active@test.local')
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // vence en 30 días
    const membership = await prisma.membership.create({
      data: { userId, planId, status: 'ACTIVE', startsAt: new Date(), endsAt, pricePaid: 10000, currency: 'CLP' },
    })
    createdMembershipIds.push(membership.id)

    await runMembershipExpiryStatusJob()

    const updated = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(updated?.status).toBe('ACTIVE')
  })

  it('membresía ya INACTIVE con endsAt vencido → no se toca (no estaba ACTIVE/TRIAL)', async () => {
    const userId = await createMember('QA Inactiva', 'qa-cron-inactive@test.local')
    const endsAt = new Date(Date.now() - 60 * 60 * 1000)
    const membership = await prisma.membership.create({
      data: { userId, planId, status: 'INACTIVE', startsAt: new Date(endsAt.getTime() - 30 * 24 * 60 * 60 * 1000), endsAt, pricePaid: 10000, currency: 'CLP' },
    })
    createdMembershipIds.push(membership.id)

    await runMembershipExpiryStatusJob()

    const updated = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(updated?.status).toBe('INACTIVE')
  })
})
