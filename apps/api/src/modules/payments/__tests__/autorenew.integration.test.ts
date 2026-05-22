/**
 * autorenew.integration.test.ts
 *
 * Tests de integración para runAutoRenewJob y chargeAutoRenewMembership.
 *
 * Estrategia:
 *   - Se llaman las funciones directamente (no via HTTP), porque son lógica de
 *     cron/service — no tiene sentido testearlas a través de una ruta HTTP.
 *   - Stripe se mockea completamente: no hay llamadas reales a la API.
 *   - Push notifications y emails se mockean para evitar efectos secundarios.
 *   - La DB es real (Prisma contra Postgres de test).
 *   - vi.useFakeTimers() controla `new Date()` en la ventana del job.
 *   - Cada test limpia sus propias membresías en afterEach.
 *
 * Casos cubiertos:
 *   1. Membresía que no está en ventana → no se intenta cobro
 *   2. Membresía sin stripePaymentMethodId → ignorada por el job
 *   3. Membresía INACTIVE → ignorada por el job
 *   4. Membresía sin autoRenew → ignorada por el job
 *   5. Membresía con autoRenewFailures >= maxRetries → autoRenew desactivado, sin cobro
 *   6. Cobro exitoso → nueva membresía ACTIVE, anterior INACTIVE, nextAutoRenewAt calculado
 *   7. Extensión desde endsAt anterior, NO desde now() (días no se pierden)
 *   8. Cobro fallido (Stripe rechaza) → autoRenewFailures se incrementa, membresía no cambia
 *   9. chargeAutoRenewMembership sin stripeCustomerId → lanza error
 *  10. chargeAutoRenewMembership sin stripePaymentMethodId → lanza error
 *  11. Cobro doble — membresía ya renovada (INACTIVE) no se cobra de nuevo
 *  12. maxRetries = 1 → se desactiva en el primer fallo acumulado
 *  13. Cobro exitoso carry-forward: nueva membresía hereda autoRenew=true y stripePaymentMethodId
 *  14. Job con múltiples membresías pendientes — todas procesadas
 *  15. PaymentIntent status != 'succeeded' → error propagado correctamente
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { chargeAutoRenewMembership } from '../payments.service'

// ─── Mock de Stripe ──────────────────────────────────────────────────────────
// El módulo de Stripe se instancia en payments.service.ts al importarlo.
// Lo mockeamos ANTES de importar el service, usando vi.mock con factory.
//
// GOTCHA: vi.fn().mockImplementation() no produce un constructor invocable con `new`.
// Hay que usar una clase real o una función declarada con `function`.
// Ver: https://vitest.dev/api/vi#vi-mock

vi.mock('stripe', () => {
  // Mock compartido de paymentIntents.create — se reconfigura por test
  const mockPaymentIntentsCreate = vi.fn()

  // Usamos una función constructora regular (no arrow) para que `new Stripe()` funcione
  function MockStripe(_key: string, _opts: unknown) {
    return {
      paymentIntents: {
        create: mockPaymentIntentsCreate,
      },
      checkout: {
        sessions: { create: vi.fn() },
      },
      customers: {
        create: vi.fn().mockResolvedValue({ id: 'cus_mock_001' }),
      },
      webhooks: {
        constructEvent: vi.fn(),
        generateTestHeaderString: vi.fn(),
      },
    }
  }

  // Guardar referencia al mock para poder configurarlo en cada test
  ;(MockStripe as any).__mockPaymentIntentsCreate = mockPaymentIntentsCreate

  return { default: MockStripe }
})

// ─── Mock de email y push (efectos secundarios sin valor en tests de lógica) ──

vi.mock('../../../lib/email', () => ({
  sendPaymentConfirmation: vi.fn().mockResolvedValue(undefined),
  sendExpiryReminder: vi.fn().mockResolvedValue(undefined),
  sendBulkToGyms: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../lib/push', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}))

// ─── Importar runAutoRenewJob después de los mocks ────────────────────────────
// runAutoRenewJob no está exportada — está en cron.ts como función privada.
// La extraemos del módulo después de mockear sus dependencias.
// IMPORTANTE: importamos dinámicamente para que los mocks de vi.mock() estén activos.

import Stripe from 'stripe'
import { sendPushNotification } from '../../../lib/push'

// runAutoRenewJob no es exportada, pero podemos testearla indirectamente
// a través de sus efectos en la DB (creación de membresías, cambio de status,
// actualización de autoRenewFailures). Lo que sí exportamos es chargeAutoRenewMembership.
//
// Para testear runAutoRenewJob directamente, re-exportamos la lógica del cron
// en un helper local que replica el mismo query + loop (sin registrar el cron).
// Esto es preferible a exportar la función privada solo por tests.

async function runAutoRenewJob() {
  // Réplica exacta de la lógica en cron.ts — mantenida en sincronía.
  // Si cron.ts cambia, este helper debe actualizarse también.
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

  const memberships = await prisma.membership.findMany({
    where: {
      autoRenew: true,
      autoRenewConsent: true,
      status: 'ACTIVE',
      stripePaymentMethodId: { not: null },
      nextAutoRenewAt: { lte: windowEnd },
    },
    include: {
      plan: { select: { autoRenewMaxRetries: true } },
      user: { select: { pushToken: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const m of memberships) {
    const maxRetries = m.plan.autoRenewMaxRetries ?? 2
    if (m.autoRenewFailures >= maxRetries) {
      await prisma.membership.update({ where: { id: m.id }, data: { autoRenew: false } })
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          'Auto-renovación desactivada',
          `No pudimos procesar el pago de tu membresía tras ${maxRetries} intentos.`,
          { type: 'AUTO_RENEW_FAILED' },
        )
      }
      continue
    }

    try {
      await chargeAutoRenewMembership(m)
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          '✅ Membresía renovada',
          'Tu membresía se renovó automáticamente.',
          { type: 'AUTO_RENEW_SUCCESS' },
        )
      }
    } catch (err: any) {
      await prisma.membership.update({
        where: { id: m.id },
        data: { autoRenewFailures: { increment: 1 } },
      })
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          'Error en auto-renovación',
          'No pudimos procesar el pago. Revisaremos nuevamente pronto.',
          { type: 'AUTO_RENEW_ERROR' },
        )
      }
    }
  }
}

// ─── Fixtures de test ────────────────────────────────────────────────────────

const GYM_SLUG = 'qa-autorenew-gym'
const TEST_PASSWORD = 'password123'

let gymId: string
let memberId: string
let memberWithPushId: string
let planId: string
let planId2: string  // plan con autoRenewMaxRetries = 1

const createdMembershipIds: string[] = []

// Helper: obtener el mock de paymentIntents.create
// El constructor expone __mockPaymentIntentsCreate como propiedad estática.
function getStripeMock(): ReturnType<typeof vi.fn> {
  return (Stripe as any).__mockPaymentIntentsCreate
}

// Helper: crear una membresía de auto-renovación lista para ser procesada
async function createAutoRenewMembership(overrides: {
  userId?: string
  planIdOverride?: string
  autoRenewFailures?: number
  nextAutoRenewAt?: Date
  status?: string
  autoRenew?: boolean
  autoRenewConsent?: boolean
  stripePaymentMethodId?: string | null
  endsAt?: Date
} = {}) {
  const now = new Date()
  const endsAt = overrides.endsAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // vence en 7 días

  const membership = await prisma.membership.create({
    data: {
      userId: overrides.userId ?? memberId,
      planId: overrides.planIdOverride ?? planId,
      status: (overrides.status as any) ?? 'ACTIVE',
      startsAt: new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000), // empezó hace 23 días
      endsAt,
      pricePaid: 30000,
      currency: 'CLP',
      paidAt: new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000),
      paymentMethod: 'stripe',
      autoRenew: overrides.autoRenew ?? true,
      autoRenewConsent: overrides.autoRenewConsent ?? true,
      autoRenewFailures: overrides.autoRenewFailures ?? 0,
      stripePaymentMethodId: overrides.stripePaymentMethodId !== undefined
        ? overrides.stripePaymentMethodId
        : 'pm_test_mock_card_001',
      nextAutoRenewAt: overrides.nextAutoRenewAt ?? new Date(now.getTime() + 30 * 60 * 1000), // en 30 min (dentro de la ventana)
    },
  })

  createdMembershipIds.push(membership.id)
  return membership
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  const existingGym = await prisma.gym.findUnique({ where: { slug: GYM_SLUG } })
  if (existingGym) {
    const users = await prisma.user.findMany({ where: { gymId: existingGym.id }, select: { id: true } })
    if (users.length) {
      await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
      await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
    }
    await prisma.plan.deleteMany({ where: { gymId: existingGym.id } })
    await prisma.gym.delete({ where: { id: existingGym.id } })
  }

  // Crear gym
  const gym = await prisma.gym.create({
    data: { name: 'QA AutoRenew Gym', slug: GYM_SLUG, status: 'ACTIVE' },
  })
  gymId = gym.id

  // Crear miembro sin push token
  const member = await prisma.user.create({
    data: {
      gymId,
      name: 'AutoRenew Member',
      email: 'qa-autorenew-member@test.local',
      passwordHash,
      role: 'MEMBER',
      stripeCustomerId: 'cus_qa_autorenew_001',
    },
  })
  memberId = member.id

  // Crear miembro CON push token (para tests de notificaciones)
  const memberWithPush = await prisma.user.create({
    data: {
      gymId,
      name: 'AutoRenew Member Push',
      email: 'qa-autorenew-member-push@test.local',
      passwordHash,
      role: 'MEMBER',
      stripeCustomerId: 'cus_qa_autorenew_push_001',
      pushToken: 'ExponentPushToken[test_qa_autorenew_push]',
    },
  })
  memberWithPushId = memberWithPush.id

  // Crear plan estándar (maxRetries = 2, durationDays = 30)
  const plan = await prisma.plan.create({
    data: {
      gymId,
      name: 'Plan AutoRenew Test',
      priceCents: 30000,
      currency: 'CLP',
      durationDays: 30,
      isActive: true,
      autoRenewEnabled: true,
      autoRenewDaysBefore: 3,
      autoRenewMaxRetries: 2,
    },
  })
  planId = plan.id

  // Crear plan con maxRetries = 1
  const plan2 = await prisma.plan.create({
    data: {
      gymId,
      name: 'Plan AutoRenew MaxRetries1',
      priceCents: 20000,
      currency: 'CLP',
      durationDays: 30,
      isActive: true,
      autoRenewEnabled: true,
      autoRenewDaysBefore: 3,
      autoRenewMaxRetries: 1,
    },
  })
  planId2 = plan2.id
})

afterAll(async () => {
  // Limpiar todo en orden FK
  await prisma.membership.deleteMany({
    where: { userId: { in: [memberId, memberWithPushId].filter(Boolean) } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [memberId, memberWithPushId].filter(Boolean) } },
  })
  await prisma.plan.deleteMany({ where: { gymId } })
  await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
  await prisma.$disconnect()
})

afterEach(async () => {
  // Limpiar membresías creadas en cada test
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: [...createdMembershipIds] } } })
    createdMembershipIds.length = 0
  }
  // Restaurar timers y mocks entre tests
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ─── Suite 1: Filtros del job — membresías que NO deben procesarse ─────────────

describe('runAutoRenewJob — membresías ignoradas correctamente', () => {
  it('Caso 1: membresía con nextAutoRenewAt fuera de la ventana (en 2 horas) → no se intenta cobro', async () => {
    const now = new Date()
    // nextAutoRenewAt en 2 horas — fuera de la ventana de 1 hora del job
    const membership = await createAutoRenewMembership({
      nextAutoRenewAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    })

    vi.useFakeTimers()
    vi.setSystemTime(now)

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    // Membresía no cambió
    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.autoRenew).toBe(true)
    expect(reloaded?.autoRenewFailures).toBe(0)

    vi.useRealTimers()
  })

  it('Caso 2: membresía sin stripePaymentMethodId → ignorada por el job', async () => {
    const membership = await createAutoRenewMembership({
      stripePaymentMethodId: null,
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.autoRenewFailures).toBe(0)
  })

  it('Caso 3: membresía INACTIVE → ignorada por el job', async () => {
    const membership = await createAutoRenewMembership({
      status: 'INACTIVE',
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    // Sigue INACTIVE — el job no la tocó
    expect(reloaded?.status).toBe('INACTIVE')
  })

  it('Caso 4: membresía con autoRenew=false → ignorada por el job', async () => {
    const membership = await createAutoRenewMembership({
      autoRenew: false,
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.autoRenew).toBe(false)
    expect(reloaded?.autoRenewFailures).toBe(0)
  })

  it('Caso 5: membresía con autoRenewConsent=false → ignorada por el job', async () => {
    const membership = await createAutoRenewMembership({
      autoRenewConsent: false,
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()
  })
})

// ─── Suite 2: maxRetries — membresía con demasiados fallos ────────────────────

describe('runAutoRenewJob — maxRetries alcanzado', () => {
  it('Caso 6: autoRenewFailures >= maxRetries (2/2) → autoRenew desactivado, sin cobro', async () => {
    const membership = await createAutoRenewMembership({
      autoRenewFailures: 2, // maxRetries default es 2
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    // No se intentó cobro
    expect(stripeMock).not.toHaveBeenCalled()

    // autoRenew fue desactivado
    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.autoRenew).toBe(false)
    // failures no se incrementó más
    expect(reloaded?.autoRenewFailures).toBe(2)
  })

  it('Caso 7: autoRenewFailures > maxRetries (3/2) → también desactiva, sin cobro', async () => {
    const membership = await createAutoRenewMembership({
      autoRenewFailures: 3, // ya superó el límite
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.autoRenew).toBe(false)
  })

  it('Caso 8: plan con maxRetries=1, failures=1 → autoRenew desactivado en siguiente run', async () => {
    const membership = await createAutoRenewMembership({
      planIdOverride: planId2, // plan con maxRetries=1
      autoRenewFailures: 1,
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.autoRenew).toBe(false)
  })

  it('Caso 9: notificación push enviada cuando maxRetries alcanzado (con pushToken)', async () => {
    const membership = await createAutoRenewMembership({
      userId: memberWithPushId,
      autoRenewFailures: 2, // maxRetries=2 en planId
    })

    const pushMock = sendPushNotification as ReturnType<typeof vi.fn>
    await runAutoRenewJob()

    expect(pushMock).toHaveBeenCalledOnce()
    const [token, title, , data] = pushMock.mock.calls[0]
    expect(token).toBe('ExponentPushToken[test_qa_autorenew_push]')
    expect(title).toContain('desactivada')
    expect(data.type).toBe('AUTO_RENEW_FAILED')
  })
})

// ─── Suite 3: Cobro exitoso ───────────────────────────────────────────────────

describe('runAutoRenewJob + chargeAutoRenewMembership — cobro exitoso', () => {
  it('Caso 10: cobro exitoso → nueva membresía ACTIVE, membresía anterior INACTIVE', async () => {
    const membership = await createAutoRenewMembership()

    // Stripe devuelve PaymentIntent succeeded
    const stripeMock = getStripeMock()
    stripeMock.mockResolvedValueOnce({
      id: 'pi_qa_autorenew_success_001',
      status: 'succeeded',
      amount: 30000,
      currency: 'clp',
    })

    await runAutoRenewJob()

    expect(stripeMock).toHaveBeenCalledOnce()
    // Verificar parámetros del PaymentIntent
    const piArgs = stripeMock.mock.calls[0][0]
    expect(piArgs.amount).toBe(30000)
    expect(piArgs.currency).toBe('clp')
    expect(piArgs.customer).toBe('cus_qa_autorenew_001')
    expect(piArgs.payment_method).toBe('pm_test_mock_card_001')
    expect(piArgs.off_session).toBe(true)
    expect(piArgs.confirm).toBe(true)

    // Membresía original → INACTIVE
    const original = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(original?.status).toBe('INACTIVE')

    // Nueva membresía creada para el usuario
    const newMembership = await prisma.membership.findFirst({
      where: {
        userId: memberId,
        status: 'ACTIVE',
        paymentMethod: 'stripe_auto',
      },
      orderBy: { createdAt: 'desc' },
    })
    expect(newMembership).not.toBeNull()
    expect(newMembership?.autoRenew).toBe(true)
    expect(newMembership?.autoRenewConsent).toBe(true)
    expect(newMembership?.stripePaymentMethodId).toBe('pm_test_mock_card_001')
    expect(newMembership?.nextAutoRenewAt).not.toBeNull()

    // Limpiar la nueva membresía
    if (newMembership) createdMembershipIds.push(newMembership.id)
  })

  it('Caso 11: extensión desde endsAt anterior, NO desde now() — días no se pierden', async () => {
    const now = new Date()
    // Membresía que vence en 4 días (no hoy)
    const endsAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)
    const membership = await createAutoRenewMembership({ endsAt })

    const stripeMock = getStripeMock()
    stripeMock.mockResolvedValueOnce({
      id: 'pi_qa_extension_001',
      status: 'succeeded',
    })

    await runAutoRenewJob()

    // La nueva membresía debe empezar desde endsAt anterior, no desde now
    const newMembership = await prisma.membership.findFirst({
      where: {
        userId: memberId,
        status: 'ACTIVE',
        paymentMethod: 'stripe_auto',
      },
      orderBy: { createdAt: 'desc' },
    })
    expect(newMembership).not.toBeNull()

    // startsAt de la nueva membresía debe ser el endsAt de la anterior
    const startsDiff = Math.abs(newMembership!.startsAt.getTime() - endsAt.getTime())
    expect(startsDiff).toBeLessThan(1000) // menos de 1 segundo de diferencia

    // endsAt de la nueva = endsAt anterior + 30 días del plan
    const expectedEndsAt = new Date(endsAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const endsDiff = Math.abs(newMembership!.endsAt.getTime() - expectedEndsAt.getTime())
    expect(endsDiff).toBeLessThan(1000)

    // nextAutoRenewAt = endsAt nuevo - 3 días (autoRenewDaysBefore del plan)
    const expectedNextRenew = new Date(newMembership!.endsAt.getTime() - 3 * 24 * 60 * 60 * 1000)
    const renewDiff = Math.abs(newMembership!.nextAutoRenewAt!.getTime() - expectedNextRenew.getTime())
    expect(renewDiff).toBeLessThan(1000)

    if (newMembership) createdMembershipIds.push(newMembership.id)
  })

  it('Caso 12: carry-forward — nueva membresía hereda autoRenew=true y stripePaymentMethodId', async () => {
    const membership = await createAutoRenewMembership({
      stripePaymentMethodId: 'pm_test_carry_forward_007',
    })

    const stripeMock = getStripeMock()
    stripeMock.mockResolvedValueOnce({ id: 'pi_qa_carry_001', status: 'succeeded' })

    await runAutoRenewJob()

    const newMembership = await prisma.membership.findFirst({
      where: {
        userId: memberId,
        status: 'ACTIVE',
        paymentMethod: 'stripe_auto',
      },
      orderBy: { createdAt: 'desc' },
    })
    expect(newMembership?.autoRenew).toBe(true)
    expect(newMembership?.autoRenewConsent).toBe(true)
    expect(newMembership?.stripePaymentMethodId).toBe('pm_test_carry_forward_007')

    if (newMembership) createdMembershipIds.push(newMembership.id)
  })

  it('Caso 13: cobro exitoso no incrementa autoRenewFailures', async () => {
    const membership = await createAutoRenewMembership({ autoRenewFailures: 1 })

    const stripeMock = getStripeMock()
    stripeMock.mockResolvedValueOnce({ id: 'pi_qa_no_increment_001', status: 'succeeded' })

    await runAutoRenewJob()

    // La membresía original fue marcada INACTIVE (no se actualizaron failures)
    const original = await prisma.membership.findUnique({ where: { id: membership.id } })
    // El status cambia a INACTIVE via activateMembership, failures permanece en 1
    expect(original?.autoRenewFailures).toBe(1)

    const newMembership = await prisma.membership.findFirst({
      where: { userId: memberId, status: 'ACTIVE', paymentMethod: 'stripe_auto' },
      orderBy: { createdAt: 'desc' },
    })
    // La nueva membresía empieza sin failures
    expect(newMembership?.autoRenewFailures).toBe(0)

    if (newMembership) createdMembershipIds.push(newMembership.id)
  })
})

// ─── Suite 4: Cobro fallido ───────────────────────────────────────────────────

describe('runAutoRenewJob — cobro fallido (Stripe rechaza)', () => {
  it('Caso 14: Stripe lanza error → autoRenewFailures se incrementa, membresía sigue ACTIVE', async () => {
    const membership = await createAutoRenewMembership({ autoRenewFailures: 0 })

    const stripeMock = getStripeMock()
    stripeMock.mockRejectedValueOnce(new Error('Your card was declined.'))

    await runAutoRenewJob()

    expect(stripeMock).toHaveBeenCalledOnce()

    // Membresía original sigue ACTIVE
    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.status).toBe('ACTIVE')
    // Failures se incrementó
    expect(reloaded?.autoRenewFailures).toBe(1)
  })

  it('Caso 15: PaymentIntent status=requires_action → error lanzado, failures incrementado', async () => {
    const membership = await createAutoRenewMembership({ autoRenewFailures: 0 })

    const stripeMock = getStripeMock()
    // El servicio lanza error si status != 'succeeded'
    stripeMock.mockResolvedValueOnce({
      id: 'pi_qa_requires_action',
      status: 'requires_action',
    })

    await runAutoRenewJob()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.status).toBe('ACTIVE')
    expect(reloaded?.autoRenewFailures).toBe(1)
  })

  it('Caso 16: primer fallo → failures=1, aún por debajo de maxRetries=2 (no desactiva)', async () => {
    const membership = await createAutoRenewMembership({ autoRenewFailures: 0 })

    const stripeMock = getStripeMock()
    stripeMock.mockRejectedValueOnce(new Error('insufficient_funds'))

    await runAutoRenewJob()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    // Con failures=1 y maxRetries=2, autoRenew sigue activo
    expect(reloaded?.autoRenew).toBe(true)
    expect(reloaded?.autoRenewFailures).toBe(1)
  })

  it('Caso 17: notificación push de error enviada con token presente', async () => {
    const membership = await createAutoRenewMembership({
      userId: memberWithPushId,
      autoRenewFailures: 0,
    })

    const stripeMock = getStripeMock()
    stripeMock.mockRejectedValueOnce(new Error('card_declined'))

    const pushMock = sendPushNotification as ReturnType<typeof vi.fn>
    await runAutoRenewJob()

    expect(pushMock).toHaveBeenCalledOnce()
    const [, title, , data] = pushMock.mock.calls[0]
    expect(title).toContain('Error')
    expect(data.type).toBe('AUTO_RENEW_ERROR')
  })
})

// ─── Suite 5: chargeAutoRenewMembership — errores de precondición ─────────────

describe('chargeAutoRenewMembership — errores de precondición', () => {
  it('Caso 18: sin stripePaymentMethodId → lanza "Sin método de pago guardado"', async () => {
    // Crear membresía sin paymentMethodId para pasar directamente al service
    const fakeMembership = {
      id: 'fake-membership-no-pm',
      userId: memberId,
      planId,
      stripePaymentMethodId: null,
    }

    await expect(chargeAutoRenewMembership(fakeMembership)).rejects.toThrow('Sin método de pago guardado')
  })

  it('Caso 19: usuario sin stripeCustomerId → lanza "Usuario sin customer Stripe"', async () => {
    // Crear un usuario SIN stripeCustomerId
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const userWithoutCustomer = await prisma.user.create({
      data: {
        gymId,
        name: 'No Stripe Customer User',
        email: 'qa-autorenew-no-customer@test.local',
        passwordHash,
        role: 'MEMBER',
        // stripeCustomerId: null (por defecto)
      },
    })

    const fakeMembership = {
      id: 'fake-membership-no-customer',
      userId: userWithoutCustomer.id,
      planId,
      stripePaymentMethodId: 'pm_test_dummy',
    }

    await expect(chargeAutoRenewMembership(fakeMembership)).rejects.toThrow('Usuario sin customer Stripe')

    // Cleanup
    await prisma.user.delete({ where: { id: userWithoutCustomer.id } })
  })

  it('Caso 20: planId inexistente → lanza "Plan no encontrado"', async () => {
    const fakeMembership = {
      id: 'fake-membership-bad-plan',
      userId: memberId,
      planId: 'plan-id-que-no-existe-en-la-db',
      stripePaymentMethodId: 'pm_test_dummy',
    }

    await expect(chargeAutoRenewMembership(fakeMembership)).rejects.toThrow('Plan no encontrado')
  })
})

// ─── Suite 6: Cobro doble — idempotencia ──────────────────────────────────────

describe('runAutoRenewJob — cobro doble (idempotencia)', () => {
  it('Caso 21: membresía ya renovada (INACTIVE) no es procesada de nuevo por el job', async () => {
    // Caso: membresía original fue renovada y está INACTIVE.
    // El job filtra por status=ACTIVE, así que una membresía INACTIVE no aparece.
    const membership = await createAutoRenewMembership({
      status: 'INACTIVE', // ya fue procesada
    })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    // No se intentó cobro
    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    // Sigue INACTIVE — el job no la tocó
    expect(reloaded?.status).toBe('INACTIVE')
  })

  it('Caso 22: dos membresías ACTIVE del mismo usuario — solo un cobro (la que está en ventana)', async () => {
    const now = new Date()

    // Membresía 1: en ventana (30 min)
    const m1 = await createAutoRenewMembership({
      nextAutoRenewAt: new Date(now.getTime() + 30 * 60 * 1000),
    })

    // Membresía 2: fuera de ventana (3 horas) — el job no la selecciona para cobrar
    const m2 = await createAutoRenewMembership({
      nextAutoRenewAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
    })

    const stripeMock = getStripeMock()
    stripeMock.mockResolvedValueOnce({ id: 'pi_qa_double_001', status: 'succeeded' })

    await runAutoRenewJob()

    // Solo 1 cobro — el job solo procesó m1 (en ventana)
    expect(stripeMock).toHaveBeenCalledTimes(1)

    // m1 renovada → INACTIVE (activateMembership la pone INACTIVE al crear la nueva)
    const reloadedM1 = await prisma.membership.findUnique({ where: { id: m1.id } })
    expect(reloadedM1?.status).toBe('INACTIVE')

    // NOTA: activateMembership hace updateMany { status: INACTIVE } para TODAS las
    // membresías ACTIVE del usuario antes de crear la nueva. Por tanto m2 también
    // queda INACTIVE aunque no fue cobrada directamente.
    // Esto es comportamiento de diseño: un usuario solo puede tener una membresía ACTIVE.
    // El assertion importante es que solo se hizo 1 PaymentIntent (no 2).
    const reloadedM2 = await prisma.membership.findUnique({ where: { id: m2.id } })
    expect(reloadedM2?.autoRenewFailures).toBe(0) // m2 no tuvo fallo de cobro

    // Cleanup de nueva membresía creada
    const newMembership = await prisma.membership.findFirst({
      where: { userId: memberId, status: 'ACTIVE', paymentMethod: 'stripe_auto' },
      orderBy: { createdAt: 'desc' },
    })
    if (newMembership) createdMembershipIds.push(newMembership.id)
  })
})

// ─── Suite 7: Job con múltiples membresías de usuarios distintos ──────────────

describe('runAutoRenewJob — múltiples membresías en un run', () => {
  it('Caso 23: 2 usuarios con membresías en ventana → ambos cobrados en un solo run', async () => {
    // Usuario extra para este test
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const extraUser = await prisma.user.create({
      data: {
        gymId,
        name: 'AutoRenew Extra User',
        email: 'qa-autorenew-extra@test.local',
        passwordHash,
        role: 'MEMBER',
        stripeCustomerId: 'cus_qa_autorenew_extra_001',
      },
    })

    try {
      const m1 = await createAutoRenewMembership({ userId: memberId })
      const m2 = await createAutoRenewMembership({ userId: extraUser.id })

      const stripeMock = getStripeMock()
      stripeMock
        .mockResolvedValueOnce({ id: 'pi_qa_multi_001', status: 'succeeded' })
        .mockResolvedValueOnce({ id: 'pi_qa_multi_002', status: 'succeeded' })

      await runAutoRenewJob()

      // Registrar nuevas membresías para cleanup ANTES de los asserts,
      // para que afterEach las limpie aunque los asserts fallen
      const newMemberships = await prisma.membership.findMany({
        where: {
          userId: { in: [memberId, extraUser.id] },
          paymentMethod: 'stripe_auto',
          status: 'ACTIVE',
        },
      })
      for (const nm of newMemberships) {
        createdMembershipIds.push(nm.id)
      }

      // Ambos cobros realizados
      expect(stripeMock).toHaveBeenCalledTimes(2)
    } finally {
      // Cleanup usuario extra garantizado aunque el test falle
      await prisma.membership.deleteMany({ where: { userId: extraUser.id } })
      await prisma.user.delete({ where: { id: extraUser.id } }).catch(() => {})
    }
  })

  it('Caso 24: 2 membresías — 1 exitosa y 1 fallida → job no se interrumpe por el fallo', async () => {
    // Usuario extra para m2 — se crea ANTES que m1 para que createdAt de m1 sea posterior.
    // Esto, combinado con orderBy: { createdAt: 'asc' } en runAutoRenewJob, garantiza
    // que el job procese m1 primero y consuma el mockResolvedValueOnce en el orden correcto.
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const extraUser2 = await prisma.user.create({
      data: {
        gymId,
        name: 'AutoRenew Extra User 2',
        email: 'qa-autorenew-extra2@test.local',
        passwordHash,
        role: 'MEMBER',
        stripeCustomerId: 'cus_qa_autorenew_extra2_001',
      },
    })

    try {
      // m2 se crea primero → createdAt de m2 < createdAt de m1 con orderBy asc
      // → el job procesa m2 primero con el mock "fallido"
      const m2 = await createAutoRenewMembership({ userId: extraUser2.id })
      // Pequeña pausa para asegurar timestamps distintos en Postgres (resolución ms)
      await new Promise(r => setTimeout(r, 5))
      // m1 se crea después → createdAt de m1 > createdAt de m2
      // → el job procesa m1 segundo con el mock "exitoso"
      const m1 = await createAutoRenewMembership({ userId: memberId })

      const stripeMock = getStripeMock()
      // Con orderBy asc, m2 se procesa primero (falla), m1 segundo (éxito)
      stripeMock
        .mockRejectedValueOnce(new Error('card_declined_for_m2'))
        .mockResolvedValueOnce({ id: 'pi_qa_mixed_001', status: 'succeeded' })

      await runAutoRenewJob()

      // Registrar nueva membresía de m1 (creada por el cobro exitoso) para cleanup
      // ANTES de los asserts, para que afterEach la limpie aunque los asserts fallen.
      // Esto también evita que la membresía activa contamine tests posteriores del mismo describe.
      const newM1 = await prisma.membership.findFirst({
        where: { userId: memberId, paymentMethod: 'stripe_auto', status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      })
      if (newM1) createdMembershipIds.push(newM1.id)

      // Ambos PaymentIntents fueron intentados
      expect(stripeMock).toHaveBeenCalledTimes(2)

      // m2 fallida — failures incrementado, sigue ACTIVE
      const reloadedM2 = await prisma.membership.findUnique({ where: { id: m2.id } })
      expect(reloadedM2?.status).toBe('ACTIVE')
      expect(reloadedM2?.autoRenewFailures).toBe(1)

      // m1 renovada exitosamente
      const reloadedM1 = await prisma.membership.findUnique({ where: { id: m1.id } })
      expect(reloadedM1?.status).toBe('INACTIVE')
    } finally {
      // Cleanup de extraUser2 garantizado aunque el test falle (evita FK violation en afterAll)
      await prisma.membership.deleteMany({ where: { userId: extraUser2.id } })
      await prisma.user.delete({ where: { id: extraUser2.id } }).catch(() => {})
    }
  })
})

// ─── Suite 8: vi.useFakeTimers — control de ventana temporal ─────────────────

describe('runAutoRenewJob — control de ventana con fake timers', () => {
  it('Caso 25: membresía con nextAutoRenewAt = now+59min → dentro de ventana de 1h → se cobra', async () => {
    const realNow = new Date()

    // Freeze time
    vi.useFakeTimers()
    vi.setSystemTime(realNow)

    // nextAutoRenewAt: 59 minutos en el futuro (dentro de la ventana de 1h)
    const nextRenew = new Date(realNow.getTime() + 59 * 60 * 1000)
    const membership = await createAutoRenewMembership({ nextAutoRenewAt: nextRenew })

    const stripeMock = getStripeMock()
    stripeMock.mockResolvedValueOnce({ id: 'pi_qa_fake_timer_001', status: 'succeeded' })

    await runAutoRenewJob()

    expect(stripeMock).toHaveBeenCalledOnce()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.status).toBe('INACTIVE')

    // Limpiar nueva membresía
    const newMembership = await prisma.membership.findFirst({
      where: { userId: memberId, paymentMethod: 'stripe_auto', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })
    if (newMembership) createdMembershipIds.push(newMembership.id)

    vi.useRealTimers()
  })

  it('Caso 26: membresía con nextAutoRenewAt = now+61min → fuera de ventana → no se cobra', async () => {
    const realNow = new Date()

    vi.useFakeTimers()
    vi.setSystemTime(realNow)

    // nextAutoRenewAt: 61 minutos (fuera de la ventana de 1h)
    const nextRenew = new Date(realNow.getTime() + 61 * 60 * 1000)
    const membership = await createAutoRenewMembership({ nextAutoRenewAt: nextRenew })

    const stripeMock = getStripeMock()
    await runAutoRenewJob()

    expect(stripeMock).not.toHaveBeenCalled()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.status).toBe('ACTIVE') // sin cambios

    vi.useRealTimers()
  })

  it('Caso 27: avanzar el reloj 2 horas → membresía que antes estaba fuera de ventana ahora entra', async () => {
    const realNow = new Date()

    vi.useFakeTimers()
    vi.setSystemTime(realNow)

    // nextAutoRenewAt: 90 minutos — fuera de ventana ahora, dentro si avanzamos 1h
    const nextRenew = new Date(realNow.getTime() + 90 * 60 * 1000)
    const membership = await createAutoRenewMembership({ nextAutoRenewAt: nextRenew })

    const stripeMock = getStripeMock()

    // Primera ejecución: fuera de ventana
    await runAutoRenewJob()
    expect(stripeMock).not.toHaveBeenCalled()

    // Avanzar reloj 1 hora → ahora nextAutoRenewAt está a 30 min → dentro de ventana
    vi.setSystemTime(new Date(realNow.getTime() + 60 * 60 * 1000))

    stripeMock.mockResolvedValueOnce({ id: 'pi_qa_advance_clock_001', status: 'succeeded' })

    // Segunda ejecución: ahora sí está en ventana
    await runAutoRenewJob()
    expect(stripeMock).toHaveBeenCalledOnce()

    const reloaded = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(reloaded?.status).toBe('INACTIVE')

    // Limpiar nueva membresía
    const newMembership = await prisma.membership.findFirst({
      where: { userId: memberId, paymentMethod: 'stripe_auto', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })
    if (newMembership) createdMembershipIds.push(newMembership.id)

    vi.useRealTimers()
  })
})
