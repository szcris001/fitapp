/**
 * cron.integration.test.ts
 *
 * runMembershipExpiryStatusJob y runPendingConfirmReminderJob son las únicas
 * piezas de cron.ts exportadas/testeadas directamente hoy — el resto de los jobs
 * no tiene tests dedicados (ver bookings.integration.test.ts para la cobertura
 * real de reservas/confirmación, que sí ejercita runPendingConfirmExpiryJob
 * indirectamente). Se agregan estos tests puntuales porque son del tipo de bug
 * que "nadie nota hasta que se audita a mano" (membresía nunca pasaba a EXPIRED;
 * acá, el alumno nunca recibía aviso de que debía confirmar).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '../prisma'
import { runMembershipExpiryStatusJob, runPendingConfirmReminderJob, runConsistencyBadgeJob } from '../cron'

vi.mock('../push', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  sendPushToMany: vi.fn().mockResolvedValue(undefined),
}))
import { sendPushNotification } from '../push'

const GYM_SLUG = 'qa-cron-membership-expiry'
const TEST_PASSWORD = 'password123'

let gymId: string
let planId: string
let coachId: string
let classTypeId: string
const createdUserIds: string[] = []
const createdMembershipIds: string[] = []
const createdClassIds: string[] = []

async function createMember(name: string, email: string, pushToken?: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
  const user = await prisma.user.create({ data: { gymId, name, email, passwordHash, role: 'MEMBER', pushToken } })
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

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
  const coach = await prisma.user.create({
    data: { gymId, name: 'QA Cron Coach', email: 'qa-cron-coach@test.local', passwordHash, role: 'COACH' },
  })
  coachId = coach.id
  createdUserIds.push(coachId)

  const classType = await prisma.classType.create({ data: { gymId, name: 'QA Cron ClassType', color: '#6366f1' } })
  classTypeId = classType.id
})

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { classId: { in: createdClassIds } } })
  await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } })
  await prisma.classType.delete({ where: { id: classTypeId } })
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

describe('runPendingConfirmReminderJob', () => {
  it('PENDING_CONFIRM a menos de CONFIRM_REMINDER_LEAD_MINUTES del deadline → manda push y marca confirmReminderSentAt', async () => {
    const userId = await createMember('QA Reminder Due', 'qa-cron-reminder-due@test.local', 'ExponentPushToken[qa-reminder-due]')
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const cls = await prisma.class.create({
      data: { gymId, classTypeId, coachId, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000), capacity: 10, frequency: 'ONCE' },
    })
    createdClassIds.push(cls.id)
    const confirmDeadline = new Date(Date.now() + 8 * 60 * 1000) // 8 min: dentro de la ventana de 10 min
    const booking = await prisma.booking.create({
      data: { userId, classId: cls.id, status: 'PENDING_CONFIRM', confirmDeadline },
    })

    await runPendingConfirmReminderJob()

    expect(sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[qa-reminder-due]',
      expect.any(String),
      expect.stringContaining('QA Cron ClassType'),
      expect.objectContaining({ type: 'PRECLASS_CONFIRM_REMINDER', classId: cls.id })
    )
    const updated = await prisma.booking.findUnique({ where: { id: booking.id } })
    expect(updated?.confirmReminderSentAt).not.toBeNull()
  })

  it('PENDING_CONFIRM con deadline lejano (fuera de la ventana) → no manda nada todavía', async () => {
    const userId = await createMember('QA Reminder Far', 'qa-cron-reminder-far@test.local', 'ExponentPushToken[qa-reminder-far]')
    const startsAt = new Date(Date.now() + 5 * 60 * 60 * 1000)
    const cls = await prisma.class.create({
      data: { gymId, classTypeId, coachId, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000), capacity: 10, frequency: 'ONCE' },
    })
    createdClassIds.push(cls.id)
    const confirmDeadline = new Date(Date.now() + 3 * 60 * 60 * 1000) // 3h: fuera de la ventana de 10 min
    const booking = await prisma.booking.create({
      data: { userId, classId: cls.id, status: 'PENDING_CONFIRM', confirmDeadline },
    })

    vi.mocked(sendPushNotification).mockClear()
    await runPendingConfirmReminderJob()

    expect(sendPushNotification).not.toHaveBeenCalledWith(
      'ExponentPushToken[qa-reminder-far]', expect.anything(), expect.anything(), expect.anything()
    )
    const updated = await prisma.booking.findUnique({ where: { id: booking.id } })
    expect(updated?.confirmReminderSentAt).toBeNull()
  })

  it('ya se mandó el recordatorio (confirmReminderSentAt seteado) → no lo vuelve a mandar', async () => {
    const userId = await createMember('QA Reminder Already Sent', 'qa-cron-reminder-sent@test.local', 'ExponentPushToken[qa-reminder-sent]')
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const cls = await prisma.class.create({
      data: { gymId, classTypeId, coachId, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000), capacity: 10, frequency: 'ONCE' },
    })
    createdClassIds.push(cls.id)
    const confirmDeadline = new Date(Date.now() + 8 * 60 * 1000)
    await prisma.booking.create({
      data: { userId, classId: cls.id, status: 'PENDING_CONFIRM', confirmDeadline, confirmReminderSentAt: new Date() },
    })

    vi.mocked(sendPushNotification).mockClear()
    await runPendingConfirmReminderJob()

    expect(sendPushNotification).not.toHaveBeenCalledWith(
      'ExponentPushToken[qa-reminder-sent]', expect.anything(), expect.anything(), expect.anything()
    )
  })

  it('sin pushToken → marca confirmReminderSentAt igual, sin llamar al push', async () => {
    const userId = await createMember('QA Reminder No Token', 'qa-cron-reminder-no-token@test.local')
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const cls = await prisma.class.create({
      data: { gymId, classTypeId, coachId, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000), capacity: 10, frequency: 'ONCE' },
    })
    createdClassIds.push(cls.id)
    const confirmDeadline = new Date(Date.now() + 8 * 60 * 1000)
    const booking = await prisma.booking.create({
      data: { userId, classId: cls.id, status: 'PENDING_CONFIRM', confirmDeadline },
    })

    await runPendingConfirmReminderJob()

    const updated = await prisma.booking.findUnique({ where: { id: booking.id } })
    expect(updated?.confirmReminderSentAt).not.toBeNull()
  })
})

describe('runConsistencyBadgeJob', () => {
  // La lógica real de cálculo/otorgamiento ya está cubierta a fondo en
  // consistency.integration.test.ts — acá solo se confirma que el job orquestador
  // (recorre todos los gyms ACTIVE) no explota, ni siquiera con un gym sin
  // miembros elegibles (el caso de este archivo, que no crea bookings/wods).
  it('corre sin lanzar excepción', async () => {
    await expect(runConsistencyBadgeJob()).resolves.not.toThrow()
  })
})
