/**
 * bookings.integration.test.ts
 *
 * Tests de integración para bookClass, cancelBooking y la lógica de waitlist.
 *
 * Estrategia:
 *   - Se llaman las funciones de servicio directamente (bookClass, cancelBooking,
 *     removeStudentByAdmin, confirmWaitlistBooking). No se usa HTTP para estos tests
 *     porque la lógica de negocio vive en el service, no en la capa de rutas.
 *   - La DB es real (Prisma contra Postgres de test).
 *   - vi.useFakeTimers() controla `new Date()` en tests de ventanas temporales.
 *   - sendPushNotification se mockea para evitar efectos secundarios.
 *   - Cada suite limpia sus propias entidades en afterAll/afterEach.
 *
 * Casos cubiertos:
 *
 * bookClass:
 *   1.  Flujo feliz — alumno con membresía ACTIVE reserva clase disponible → CONFIRMED
 *   2.  Clase ya comenzó → error "ya ha comenzado"
 *   3.  Clase demasiado lejana (más de windowDays) → error de anticipación
 *   4.  Clase pasado el cutoff (menos de cutoffMins antes) → error de cutoff
 *   5.  Sin membresía activa → error "No tienes una membresía activa"
 *   6.  Membresía INACTIVE → error "No tienes una membresía activa"
 *   7.  Membresía vencida (endsAt en el pasado) → error "No tienes una membresía activa"
 *   8.  Membresía TRIAL con maxClasses agotado → error de límite trial
 *   9.  Membresía TRIAL con cupo disponible → reserva CONFIRMED
 *  10.  Clase llena → reserva en WAITLIST
 *  11.  Doble reserva CONFIRMED → error "Ya tienes reserva"
 *  12.  Doble reserva WAITLIST → error "Ya estás en lista de espera"
 *  13.  Booking CANCELLED previo → se reactiva a CONFIRMED (comportamiento real del código)
 *  14.  Clase de otro gym → error "Clase no encontrada"
 *
 * cancelBooking:
 *  15.  Flujo feliz — cancel dentro de ventana → CANCELLED + mensaje OK
 *  16.  Cancel después del cutoff de cancelación → error de tiempo
 *  17.  Cancel de reserva inexistente → error "Reserva no encontrada"
 *  18.  Cancel con CONFIRMED promueve primer WAITLIST a CONFIRMED (waitlistConfirmEnabled=false)
 *  19.  Cancel con CONFIRMED promueve primer WAITLIST a PENDING_CONFIRM (waitlistConfirmEnabled=true)
 *  20.  Cancel de WAITLIST no promueve a nadie (booking.status != CONFIRMED)
 *
 * removeStudentByAdmin:
 *  21.  Admin cancela CONFIRMED sin restricción de tiempo → promueve waitlist
 *  22.  Admin cancela WAITLIST → no promueve (wasActive = false)
 *  23.  Admin intenta cancelar booking de otro gym → error "Reserva no encontrada"
 *
 * confirmWaitlistBooking:
 *  24.  Confirmar PENDING_CONFIRM dentro del deadline → pasa a CONFIRMED
 *  25.  Confirmar PENDING_CONFIRM con deadline expirado → error "tiempo para confirmar ha expirado"
 *  26.  Confirmar booking que NO es PENDING_CONFIRM → error
 *  27.  Confirmar booking de otro usuario → error "Reserva no encontrada"
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import {
  bookClass,
  cancelBooking,
  removeStudentByAdmin,
  confirmWaitlistBooking,
} from '../classes.service'

// ─── Mock de push notifications ──────────────────────────────────────────────
// sendPushNotification es un efecto secundario — no queremos llamadas reales
// a la API de Expo en tests de lógica de negocio.

vi.mock('../../../lib/push', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  sendPushToMany: vi.fn().mockResolvedValue(undefined),
}))

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const GYM_A_SLUG = 'qa-bookings-gym-a'
const GYM_B_SLUG = 'qa-bookings-gym-b'
const TEST_PASSWORD = 'password123'

// ─── IDs del entorno compartido (creados en beforeAll global) ────────────────

let gymAId: string
let gymBId: string
let coachAId: string
let memberAId: string  // miembro con membresía ACTIVE
let member2AId: string // segundo miembro para tests de waitlist
let member3AId: string // tercer miembro para tests de waitlist (cola)
let planAId: string
let trialPlanAId: string // plan trial con maxClasses=2
let activeMembershipId: string

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Crea una clase en gymA con el inicio indicado.
 * Por defecto capacidad=10 para tests que no prueban clase llena.
 */
