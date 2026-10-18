/**
 * pillars.integration.test.ts
 *
 * Tests de integración para el cálculo/otorgamiento de pilares de reconocimiento
 * (apps/api/src/modules/pillars/pillars.service.ts) y el endpoint de otorgamiento
 * manual (apps/api/src/modules/pillars/pillars.routes.ts).
 *
 * Usa un año de prueba fijo (2021) para que el semestre no se solape con datos
 * reales de otras suites ni con el semestre en curso.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { prisma } from '../../../lib/prisma'
import { DEFAULT_GYM_TIMEZONE } from '../../../lib/gym-day'
import { semesterWindowsForYear } from '../../consistency/consistency.service'
import {
  calculateStrength,
  calculateAttendance,
  calculateGymnastics,
  dueTenureMilestones,
  awardSemesterPillarsForGym,
  awardTenurePillarsForGym,
  seedDefaultPillarsForGym,
} from '../pillars.service'
import { pillarRoutes } from '../pillars.routes'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const GYM_SLUG = 'qa-pillars-gym'
const GYM_B_SLUG = 'qa-pillars-gym-b'
const TEST_YEAR = 2021

let gymId: string
let gymBId: string
let coachId: string
let classTypeId: string
const window = semesterWindowsForYear(TEST_YEAR, DEFAULT_GYM_TIMEZONE)[0] // 1 ene - 30 jun 2021

async function cleanup() {
  for (const slug of [GYM_SLUG, GYM_B_SLUG]) {
    const gym = await prisma.gym.findUnique({ where: { slug }, select: { id: true } })
    if (!gym) continue
    await prisma.pillarAward.deleteMany({ where: { gymId: gym.id } })
    await prisma.pillar.deleteMany({ where: { gymId: gym.id } })
    await prisma.booking.deleteMany({ where: { class: { gymId: gym.id } } })
    await prisma.class.deleteMany({ where: { gymId: gym.id } })
    await prisma.classType.deleteMany({ where: { gymId: gym.id } })
    await prisma.rmRecord.deleteMany({ where: { user: { gymId: gym.id } } })
    await prisma.gymnasticProgress.deleteMany({ where: { user: { gymId: gym.id } } })
    await prisma.user.deleteMany({ where: { gymId: gym.id } })
    await prisma.gym.delete({ where: { id: gym.id } })
  }
}

async function createUserFixture(tag: string, createdAt?: Date) {
  return prisma.user.create({
    data: {
      gymId, name: `QA ${tag}`, email: `qa-pillars-${tag.toLowerCase()}@test.local`,
      passwordHash: 'x', role: 'MEMBER', ...(createdAt ? { createdAt } : {}),
    },
  })
}

async function createAttendedClass(userId: string, dayOffset: number) {
  const startsAt = new Date(window.periodStart.getTime() + dayOffset * 86_400_000 + 10 * 3_600_000)
  const cls = await prisma.class.create({
    data: { gymId, classTypeId, coachId, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), capacity: 20 },
  })
  await prisma.booking.create({ data: { userId, classId: cls.id, status: 'ATTENDED', attended: true, attendedAt: startsAt } })
  return cls
}

async function createRm(userId: string, movementName: string, weightKg: number, recordedAt: Date) {
  return prisma.rmRecord.create({ data: { userId, movementName, weightKg, recordedAt } })
}

async function createMilestone(userId: string, skillName: string, milestone: string, achievedAt: Date) {
  return prisma.gymnasticProgress.create({ data: { userId, skillName, milestone, achievedAt } })
}

let app: FastifyInstance
let adminToken: string
let coachToken: string

beforeAll(async () => {
  await cleanup()
  const gym = await prisma.gym.create({ data: { name: 'QA Pillars', slug: GYM_SLUG, status: 'ACTIVE', timezone: DEFAULT_GYM_TIMEZONE } })
  gymId = gym.id
  const gymB = await prisma.gym.create({ data: { name: 'QA Pillars B', slug: GYM_B_SLUG, status: 'ACTIVE' } })
  gymBId = gymB.id

  const admin = await prisma.user.create({
    data: { gymId, name: 'QA Admin', email: 'qa-pillars-admin@test.local', passwordHash: 'x', role: 'ADMIN' },
  })
  const coach = await prisma.user.create({
    data: { gymId, name: 'QA Coach', email: 'qa-pillars-coach@test.local', passwordHash: 'x', role: 'COACH' },
  })
  coachId = coach.id
  classTypeId = (await prisma.classType.create({ data: { gymId, name: 'QA CrossFit', color: '#000' } })).id

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (_req: any, body: Buffer, done: (err: Error | null, body?: unknown) => void) {
      if (!body || body.length === 0) { done(null, null); return }
      try { done(null, JSON.parse(body.toString())) }
      catch { done(null, null) }
    },
  )
  await app.register(pillarRoutes, { prefix: '/api' })
  await app.ready()
  adminToken = app.jwt.sign({ userId: admin.id, gymId, role: 'ADMIN' })
  coachToken = app.jwt.sign({ userId: coach.id, gymId, role: 'COACH' })
})

afterAll(async () => {
  await app?.close()
  await cleanup()
  await prisma.$disconnect()
})

describe('calculateStrength', () => {
  it('mejora ≥ umbral en ≥ minMovements movimientos → qualifies true', async () => {
    const user = await createUserFixture('StrengthFull')
    const config = { minMovements: 2, minImprovementPct: 10 }
    await createRm(user.id, 'Back Squat', 80, new Date(window.periodStart.getTime() + 1 * 86_400_000))
    await createRm(user.id, 'Back Squat', 95, new Date(window.periodStart.getTime() + 60 * 86_400_000)) // +18.75%
    await createRm(user.id, 'Deadlift', 100, new Date(window.periodStart.getTime() + 2 * 86_400_000))
    await createRm(user.id, 'Deadlift', 115, new Date(window.periodStart.getTime() + 61 * 86_400_000)) // +15%

    const result = await calculateStrength(user.id, window, config)
    expect(result.improved).toHaveLength(2)
    expect(result.qualifies).toBe(true)
  })

  it('solo 1 registro en la ventana para un movimiento → no cuenta esa mejora', async () => {
    const user = await createUserFixture('StrengthOneRecord')
    await createRm(user.id, 'Clean', 60, new Date(window.periodStart.getTime() + 1 * 86_400_000))
    const result = await calculateStrength(user.id, window, { minMovements: 1, minImprovementPct: 10 })
    expect(result.improved).toHaveLength(0)
    expect(result.qualifies).toBe(false)
  })

  it('mejora por debajo del umbral → no cuenta', async () => {
    const user = await createUserFixture('StrengthBelow')
    await createRm(user.id, 'Snatch', 50, new Date(window.periodStart.getTime() + 1 * 86_400_000))
    await createRm(user.id, 'Snatch', 52, new Date(window.periodStart.getTime() + 60 * 86_400_000)) // +4%
    const result = await calculateStrength(user.id, window, { minMovements: 1, minImprovementPct: 10 })
    expect(result.improved).toHaveLength(0)
  })

  it('registros fuera de la ventana no se consideran', async () => {
    const user = await createUserFixture('StrengthOutside')
    await createRm(user.id, 'Press', 40, new Date(window.periodStart.getTime() - 10 * 86_400_000))
    await createRm(user.id, 'Press', 60, new Date(window.periodEnd.getTime() + 10 * 86_400_000))
    const result = await calculateStrength(user.id, window, { minMovements: 1, minImprovementPct: 10 })
    expect(result.improved).toHaveLength(0)
  })
})

describe('calculateAttendance', () => {
  it('cuenta solo clases ATTENDED dentro de la ventana', async () => {
    const user = await createUserFixture('Attendance')
    for (let i = 0; i < 5; i++) await createAttendedClass(user.id, i)
    const result = await calculateAttendance(gymId, user.id, window, { minClassesAttended: 5 })
    expect(result.classesAttended).toBe(5)
    expect(result.qualifies).toBe(true)
  })

  it('por debajo del mínimo → qualifies false', async () => {
    const user = await createUserFixture('AttendanceLow')
    await createAttendedClass(user.id, 0)
    const result = await calculateAttendance(gymId, user.id, window, { minClassesAttended: 5 })
    expect(result.qualifies).toBe(false)
  })
})

describe('calculateGymnastics', () => {
  it('cuenta hitos marcados dentro de la ventana', async () => {
    const user = await createUserFixture('Gymnastics')
    await createMilestone(user.id, 'Pull-up', 'Strict pull-up', new Date(window.periodStart.getTime() + 5 * 86_400_000))
    await createMilestone(user.id, 'Handstand', 'Handstand hold 30s', new Date(window.periodStart.getTime() + 10 * 86_400_000))
    await createMilestone(user.id, 'Vieja', 'Fuera de ventana', new Date(window.periodStart.getTime() - 5 * 86_400_000))
    const result = await calculateGymnastics(user.id, window, { minMilestonesUnlocked: 2 })
    expect(result.unlocked).toHaveLength(2)
    expect(result.qualifies).toBe(true)
  })
})

describe('dueTenureMilestones', () => {
  const createdAt = new Date('2020-01-15T00:00:00Z')

  it('hito exactamente vencido hoy → sale', () => {
    const today = new Date('2020-07-15T00:00:00Z') // +6 meses
    const due = dueTenureMilestones(createdAt, [6, 12], today)
    expect(due.map(d => d.months)).toEqual([6])
  })

  it('hito futuro → no sale', () => {
    const today = new Date('2020-03-01T00:00:00Z')
    const due = dueTenureMilestones(createdAt, [6, 12], today)
    expect(due).toHaveLength(0)
  })

  it('cron atrasado: hito vencido hace mucho igual sale', () => {
    const today = new Date('2025-01-01T00:00:00Z')
    const due = dueTenureMilestones(createdAt, [6, 12, 24], today)
    expect(due.map(d => d.months)).toEqual([6, 12, 24])
  })
})

describe('awardSemesterPillarsForGym', () => {
  it('otorga a quien califica y no duplica en una segunda corrida', async () => {
    await prisma.pillar.deleteMany({ where: { gymId } })
    const pillar = await prisma.pillar.create({
      data: { gymId, type: 'ATTENDANCE', name: 'Asistencia', config: { minClassesAttended: 3 } },
    })
    const user = await createUserFixture('AwardSemester')
    for (let i = 0; i < 3; i++) await createAttendedClass(user.id, i)

    const firstRun = await awardSemesterPillarsForGym(gymId, window)
    expect(firstRun).toBeGreaterThanOrEqual(1)

    const award = await prisma.pillarAward.findUnique({
      where: { userId_pillarId_periodStart: { userId: user.id, pillarId: pillar.id, periodStart: window.periodStart } },
    })
    expect(award).not.toBeNull()

    await expect(awardSemesterPillarsForGym(gymId, window)).resolves.not.toThrow()
    const count = await prisma.pillarAward.count({ where: { userId: user.id, pillarId: pillar.id } })
    expect(count).toBe(1)
  })
})

describe('awardTenurePillarsForGym', () => {
  it('otorga el hito vencido y no duplica en una segunda corrida', async () => {
    await prisma.pillar.deleteMany({ where: { gymId, type: 'TENURE' } })
    const pillar = await prisma.pillar.create({
      data: { gymId, type: 'TENURE', name: 'Antigüedad', config: { milestonesMonths: [6] } },
    })
    const createdAt = new Date('2020-01-01T00:00:00Z')
    const user = await createUserFixture('Tenure', createdAt)
    const today = new Date('2020-07-05T00:00:00Z')

    const firstRun = await awardTenurePillarsForGym(gymId, today)
    expect(firstRun).toBeGreaterThanOrEqual(1)

    const awards = await prisma.pillarAward.findMany({ where: { userId: user.id, pillarId: pillar.id } })
    expect(awards).toHaveLength(1)

    await expect(awardTenurePillarsForGym(gymId, today)).resolves.not.toThrow()
    const count = await prisma.pillarAward.count({ where: { userId: user.id, pillarId: pillar.id } })
    expect(count).toBe(1)
  })
})

describe('seedDefaultPillarsForGym', () => {
  it('crea 5 pilares default y es idempotente', async () => {
    await prisma.pillar.deleteMany({ where: { gymId: gymBId } })
    await seedDefaultPillarsForGym(gymBId)
    const first = await prisma.pillar.count({ where: { gymId: gymBId } })
    expect(first).toBe(5)

    await seedDefaultPillarsForGym(gymBId) // segunda vez no duplica
    const second = await prisma.pillar.count({ where: { gymId: gymBId } })
    expect(second).toBe(5)
  })
})

describe('POST /api/pillars/:id/awards', () => {
  it('rechaza si el pilar no es MANUAL', async () => {
    const pillar = await prisma.pillar.create({ data: { gymId, type: 'STRENGTH', name: 'Fuerza', config: {} } })
    const target = await createUserFixture('ManualReject')
    const res = await app.inject({
      method: 'POST', url: `/api/pillars/${pillar.id}/awards`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: target.id },
    })
    expect(res.statusCode).toBe(404)
  })

  it('rechaza un alumno de otro gym', async () => {
    const pillar = await prisma.pillar.create({ data: { gymId, type: 'MANUAL', name: 'Mejor compañero', config: {} } })
    const otherGymUser = await prisma.user.create({
      data: { gymId: gymBId, name: 'Otro Gym', email: 'qa-pillars-other-gym@test.local', passwordHash: 'x', role: 'MEMBER' },
    })
    const res = await app.inject({
      method: 'POST', url: `/api/pillars/${pillar.id}/awards`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: otherGymUser.id },
    })
    expect(res.statusCode).toBe(404)
  })

  it('coach otorga el reconocimiento manual correctamente', async () => {
    const pillar = await prisma.pillar.create({ data: { gymId, type: 'MANUAL', name: 'Mejor compañero', config: {} } })
    const target = await createUserFixture('ManualOk')
    const res = await app.inject({
      method: 'POST', url: `/api/pillars/${pillar.id}/awards`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { userId: target.id, message: 'Por su buena onda' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.userId).toBe(target.id)
    expect(body.metadata.message).toBe('Por su buena onda')

    const stored = await prisma.pillarAward.findUnique({ where: { id: body.id } })
    expect(stored?.awardedById).not.toBeNull()
    expect(stored?.periodStart).toBeNull()
  })
})
