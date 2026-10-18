/**
 * consistency.integration.test.ts
 *
 * Tests de integración para el cálculo y otorgamiento de la insignia de
 * constancia semestral (apps/api/src/modules/consistency/consistency.service.ts).
 *
 * Usa un año de prueba fijo (2021) para que el semestre no se solape con datos
 * reales de otras suites ni con el semestre en curso.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../../lib/prisma'
import { DEFAULT_GYM_TIMEZONE, gymDayStart } from '../../../lib/gym-day'
import {
  calculateConsistency,
  awardConsistencyBadgesForGym,
  semesterWindowsForYear,
  MIN_ELIGIBLE_CLASSES,
} from '../consistency.service'

const GYM_SLUG = 'qa-consistency-gym'
const TEST_YEAR = 2021

let gymId: string
let coachId: string
let classTypeWithWodId: string
let classTypeNoWodId: string

const window = semesterWindowsForYear(TEST_YEAR, DEFAULT_GYM_TIMEZONE)[0] // 1 ene - 30 jun 2021

async function cleanup() {
  const gym = await prisma.gym.findUnique({ where: { slug: GYM_SLUG }, select: { id: true } })
  if (!gym) return
  await prisma.consistencyBadge.deleteMany({ where: { gymId: gym.id } })
  await prisma.wodResult.deleteMany({ where: { gymId: gym.id } })
  await prisma.wodBlock.deleteMany({ where: { wod: { gymId: gym.id } } })
  await prisma.wod.deleteMany({ where: { gymId: gym.id } })
  await prisma.booking.deleteMany({ where: { class: { gymId: gym.id } } })
  await prisma.class.deleteMany({ where: { gymId: gym.id } })
  await prisma.classType.deleteMany({ where: { gymId: gym.id } })
  await prisma.user.deleteMany({ where: { gymId: gym.id } })
  await prisma.gym.delete({ where: { id: gym.id } })
}

/** Crea una clase + booking ATTENDED en un día dado (dentro del semestre de prueba). */
async function createAttendedClass(classTypeId: string, userId: string, dayOffset: number) {
  const startsAt = new Date(window.periodStart.getTime() + dayOffset * 86_400_000 + 10 * 3_600_000) // 10:00 local-ish
  const cls = await prisma.class.create({
    data: { gymId, classTypeId, coachId, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), capacity: 20 },
  })
  await prisma.booking.create({ data: { userId, classId: cls.id, status: 'ATTENDED', attended: true, attendedAt: startsAt } })
  return cls
}

/** Crea el Wod planificado para ese classType en el día de `startsAt` — normalizado
 * a inicio de día local, igual que hace wod.routes.ts al guardar un Wod real. */
async function createWodForDay(classTypeId: string, startsAt: Date) {
  return prisma.wod.create({
    data: { gymId, classTypeId, date: gymDayStart(startsAt, DEFAULT_GYM_TIMEZONE), title: 'QA WOD' },
  })
}

async function createUserFixture(tag: string) {
  return prisma.user.create({
    data: { gymId, name: `QA ${tag}`, email: `qa-consistency-${tag.toLowerCase()}@test.local`, passwordHash: 'x', role: 'MEMBER' },
  })
}