async function createClass(opts: {
  startsAt: Date
  endsAt?: Date
  capacity?: number
}): Promise<string> {
  const endsAt = opts.endsAt ?? new Date(opts.startsAt.getTime() + 60 * 60 * 1000)
  const cls = await prisma.class.create({
    data: {
      gymId: gymAId,
      classTypeId: classTypeAId,
      coachId: coachAId,
      startsAt: opts.startsAt,
      endsAt,
      capacity: opts.capacity ?? 10,
      frequency: 'ONCE',
    },
  })
  return cls.id
}

/**
 * Crea una membresía ACTIVE para el usuario dado, con vigencia actual.
 */
async function createActiveMembership(userId: string, planId: string): Promise<string> {
  const now = new Date()
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const m = await prisma.membership.create({
    data: {
      userId,
      planId,
      status: 'ACTIVE',
      startsAt: now,
      endsAt,
      pricePaid: 30000,
      currency: 'CLP',
      paymentMethod: 'cash',
      paidAt: now,
    },
  })
  return m.id
}

/**
 * Crear un booking con un status arbitrario (para setup de precondiciones).
 */
async function createBooking(userId: string, classId: string, status: string): Promise<string> {
  const b = await prisma.booking.create({
    data: { userId, classId, status: status as any },
  })
  return b.id
}

// classTypeAId se define fuera para que los helpers accedan
let classTypeAId: string

// ─── IDs creados durante los tests — para cleanup ────────────────────────────
const createdClassIds: string[] = []
const createdBookingIds: string[] = []
const createdMembershipIds: string[] = []

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) {
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      const userIds = users.map(u => u.id)
      if (userIds.length) {
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
      }
      await prisma.booking.deleteMany({ where: { class: { gymId: existing.id } } })
      await prisma.class.deleteMany({ where: { gymId: existing.id } })
      await prisma.classType.deleteMany({ where: { gymId: existing.id } })
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.user.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym A — bookingWindowDays=7, bookingCutoffMins=60, cancelCutoffMins=30
  // waitlistConfirmEnabled=false por defecto
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA Bookings Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      bookingWindowDays: 7,
      bookingCutoffMins: 60,
      cancelCutoffMins: 30,
      waitlistConfirmEnabled: false,
      waitlistConfirmMins: 30,
    },
  })
  gymAId = gymA.id

  // Gym B — para tests de cross-gym
  const gymB = await prisma.gym.create({
    data: { name: 'QA Bookings Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Coach en Gym A (requerido por FK en Class)
  const coach = await prisma.user.create({
    data: { gymId: gymAId, name: 'Coach A', email: 'qa-bookings-coach-a@test.local', passwordHash, role: 'COACH' },
  })
  coachAId = coach.id

  // Miembro 1 en Gym A
  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member A', email: 'qa-bookings-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  // Miembro 2 en Gym A (para waitlist)
  const member2A = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member A2', email: 'qa-bookings-member-a2@test.local', passwordHash, role: 'MEMBER' },
  })
  member2AId = member2A.id

  // Miembro 3 en Gym A (segundo en cola de waitlist)
  const member3A = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member A3', email: 'qa-bookings-member-a3@test.local', passwordHash, role: 'MEMBER' },
  })
  member3AId = member3A.id

  // Tipo de clase en Gym A
  const classType = await prisma.classType.create({
    data: { gymId: gymAId, name: 'CrossFit', color: '#6366f1' },
  })
  classTypeAId = classType.id

  // Plan estándar (30 días, sin límite de clases)
  const plan = await prisma.plan.create({
    data: { gymId: gymAId, name: 'Plan Mensual Test', priceCents: 30000, currency: 'CLP', durationDays: 30, isActive: true },
  })
  planAId = plan.id

  // Plan trial (30 días, máximo 2 clases)
  const trialPlan = await prisma.plan.create({
    data: { gymId: gymAId, name: 'Plan Trial Test', priceCents: 0, currency: 'CLP', durationDays: 30, isActive: true, isTrial: true, maxClasses: 2 },
  })
  trialPlanAId = trialPlan.id

  // Membresía ACTIVE para memberA
  activeMembershipId = await createActiveMembership(memberAId, planAId)
  createdMembershipIds.push(activeMembershipId)

  // Membresía ACTIVE para member2A (necesaria para reservar en tests de waitlist)
  const m2 = await createActiveMembership(member2AId, planAId)
  createdMembershipIds.push(m2)

  // Membresía ACTIVE para member3A
  const m3 = await createActiveMembership(member3AId, planAId)
  createdMembershipIds.push(m3)
})

afterAll(async () => {
  // Limpiar en orden de dependencias FK
  if (createdBookingIds.length) {
    await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } })
  }
  if (createdClassIds.length) {
    await prisma.booking.deleteMany({ where: { classId: { in: createdClassIds } } })
    await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } })
  }
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }

  // Limpiar fixtures base en orden FK
  await prisma.booking.deleteMany({ where: { class: { gymId: gymAId } } })
  await prisma.class.deleteMany({ where: { gymId: gymAId } })
  await prisma.classType.deleteMany({ where: { gymId: gymAId } })
  await prisma.membership.deleteMany({ where: { userId: { in: [memberAId, member2AId, member3AId, coachAId].filter(Boolean) } } })
  await prisma.user.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.plan.deleteMany({ where: { gymId: gymAId } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })

  await prisma.$disconnect()
})