beforeAll(async () => {
  await cleanup()
  const gym = await prisma.gym.create({ data: { name: 'QA Consistency', slug: GYM_SLUG, status: 'ACTIVE', timezone: DEFAULT_GYM_TIMEZONE } })
  gymId = gym.id
  coachId = (await prisma.user.create({
    data: { gymId, name: 'QA Coach', email: 'qa-consistency-coach@test.local', passwordHash: 'x', role: 'COACH' },
  })).id
  classTypeWithWodId = (await prisma.classType.create({ data: { gymId, name: 'QA CrossFit', color: '#000' } })).id
  classTypeNoWodId = (await prisma.classType.create({ data: { gymId, name: 'QA Mobility', color: '#111' } })).id
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('calculateConsistency', () => {
  it('cumple el 100% con el mínimo cubierto → qualifies true', async () => {
    const user = await createUserFixture('Full')
    for (let i = 0; i < MIN_ELIGIBLE_CLASSES; i++) {
      const cls = await createAttendedClass(classTypeWithWodId, user.id, i)
      const wod = await createWodForDay(classTypeWithWodId, cls.startsAt)
      await prisma.wodResult.create({
        data: { gymId, wodId: wod.id, userId: user.id, recordedBy: user.id, score: 100 },
      })
    }
    const result = await calculateConsistency(gymId, user.id, window, DEFAULT_GYM_TIMEZONE)
    expect(result.eligibleCount).toBe(MIN_ELIGIBLE_CLASSES)
    expect(result.loggedCount).toBe(MIN_ELIGIBLE_CLASSES)
    expect(result.qualifies).toBe(true)
  })

  it('falta 1 resultado de los elegibles → qualifies false', async () => {
    const user = await createUserFixture('Missing')
    for (let i = 0; i < MIN_ELIGIBLE_CLASSES; i++) {
      const cls = await createAttendedClass(classTypeWithWodId, user.id, i)
      const wod = await createWodForDay(classTypeWithWodId, cls.startsAt)
      if (i === 0) continue // no carga resultado de la primera
      await prisma.wodResult.create({
        data: { gymId, wodId: wod.id, userId: user.id, recordedBy: user.id, score: 100 },
      })
    }
    const result = await calculateConsistency(gymId, user.id, window, DEFAULT_GYM_TIMEZONE)
    expect(result.eligibleCount).toBe(MIN_ELIGIBLE_CLASSES)
    expect(result.loggedCount).toBe(MIN_ELIGIBLE_CLASSES - 1)
    expect(result.qualifies).toBe(false)
  })

  it('clase asistida de un tipo sin WOD planificado no cuenta ni a favor ni en contra', async () => {
    const user = await createUserFixture('NoWod')
    for (let i = 0; i < MIN_ELIGIBLE_CLASSES; i++) {
      const cls = await createAttendedClass(classTypeWithWodId, user.id, i)
      const wod = await createWodForDay(classTypeWithWodId, cls.startsAt)
      await prisma.wodResult.create({ data: { gymId, wodId: wod.id, userId: user.id, recordedBy: user.id, score: 100 } })
    }
    // Clases extra de un tipo que nunca lleva WOD — no deben inflar eligibleCount
    for (let i = 0; i < 5; i++) {
      await createAttendedClass(classTypeNoWodId, user.id, 100 + i)
    }
    const result = await calculateConsistency(gymId, user.id, window, DEFAULT_GYM_TIMEZONE)
    expect(result.eligibleCount).toBe(MIN_ELIGIBLE_CLASSES)
    expect(result.qualifies).toBe(true)
  })

  it('por debajo del mínimo de clases elegibles, aunque sea 100% → qualifies false', async () => {
    const user = await createUserFixture('BelowMin')
    for (let i = 0; i < 5; i++) {
      const cls = await createAttendedClass(classTypeWithWodId, user.id, i)
      const wod = await createWodForDay(classTypeWithWodId, cls.startsAt)
      await prisma.wodResult.create({ data: { gymId, wodId: wod.id, userId: user.id, recordedBy: user.id, score: 100 } })
    }
    const result = await calculateConsistency(gymId, user.id, window, DEFAULT_GYM_TIMEZONE)
    expect(result.eligibleCount).toBe(5)
    expect(result.loggedCount).toBe(5)
    expect(result.qualifies).toBe(false)
  })

  it('sin ninguna clase asistida en el período → qualifies false', async () => {
    const user = await createUserFixture('Empty')
    const result = await calculateConsistency(gymId, user.id, window, DEFAULT_GYM_TIMEZONE)
    expect(result.eligibleCount).toBe(0)
    expect(result.qualifies).toBe(false)
  })
})

describe('awardConsistencyBadgesForGym', () => {
  it('otorga la insignia a quien califica y no duplica en una segunda corrida', async () => {
    const user = await createUserFixture('Award')
    for (let i = 0; i < MIN_ELIGIBLE_CLASSES; i++) {
      const cls = await createAttendedClass(classTypeWithWodId, user.id, i)
      const wod = await createWodForDay(classTypeWithWodId, cls.startsAt)
      await prisma.wodResult.create({ data: { gymId, wodId: wod.id, userId: user.id, recordedBy: user.id, score: 100 } })
    }

    const firstRun = await awardConsistencyBadgesForGym(gymId, window)
    expect(firstRun).toBeGreaterThanOrEqual(1)

    const badge = await prisma.consistencyBadge.findUnique({ where: { userId_periodStart: { userId: user.id, periodStart: window.periodStart } } })
    expect(badge).not.toBeNull()
    expect(badge!.eligibleCount).toBe(MIN_ELIGIBLE_CLASSES)

    // Segunda corrida: no debe duplicar ni explotar por el constraint único
    await expect(awardConsistencyBadgesForGym(gymId, window)).resolves.not.toThrow()
    const count = await prisma.consistencyBadge.count({ where: { userId: user.id, periodStart: window.periodStart } })
    expect(count).toBe(1)
  })
})