// ─── Suite 1: bookClass — flujo feliz ─────────────────────────────────────────

describe('bookClass: flujo feliz', () => {
  let classId: string

  beforeAll(async () => {
    // Clase en 2 horas (dentro de ventana, fuera del cutoff de 60 min)
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
    classId = await createClass({ startsAt })
    createdClassIds.push(classId)
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('alumno con membresía ACTIVE reserva clase disponible → status CONFIRMED', async () => {
    const booking = await bookClass(gymAId, memberAId, { classId })

    expect(booking.status).toBe('CONFIRMED')
    expect(booking.userId).toBe(memberAId)
    expect(booking.classId).toBe(classId)
  })

  it('booking queda registrado en la DB', async () => {
    const stored = await prisma.booking.findUnique({
      where: { userId_classId: { userId: memberAId, classId } },
    })
    expect(stored).not.toBeNull()
    expect(stored!.status).toBe('CONFIRMED')
  })
})

// ─── Suite 2: bookClass — ventana de tiempo ───────────────────────────────────

describe('bookClass: ventanas de tiempo', () => {
  it('clase ya comenzó → error "ya ha comenzado"', async () => {
    // Clase que empezó hace 30 segundos
    const startsAt = new Date(Date.now() - 30 * 1000)
    const classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    await expect(
      bookClass(gymAId, memberAId, { classId })
    ).rejects.toThrow('ya ha comenzado')

    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('clase demasiado lejana (más de 7 días) → error de anticipación', async () => {
    // Gym A tiene bookingWindowDays=7; creamos clase en 8 días
    const startsAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    await expect(
      bookClass(gymAId, memberAId, { classId })
    ).rejects.toThrow(/7 día/)

    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('clase dentro del cutoff (menos de 60 min) → error de cutoff', async () => {
    // Gym A tiene bookingCutoffMins=60; creamos clase en 30 minutos
    const startsAt = new Date(Date.now() + 30 * 60 * 1000)
    const classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    await expect(
      bookClass(gymAId, memberAId, { classId })
    ).rejects.toThrow(/El mínimo para reservar es 60 minutos/)

    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('clase exactamente en el límite del window (7 días) → se puede reservar', async () => {
    // 7 días - 2 horas: dentro de la ventana y fuera del cutoff
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    const booking = await bookClass(gymAId, memberAId, { classId })
    expect(booking.status).toBe('CONFIRMED')

    await prisma.booking.deleteMany({ where: { classId } })
  })
})

// ─── Suite 3: bookClass — membresía inválida ──────────────────────────────────

describe('bookClass: membresía inválida', () => {
  let classId: string

  beforeAll(async () => {
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000)
    classId = await createClass({ startsAt })
    createdClassIds.push(classId)
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('sin ninguna membresía → error "No tienes una membresía activa"', async () => {
    // Crear usuario sin membresía
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const noMember = await prisma.user.create({
      data: { gymId: gymAId, name: 'No Member', email: 'qa-bookings-no-member@test.local', passwordHash, role: 'MEMBER' },
    })

    try {
      await expect(
        bookClass(gymAId, noMember.id, { classId })
      ).rejects.toThrow('No tienes una membresía activa')
    } finally {
      await prisma.user.delete({ where: { id: noMember.id } })
    }
  })

  it('membresía INACTIVE → error "No tienes una membresía activa"', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const user = await prisma.user.create({
      data: { gymId: gymAId, name: 'Inactive Member', email: 'qa-bookings-inactive@test.local', passwordHash, role: 'MEMBER' },
    })

    const now = new Date()
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const membership = await prisma.membership.create({
      data: { userId: user.id, planId: planAId, status: 'INACTIVE', startsAt: now, endsAt, pricePaid: 30000, currency: 'CLP' },
    })

    try {
      await expect(
        bookClass(gymAId, user.id, { classId })
      ).rejects.toThrow('No tienes una membresía activa')
    } finally {
      await prisma.membership.delete({ where: { id: membership.id } })
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('membresía vencida (endsAt en el pasado) → error "No tienes una membresía activa"', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const user = await prisma.user.create({
      data: { gymId: gymAId, name: 'Expired Member', email: 'qa-bookings-expired@test.local', passwordHash, role: 'MEMBER' },
    })

    const endsAt = new Date(Date.now() - 24 * 60 * 60 * 1000) // vencida ayer
    const startsAt = new Date(endsAt.getTime() - 30 * 24 * 60 * 60 * 1000)
    const membership = await prisma.membership.create({
      data: { userId: user.id, planId: planAId, status: 'ACTIVE', startsAt, endsAt, pricePaid: 30000, currency: 'CLP' },
    })

    try {
      await expect(
        bookClass(gymAId, user.id, { classId })
      ).rejects.toThrow('No tienes una membresía activa')
    } finally {
      await prisma.membership.delete({ where: { id: membership.id } })
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
})

// ─── Suite 4: bookClass — membresía TRIAL con límite de clases ────────────────

describe('bookClass: membresía TRIAL con maxClasses', () => {
  let trialMembershipId: string
  let trialUserId: string
  const trialClassIds: string[] = []

  beforeAll(async () => {
    // Crear usuario con membresía TRIAL (maxClasses=2)
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const user = await prisma.user.create({
      data: { gymId: gymAId, name: 'Trial Member', email: 'qa-bookings-trial@test.local', passwordHash, role: 'MEMBER' },
    })
    trialUserId = user.id

    const now = new Date()
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const membership = await prisma.membership.create({
      data: { userId: trialUserId, planId: trialPlanAId, status: 'TRIAL', startsAt: now, endsAt, pricePaid: 0, currency: 'CLP' },
    })
    trialMembershipId = membership.id
  })

  afterAll(async () => {
    // Limpiar bookings del usuario trial
    await prisma.booking.deleteMany({ where: { userId: trialUserId } })
    if (trialClassIds.length) {
      await prisma.class.deleteMany({ where: { id: { in: trialClassIds } } })
    }
    if (trialMembershipId) await prisma.membership.delete({ where: { id: trialMembershipId } }).catch(() => {})
    if (trialUserId) await prisma.user.delete({ where: { id: trialUserId } }).catch(() => {})
  })

  it('membresía TRIAL con cupo disponible → reserva CONFIRMED', async () => {
    const startsAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt })
    trialClassIds.push(classId)

    const booking = await bookClass(gymAId, trialUserId, { classId })
    expect(booking.status).toBe('CONFIRMED')
  })

  it('segunda reserva TRIAL — todavía tiene cupo (1 usado de 2) → CONFIRMED', async () => {
    const startsAt = new Date(Date.now() + 5 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt })
    trialClassIds.push(classId)

    const booking = await bookClass(gymAId, trialUserId, { classId })
    expect(booking.status).toBe('CONFIRMED')
  })

  it('tercera reserva TRIAL — límite agotado (2 de 2) → error de límite trial', async () => {
    const startsAt = new Date(Date.now() + 6 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt })
    trialClassIds.push(classId)

    await expect(
      bookClass(gymAId, trialUserId, { classId })
    ).rejects.toThrow('Has alcanzado el límite de clases de tu plan de prueba')
  })
})

// ─── Suite 5: bookClass — capacidad y waitlist ────────────────────────────────

describe('bookClass: capacidad y waitlist', () => {
  let fullClassId: string

  beforeAll(async () => {
    // Clase con capacidad=1 para forzar waitlist con el segundo alumno
    const startsAt = new Date(Date.now() + 25 * 60 * 60 * 1000) // 25h: dentro del window de 7 días
    fullClassId = await createClass({ startsAt, capacity: 1 })
    createdClassIds.push(fullClassId)

    // Primer alumno reserva (member2A) → CONFIRMED, ocupa el único cupo
    await bookClass(gymAId, member2AId, { classId: fullClassId })
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId: fullClassId } })
  })

  it('clase llena → segundo alumno entra en WAITLIST', async () => {
    const booking = await bookClass(gymAId, memberAId, { classId: fullClassId })

    expect(booking.status).toBe('WAITLIST')
    expect(booking.userId).toBe(memberAId)
    expect(booking.classId).toBe(fullClassId)
  })
})

// ─── Suite 6: bookClass — doble reserva ──────────────────────────────────────

describe('bookClass: doble reserva', () => {
  let classId: string

  beforeAll(async () => {
    const startsAt = new Date(Date.now() + 26 * 60 * 60 * 1000)
    classId = await createClass({ startsAt })
    createdClassIds.push(classId)
    // memberA ya tiene una reserva CONFIRMED
    await bookClass(gymAId, memberAId, { classId })
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('reservar dos veces la misma clase → error "Ya tienes reserva en esta clase"', async () => {
    await expect(
      bookClass(gymAId, memberAId, { classId })
    ).rejects.toThrow('Ya tienes reserva en esta clase')
  })

  it('alumno en WAITLIST intenta reservar de nuevo → error "Ya estás en lista de espera"', async () => {
    // member2A reserva → como memberA ocupa el único cupo visible, forzamos waitlist
    // Para eso creamos una clase de capacidad=1
    const startsAt2 = new Date(Date.now() + 27 * 60 * 60 * 1000)
    const classId2 = await createClass({ startsAt: startsAt2, capacity: 1 })
    createdClassIds.push(classId2)

    // member2A reserva el cupo
    await bookClass(gymAId, member2AId, { classId: classId2 })
    // memberA va a WAITLIST
    await bookClass(gymAId, memberAId, { classId: classId2 })
    // memberA intenta reservar de nuevo → ya está en WAITLIST
    await expect(
      bookClass(gymAId, memberAId, { classId: classId2 })
    ).rejects.toThrow('Ya estás en lista de espera')

    await prisma.booking.deleteMany({ where: { classId: classId2 } })
  })
})

// ─── Suite 7: bookClass — booking CANCELLED previo se reactiva ───────────────

describe('bookClass: booking CANCELLED previo → se reactiva a CONFIRMED', () => {
  let classId: string

  beforeAll(async () => {
    const startsAt = new Date(Date.now() + 28 * 60 * 60 * 1000)
    classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    // Crear booking CANCELLED directamente en DB (simular cancelación previa)
    await prisma.booking.create({
      data: { userId: memberAId, classId, status: 'CANCELLED' },
    })
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('booking CANCELLED existente → bookClass lo reactiva a CONFIRMED', async () => {
    // Este es el comportamiento REAL del código: si existe un booking con otro status,
    // lo actualiza a CONFIRMED en lugar de crear uno nuevo.
    const booking = await bookClass(gymAId, memberAId, { classId })

    expect(booking.status).toBe('CONFIRMED')
    expect(booking.userId).toBe(memberAId)
  })
})

// ─── Suite 8: bookClass — cross-gym ──────────────────────────────────────────

describe('bookClass: clase de otro gym', () => {
  it('clase inexistente en el gym del usuario → error "Clase no encontrada"', async () => {
    // Usamos un UUID que no existe en gymA
    const fakeClassId = '00000000-0000-0000-0000-000000000099'

    await expect(
      bookClass(gymAId, memberAId, { classId: fakeClassId })
    ).rejects.toThrow('Clase no encontrada')
  })
})

// ─── Suite 9: cancelBooking — flujo feliz ────────────────────────────────────

describe('cancelBooking: flujo feliz', () => {
  let classId: string
  let bookingId: string

  beforeAll(async () => {
    // Clase en 3 horas: dentro del cancelCutoffMins=30 de margen de cancelación
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000)
    classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    const booking = await bookClass(gymAId, memberAId, { classId })
    bookingId = booking.id
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('cancelar dentro de la ventana → booking queda CANCELLED', async () => {
    const result = await cancelBooking(gymAId, memberAId, classId)

    expect(result.message).toBe('Reserva cancelada')

    const stored = await prisma.booking.findUnique({ where: { id: bookingId } })
    expect(stored!.status).toBe('CANCELLED')
  })
})

// ─── Suite 10: cancelBooking — restricción de tiempo ────────────────────────

describe('cancelBooking: cutoff de cancelación', () => {
  it('cancelar con menos de 30 min de anticipación → error de cutoff', async () => {
    // Clase en 20 min: ya pasó el cancelCutoffMins=30
    const startsAt = new Date(Date.now() + 20 * 60 * 1000)
    const classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    // Crear booking directamente (sin pasar por bookClass para saltarnos el cutoff de reserva)
    await prisma.booking.create({
      data: { userId: memberAId, classId, status: 'CONFIRMED' },
    })

    await expect(
      cancelBooking(gymAId, memberAId, classId)
    ).rejects.toThrow(/No puedes cancelar con menos de 30 minutos/)

    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('cancelar reserva inexistente → error "Reserva no encontrada"', async () => {
    const fakeClassId = '00000000-0000-0000-0000-000000000088'

    await expect(
      cancelBooking(gymAId, memberAId, fakeClassId)
    ).rejects.toThrow('Reserva no encontrada')
  })
})

// ─── Suite 11: cancelBooking — promoción de waitlist ─────────────────────────

describe('cancelBooking: promoción de waitlist (waitlistConfirmEnabled=false)', () => {
  // Gym A tiene waitlistConfirmEnabled=false → el primer WAITLIST pasa directo a CONFIRMED
  let classId: string
  let waitlistBookingId: string
  let waitlistBooking2Id: string

  beforeAll(async () => {
    // Clase con capacidad=1
    const startsAt = new Date(Date.now() + 30 * 60 * 60 * 1000)
    classId = await createClass({ startsAt, capacity: 1 })
    createdClassIds.push(classId)

    // memberA reserva → CONFIRMED (ocupa el cupo)
    await bookClass(gymAId, memberAId, { classId })
    // member2A intenta → WAITLIST (posición 1)
    const wb = await bookClass(gymAId, member2AId, { classId })
    waitlistBookingId = wb.id
    // member3A intenta → WAITLIST (posición 2)
    const wb2 = await bookClass(gymAId, member3AId, { classId })
    waitlistBooking2Id = wb2.id
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('al cancelar CONFIRMED, el primer WAITLIST pasa a CONFIRMED automáticamente', async () => {
    // memberA cancela — debe liberar el cupo y promover a member2A
    await cancelBooking(gymAId, memberAId, classId)

    // Verificar que member2A (posición 1 en waitlist) fue promovido a CONFIRMED
    const promoted = await prisma.booking.findUnique({ where: { id: waitlistBookingId } })
    expect(promoted!.status).toBe('CONFIRMED')

    // member3A (posición 2) sigue en WAITLIST
    const stillWaiting = await prisma.booking.findUnique({ where: { id: waitlistBooking2Id } })
    expect(stillWaiting!.status).toBe('WAITLIST')
  })
})

describe('cancelBooking: promoción de waitlist (waitlistConfirmEnabled=true)', () => {
  // Gym con waitlistConfirmEnabled=true → el primer WAITLIST pasa a PENDING_CONFIRM
  let gymConfirmId: string
  let classId: string
  let waitlistBookingId: string
  let classTypeConfirmId: string

  beforeAll(async () => {
    const gymConfirm = await prisma.gym.create({
      data: {
        name: 'QA Bookings Gym Confirm',
        slug: 'qa-bookings-gym-confirm',
        status: 'ACTIVE',
        bookingWindowDays: 7,
        bookingCutoffMins: 60,
        cancelCutoffMins: 30,
        waitlistConfirmEnabled: true,
        waitlistConfirmMins: 30,
      },
    })
    gymConfirmId = gymConfirm.id

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

    // Coach en este gym
    const coachConfirm = await prisma.user.create({
      data: { gymId: gymConfirmId, name: 'Coach Confirm', email: 'qa-bookings-coach-confirm@test.local', passwordHash, role: 'COACH' },
    })

    // Tipo de clase
    const ct = await prisma.classType.create({
      data: { gymId: gymConfirmId, name: 'CF Confirm', color: '#111' },
    })
    classTypeConfirmId = ct.id

    // Plan y membresías para los dos miembros de este gym
    const plan = await prisma.plan.create({
      data: { gymId: gymConfirmId, name: 'Plan Confirm', priceCents: 10000, currency: 'CLP', durationDays: 30 },
    })

    const userA = await prisma.user.create({
      data: { gymId: gymConfirmId, name: 'User Confirm A', email: 'qa-bookings-confirm-a@test.local', passwordHash, role: 'MEMBER' },
    })
    const userB = await prisma.user.create({
      data: { gymId: gymConfirmId, name: 'User Confirm B', email: 'qa-bookings-confirm-b@test.local', passwordHash, role: 'MEMBER' },
    })

    const now = new Date()
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    await prisma.membership.create({ data: { userId: userA.id, planId: plan.id, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 10000, currency: 'CLP' } })
    await prisma.membership.create({ data: { userId: userB.id, planId: plan.id, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 10000, currency: 'CLP' } })

    // Clase capacidad=1
    const startsAt = new Date(Date.now() + 30 * 60 * 60 * 1000)
    const endsAtClass = new Date(startsAt.getTime() + 60 * 60 * 1000)
    const cls = await prisma.class.create({
      data: { gymId: gymConfirmId, classTypeId: ct.id, coachId: coachConfirm.id, startsAt, endsAt: endsAtClass, capacity: 1, frequency: 'ONCE' },
    })
    classId = cls.id

    // userA reserva → CONFIRMED
    await bookClass(gymConfirmId, userA.id, { classId })
    // userB → WAITLIST
    const wb = await bookClass(gymConfirmId, userB.id, { classId })
    waitlistBookingId = wb.id

    // Cancelar la de userA (dentro de ventana: clase en 30h)
    await cancelBooking(gymConfirmId, userA.id, classId)
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
    await prisma.class.deleteMany({ where: { gymId: gymConfirmId } })
    await prisma.classType.deleteMany({ where: { gymId: gymConfirmId } })
    const users = await prisma.user.findMany({ where: { gymId: gymConfirmId }, select: { id: true } })
    await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
    await prisma.user.deleteMany({ where: { gymId: gymConfirmId } })
    await prisma.plan.deleteMany({ where: { gymId: gymConfirmId } })
    await prisma.gym.delete({ where: { id: gymConfirmId } })
  })

  it('al cancelar CONFIRMED con waitlistConfirmEnabled=true, el primer WAITLIST pasa a PENDING_CONFIRM', async () => {
    const promoted = await prisma.booking.findUnique({ where: { id: waitlistBookingId } })
    expect(promoted!.status).toBe('PENDING_CONFIRM')
    expect(promoted!.confirmDeadline).not.toBeNull()
  })
})

describe('cancelBooking: cancelar WAITLIST no promueve', () => {
  let classId: string
  let waitlistBookingId: string

  beforeAll(async () => {
    // Clase capacidad=1
    const startsAt = new Date(Date.now() + 35 * 60 * 60 * 1000)
    classId = await createClass({ startsAt, capacity: 1 })
    createdClassIds.push(classId)

    // memberA → CONFIRMED
    await bookClass(gymAId, memberAId, { classId })
    // member2A → WAITLIST
    const wb = await bookClass(gymAId, member2AId, { classId })
    waitlistBookingId = wb.id
    // member3A → WAITLIST (segundo en cola)
    await bookClass(gymAId, member3AId, { classId })
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('cancelar un WAITLIST no promueve a nadie (el código solo promueve en CONFIRMED/PENDING_CONFIRM)', async () => {
    // member2A cancela su WAITLIST
    await cancelBooking(gymAId, member2AId, classId)

    const cancelled = await prisma.booking.findUnique({ where: { id: waitlistBookingId } })
    expect(cancelled!.status).toBe('CANCELLED')

    // member3A debe seguir en WAITLIST (no fue promovido porque member2A era WAITLIST, no CONFIRMED)
    const member3Booking = await prisma.booking.findUnique({
      where: { userId_classId: { userId: member3AId, classId } },
    })
    expect(member3Booking!.status).toBe('WAITLIST')
  })
})

// ─── Suite 12: removeStudentByAdmin ──────────────────────────────────────────

describe('removeStudentByAdmin: admin elimina alumno sin restricción de tiempo', () => {
  it('admin elimina booking CONFIRMED a 5 min del inicio → no lanza error (sin cutoff para admin)', async () => {
    // Clase en 5 minutos — cancelBooking lanzaría error, removeStudentByAdmin no
    const startsAt = new Date(Date.now() + 5 * 60 * 1000)
    const classId = await createClass({ startsAt })
    createdClassIds.push(classId)

    const b = await prisma.booking.create({
      data: { userId: memberAId, classId, status: 'CONFIRMED' },
    })

    // No debe lanzar error
    await expect(
      removeStudentByAdmin(gymAId, b.id)
    ).resolves.toBeUndefined()

    // El booking ya no existe (fue deleted)
    const deleted = await prisma.booking.findUnique({ where: { id: b.id } })
    expect(deleted).toBeNull()

    await prisma.class.delete({ where: { id: classId } })
  })

  it('admin elimina booking CONFIRMED → promueve primer WAITLIST', async () => {
    const startsAt = new Date(Date.now() + 36 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt, capacity: 1 })
    createdClassIds.push(classId)

    // memberA → CONFIRMED
    const confirmedBooking = await prisma.booking.create({
      data: { userId: memberAId, classId, status: 'CONFIRMED' },
    })
    // member2A → WAITLIST
    const waitlistBooking = await prisma.booking.create({
      data: { userId: member2AId, classId, status: 'WAITLIST' },
    })

    await removeStudentByAdmin(gymAId, confirmedBooking.id)

    // El booking de memberA fue borrado
    const deleted = await prisma.booking.findUnique({ where: { id: confirmedBooking.id } })
    expect(deleted).toBeNull()

    // member2A fue promovido a CONFIRMED
    const promoted = await prisma.booking.findUnique({ where: { id: waitlistBooking.id } })
    expect(promoted!.status).toBe('CONFIRMED')

    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('admin elimina booking WAITLIST → no promueve a nadie', async () => {
    const startsAt = new Date(Date.now() + 37 * 60 * 60 * 1000)
    const classId = await createClass({ startsAt, capacity: 1 })
    createdClassIds.push(classId)

    // memberA → CONFIRMED
    const confirmedBooking = await prisma.booking.create({
      data: { userId: memberAId, classId, status: 'CONFIRMED' },
    })
    // member2A → WAITLIST
    const waitlistBooking = await prisma.booking.create({
      data: { userId: member2AId, classId, status: 'WAITLIST' },
    })
    // member3A → WAITLIST (segundo en cola)
    const waitlistBooking2 = await prisma.booking.create({
      data: { userId: member3AId, classId, status: 'WAITLIST' },
    })

    // Admin borra el WAITLIST de member2A (wasActive=false → no promueve)
    await removeStudentByAdmin(gymAId, waitlistBooking.id)

    const deleted = await prisma.booking.findUnique({ where: { id: waitlistBooking.id } })
    expect(deleted).toBeNull()

    // member3A sigue en WAITLIST (no fue promovido)
    const stillWaiting = await prisma.booking.findUnique({ where: { id: waitlistBooking2.id } })
    expect(stillWaiting!.status).toBe('WAITLIST')

    // memberA sigue CONFIRMED
    const stillConfirmed = await prisma.booking.findUnique({ where: { id: confirmedBooking.id } })
    expect(stillConfirmed!.status).toBe('CONFIRMED')

    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('booking de otro gym → error "Reserva no encontrada"', async () => {
    // Crear un booking de un gym "B" (si gymBId existe) intentando cancelarlo como gymA
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const coachB = await prisma.user.create({
      data: { gymId: gymBId, name: 'Coach B', email: 'qa-bookings-coach-b@test.local', passwordHash, role: 'COACH' },
    })
    const ctB = await prisma.classType.create({ data: { gymId: gymBId, name: 'CF B', color: '#f00' } })
    const planB = await prisma.plan.create({ data: { gymId: gymBId, name: 'Plan B', priceCents: 10000, currency: 'CLP', durationDays: 30 } })

    const startsAt = new Date(Date.now() + 38 * 60 * 60 * 1000)
    const clsB = await prisma.class.create({
      data: { gymId: gymBId, classTypeId: ctB.id, coachId: coachB.id, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), capacity: 10, frequency: 'ONCE' },
    })
    const memberB = await prisma.user.create({
      data: { gymId: gymBId, name: 'Member B', email: 'qa-bookings-member-b@test.local', passwordHash, role: 'MEMBER' },
    })
    const now = new Date()
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    await prisma.membership.create({ data: { userId: memberB.id, planId: planB.id, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 10000, currency: 'CLP' } })
    const bookingB = await prisma.booking.create({ data: { userId: memberB.id, classId: clsB.id, status: 'CONFIRMED' } })

    try {
      // Intentar remover el booking de gymB usando gymAId como contexto
      await expect(
        removeStudentByAdmin(gymAId, bookingB.id)
      ).rejects.toThrow('Reserva no encontrada')
    } finally {
      await prisma.booking.deleteMany({ where: { classId: clsB.id } })
      await prisma.class.delete({ where: { id: clsB.id } })
      await prisma.classType.delete({ where: { id: ctB.id } })
      await prisma.membership.deleteMany({ where: { userId: memberB.id } })
      await prisma.user.deleteMany({ where: { id: { in: [memberB.id, coachB.id] } } })
      await prisma.plan.delete({ where: { id: planB.id } })
    }
  })
})

// ─── Suite 13: confirmWaitlistBooking ─────────────────────────────────────────

describe('confirmWaitlistBooking', () => {
  let classId: string

  beforeAll(async () => {
    const startsAt = new Date(Date.now() + 40 * 60 * 60 * 1000)
    classId = await createClass({ startsAt })
    createdClassIds.push(classId)
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
  })

  it('confirmar PENDING_CONFIRM dentro del deadline → pasa a CONFIRMED', async () => {
    // Crear booking PENDING_CONFIRM con deadline en el futuro
    const deadline = new Date(Date.now() + 30 * 60 * 1000)
    const booking = await prisma.booking.create({
      data: { userId: memberAId, classId, status: 'PENDING_CONFIRM', confirmDeadline: deadline },
    })

    const result = await confirmWaitlistBooking(gymAId, memberAId, booking.id)

    expect(result.status).toBe('CONFIRMED')
    expect(result.confirmDeadline).toBeNull()
  })

  it('confirmar PENDING_CONFIRM con deadline expirado → error "tiempo para confirmar ha expirado"', async () => {
    // Deadline en el pasado
    const expiredDeadline = new Date(Date.now() - 60 * 1000)
    const booking = await prisma.booking.create({
      data: { userId: member2AId, classId, status: 'PENDING_CONFIRM', confirmDeadline: expiredDeadline },
    })

    await expect(
      confirmWaitlistBooking(gymAId, member2AId, booking.id)
    ).rejects.toThrow('El tiempo para confirmar ha expirado')
  })

  it('confirmar booking que NO es PENDING_CONFIRM → error', async () => {
    const booking = await prisma.booking.create({
      data: { userId: member3AId, classId, status: 'WAITLIST' },
    })

    await expect(
      confirmWaitlistBooking(gymAId, member3AId, booking.id)
    ).rejects.toThrow('Esta reserva no requiere confirmación')
  })

  it('confirmar booking de otro usuario → error "Reserva no encontrada"', async () => {
    // Usamos una clase nueva para evitar conflicto de unique(userId, classId) con los tests anteriores
    const startsAt = new Date(Date.now() + 41 * 60 * 60 * 1000)
    const otherClassId = await createClass({ startsAt })
    createdClassIds.push(otherClassId)

    const deadline = new Date(Date.now() + 30 * 60 * 1000)
    const booking = await prisma.booking.create({
      data: { userId: memberAId, classId: otherClassId, status: 'PENDING_CONFIRM', confirmDeadline: deadline },
    })

    // member2A intenta confirmar el booking de memberA
    await expect(
      confirmWaitlistBooking(gymAId, member2AId, booking.id)
    ).rejects.toThrow('Reserva no encontrada')

    // Cleanup
    await prisma.booking.deleteMany({ where: { classId: otherClassId } })
  })
})
