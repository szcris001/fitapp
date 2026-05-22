/**
 * activateMembership.integration.test.ts
 *
 * Tests de integración para la función privada activateMembership() de payments.service.ts.
 *
 * activateMembership NO es exportada directamente. Se testea a través de
 * handleStripeWebhook (el único caller que expone su comportamiento de forma
 * controlada sin mocks de red externos). Se construye un evento Stripe falso
 * con un planId/userId real y se invoca handleStripeWebhook con él.
 *
 * Alternativa considerada: exportar activateMembership y testearla directamente.
 * Decisión: NO hacer eso solo por tests — cambiaría la superficie pública del módulo.
 * Se testea por comportamiento observable (estado de DB después de llamar al webhook).
 *
 * Comportamiento documentado de activateMembership():
 *   1. Si hay membresía ACTIVE/TRIAL con endsAt > now → startsAt = existing.endsAt (extensión)
 *   2. Si NO hay membresía vigente → startsAt = new Date()
 *   3. updateMany pone TODAS las ACTIVE/TRIAL en INACTIVE (sin filtro por endsAt)
 *   4. Crea nueva membresía con status=ACTIVE y paymentMethod=<pasarela>
 *   5. Plan isTrial: NO aplica en activateMembership (eso es de assignMembership)
 *      — activateMembership siempre crea con status=ACTIVE
 *
 * Casos cubiertos:
 *   1.  Primera membresía del usuario — startsAt = now, sin solapamientos
 *   2.  Membresía previa ACTIVE vigente → extensión desde endsAt anterior
 *   3.  Extensión exacta: endsAt_nueva = endsAt_anterior + durationDays (días no se pierden)
 *   4.  Membresía previa TRIAL vigente → extensión desde endsAt (mismo comportamiento)
 *   5.  Membresía previa VENCIDA (endsAt < now, status=ACTIVE) → startsAt = now (no extiende)
 *   6.  Membresía previa INACTIVE → no se toma en cuenta para extensión, startsAt = now
 *   7.  Membresía previa queda INACTIVE al activar la nueva (updateMany)
 *   8.  Dos membresías ACTIVE previas → ambas quedan INACTIVE (updateMany es sin filtro)
 *   9.  No hay solapamientos: después de activar, solo hay 1 membresía ACTIVE por usuario
 *   10. Plan no encontrado → no crea membresía (error propagado)
 *   11. Idempotencia: llamar dos veces → dos membresías, ambas ACTIVE → no (la primera pasa a INACTIVE)
 *   12. Extensión desde la membresía con endsAt más lejano (múltiples ACTIVE con distinto endsAt)
 *   13. Usuario de otro gym → verificar que activateMembership no valida cross-gym
 *       (la validación de gymId la hace el caller, no activateMembership)
 *   14. extraData (autoRenew, stripePaymentMethodId, nextAutoRenewAt) se persisten en la nueva membresía
 *   15. pricePaid y currency copiados desde el plan
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import Stripe from 'stripe'
import { prisma } from '../../../lib/prisma'
import { handleStripeWebhook } from '../../payments/payments.service'

// ─── Mock de Stripe ───────────────────────────────────────────────────────────
// activateMembership es invocada desde handleStripeWebhook.
// Mockeamos Stripe para que constructEvent devuelva un evento fabricado
// con los datos de nuestros fixtures (gymId, planId, userId reales).

vi.mock('stripe', () => {
  const mockConstructEvent = vi.fn()
  const mockPaymentIntentsRetrieve = vi.fn()

  function MockStripe(_key: string, _opts: unknown) {
    return {
      webhooks: {
        constructEvent: mockConstructEvent,
        generateTestHeaderString: vi.fn(),
      },
      checkout: {
        sessions: { create: vi.fn() },
      },
      customers: {
        create: vi.fn().mockResolvedValue({ id: 'cus_mock_001' }),
      },
      paymentIntents: {
        create: vi.fn(),
        retrieve: mockPaymentIntentsRetrieve,
      },
    }
  }

  ;(MockStripe as any).__mockConstructEvent = mockConstructEvent
  ;(MockStripe as any).__mockPaymentIntentsRetrieve = mockPaymentIntentsRetrieve

  return { default: MockStripe }
})

// ─── Mock de email y push ─────────────────────────────────────────────────────
vi.mock('../../../lib/email', () => ({
  sendPaymentConfirmation: vi.fn().mockResolvedValue(undefined),
  sendExpiryReminder: vi.fn().mockResolvedValue(undefined),
  sendBulkToGyms: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../lib/push', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}))

// ─── Helpers para acceder a los mocks ────────────────────────────────────────

function getConstructEventMock(): ReturnType<typeof vi.fn> {
  return (Stripe as any).__mockConstructEvent
}

function getPaymentIntentsRetrieveMock(): ReturnType<typeof vi.fn> {
  return (Stripe as any).__mockPaymentIntentsRetrieve
}

// ─── Fixtures globales ────────────────────────────────────────────────────────

const GYM_SLUG = 'qa-activate-membership-gym'
const GYM_B_SLUG = 'qa-activate-membership-gym-b'
const TEST_PASSWORD = 'password123'

let gymId: string
let gymBId: string
let memberId: string
let memberBId: string
let planId: string
let planTrialId: string

// IDs de membresías creadas por tests — para cleanup en afterEach
const createdMembershipIds: string[] = []

// ─── Helper: fabricar un evento Stripe checkout.session.completed ─────────────
// Esto simula el payload que handleStripeWebhook recibe del webhook de Stripe.
// constructEvent está mockeado para devolver este objeto directamente.

function makeStripeEvent(overrides: {
  userId?: string
  planId?: string
  gymId?: string
  autoRenew?: '1' | '0'
  paymentIntentId?: string
} = {}) {
  const session: Record<string, unknown> = {
    id: 'cs_test_mock_activate',
    payment_intent: overrides.paymentIntentId ?? null,
    metadata: {
      gymId: overrides.gymId ?? gymId,
      planId: overrides.planId ?? planId,
      userId: overrides.userId ?? memberId,
      autoRenew: overrides.autoRenew ?? '0',
    },
  }

  return {
    type: 'checkout.session.completed',
    data: { object: session },
  }
}

// ─── Helper: invocar activateMembership de forma indirecta ───────────────────
// handleStripeWebhook llama a activateMembership cuando recibe checkout.session.completed.
// La firma del webhook no importa — está mockeada.

async function triggerActivate(overrides: {
  userId?: string
  planId?: string
  gymId?: string
  autoRenew?: '1' | '0'
  paymentIntentId?: string
} = {}) {
  const event = makeStripeEvent(overrides)
  const constructEvent = getConstructEventMock()
  constructEvent.mockReturnValueOnce(event)

  const result = await handleStripeWebhook(
    Buffer.from('{}'),
    'mock-signature',
  )

  return result
}

// ─── Helper: crear una membresía previa directamente en DB ───────────────────

async function createMembership(overrides: {
  userId?: string
  status?: 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'CANCELLED' | 'EXPIRED'
  endsAt?: Date
  startsAt?: Date
  planIdOverride?: string
} = {}) {
  const now = new Date()
  const defaultEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 días

  const membership = await prisma.membership.create({
    data: {
      userId: overrides.userId ?? memberId,
      planId: overrides.planIdOverride ?? planId,
      status: (overrides.status as any) ?? 'ACTIVE',
      startsAt: overrides.startsAt ?? now,
      endsAt: overrides.endsAt ?? defaultEndsAt,
      pricePaid: 30000,
      currency: 'CLP',
      paymentMethod: 'manual',
    },
  })

  createdMembershipIds.push(membership.id)
  return membership
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_SLUG, GYM_B_SLUG]) {
    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) {
      const users = await prisma.user.findMany({
        where: { gymId: existing.id },
        select: { id: true },
      })
      if (users.length) {
        await prisma.membership.deleteMany({
          where: { userId: { in: users.map(u => u.id) } },
        })
        await prisma.user.deleteMany({ where: { gymId: existing.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym principal
  const gym = await prisma.gym.create({
    data: { name: 'QA Activate Membership Gym', slug: GYM_SLUG, status: 'ACTIVE' },
  })
  gymId = gym.id

  // Gym secundario (para tests cross-gym)
  const gymB = await prisma.gym.create({
    data: { name: 'QA Activate Membership Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Miembro en Gym A
  const member = await prisma.user.create({
    data: {
      gymId,
      name: 'QA Activate Member',
      email: 'qa-activate-member@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberId = member.id

  // Miembro en Gym B
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'QA Activate Member B',
      email: 'qa-activate-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan estándar (30 días, 30000 CLP)
  const plan = await prisma.plan.create({
    data: {
      gymId,
      name: 'Plan Activate Test',
      priceCents: 30000,
      currency: 'CLP',
      durationDays: 30,
      isActive: true,
      autoRenewEnabled: false,
    },
  })
  planId = plan.id

  // Plan trial
  const planTrial = await prisma.plan.create({
    data: {
      gymId,
      name: 'Plan Trial Test',
      priceCents: 0,
      currency: 'CLP',
      durationDays: 7,
      isActive: true,
      isTrial: true,
      autoRenewEnabled: false,
    },
  })
  planTrialId = planTrial.id
})

afterAll(async () => {
  // Cleanup en orden FK
  await prisma.membership.deleteMany({
    where: { userId: { in: [memberId, memberBId].filter(Boolean) } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [memberId, memberBId].filter(Boolean) } },
  })
  await prisma.plan.deleteMany({ where: { gymId: { in: [gymId, gymBId].filter(Boolean) } } })
  await prisma.gym.deleteMany({
    where: { id: { in: [gymId, gymBId].filter(Boolean) } },
  }).catch(() => {})
  await prisma.$disconnect()
})

afterEach(async () => {
  // Borrar membresías creadas durante el test (tanto helpers como triggerActivate)
  // Recuperar TODAS las membresías del usuario para limpieza completa
  const all = await prisma.membership.findMany({
    where: { userId: { in: [memberId, memberBId] } },
    select: { id: true },
  })
  if (all.length) {
    await prisma.membership.deleteMany({
      where: { id: { in: all.map(m => m.id) } },
    })
  }
  createdMembershipIds.length = 0
  vi.clearAllMocks()
})

// ─── Suite 1: Primera membresía del usuario ───────────────────────────────────

describe('activateMembership — primera membresía del usuario', () => {
  it('Caso 1: sin membresía previa → startsAt ≈ now, endsAt = startsAt + durationDays', async () => {
    const before = new Date()
    const result = await triggerActivate()
    const after = new Date()

    expect(result.membershipId).toBeDefined()

    const membership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')

    // startsAt debe estar entre before y after (aproximado a ~1s)
    expect(membership!.startsAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(membership!.startsAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)

    // endsAt = startsAt + 30 días del plan
    const expectedEndsAt = new Date(membership!.startsAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const diff = Math.abs(membership!.endsAt.getTime() - expectedEndsAt.getTime())
    expect(diff).toBeLessThan(1000)

    // Solo hay 1 membresía ACTIVE para este usuario
    const activeCount = await prisma.membership.count({
      where: { userId: memberId, status: 'ACTIVE' },
    })
    expect(activeCount).toBe(1)
  })

  it('Caso 2: pricePaid y currency son copiados del plan', async () => {
    const result = await triggerActivate()
    const membership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })
    expect(membership!.pricePaid).toBe(30000)
    expect(membership!.currency).toBe('CLP')
    expect(membership!.paymentMethod).toBe('stripe')
    expect(membership!.paidAt).not.toBeNull()
  })
})

// ─── Suite 2: Extensión desde membresía vigente ───────────────────────────────

describe('activateMembership — extensión desde membresía vigente', () => {
  it('Caso 3: membresía ACTIVE vigente → nueva membresía extiende desde endsAt anterior', async () => {
    const now = new Date()
    // Membresía que vence en 15 días
    const existingEndsAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    await createMembership({ endsAt: existingEndsAt })

    const result = await triggerActivate()

    const newMembership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    // startsAt de la nueva = endsAt de la anterior
    const startsDiff = Math.abs(newMembership!.startsAt.getTime() - existingEndsAt.getTime())
    expect(startsDiff).toBeLessThan(1000)

    // endsAt de la nueva = endsAt anterior + 30 días del plan
    const expectedEndsAt = new Date(existingEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const endsDiff = Math.abs(newMembership!.endsAt.getTime() - expectedEndsAt.getTime())
    expect(endsDiff).toBeLessThan(1000)
  })

  it('Caso 4: días no se pierden — extensión toma el endsAt exacto, no "desde hoy"', async () => {
    const now = new Date()
    // Membresía que vence en 20 días (si se calculara desde hoy, se perderían esos días)
    const existingEndsAt = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000)
    await createMembership({ endsAt: existingEndsAt })

    const result = await triggerActivate()

    const newMembership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    // Si activateMembership usara new Date() en vez de existing.endsAt,
    // la diferencia sería ~50 días en vez de ~50 días desde existingEndsAt.
    // Verificamos que la nueva membresía dura exactamente 30 días desde existingEndsAt.
    const expectedEndsAt = new Date(existingEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const endsDiff = Math.abs(newMembership!.endsAt.getTime() - expectedEndsAt.getTime())
    expect(endsDiff).toBeLessThan(1000)

    // Y que no empezó desde now (lo que sería un bug silencioso de pérdida de días)
    const nowPlusDuration = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    // La nueva membresía debe terminar DESPUÉS de (now + 30 días)
    expect(newMembership!.endsAt.getTime()).toBeGreaterThan(nowPlusDuration.getTime())
  })

  it('Caso 5: membresía previa TRIAL vigente → también extiende desde su endsAt', async () => {
    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // vence en 5 días
    await createMembership({ status: 'TRIAL', endsAt: trialEndsAt })

    const result = await triggerActivate()

    const newMembership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    // Extensión desde trialEndsAt
    const startsDiff = Math.abs(newMembership!.startsAt.getTime() - trialEndsAt.getTime())
    expect(startsDiff).toBeLessThan(1000)
  })

  it('Caso 6: múltiples membresías ACTIVE — extiende desde la de endsAt más lejano', async () => {
    const now = new Date()
    // Dos membresías ACTIVE (raro pero posible)
    const endsAt1 = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)
    const endsAt2 = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000) // más lejana

    await createMembership({ endsAt: endsAt1 })
    await createMembership({ endsAt: endsAt2 })

    const result = await triggerActivate()

    const newMembership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    // activateMembership hace findFirst ordenado por endsAt desc → toma la más lejana
    const startsDiff = Math.abs(newMembership!.startsAt.getTime() - endsAt2.getTime())
    expect(startsDiff).toBeLessThan(1000)
  })
})

// ─── Suite 3: Membresía previa vencida o inactiva ────────────────────────────

describe('activateMembership — membresía previa vencida o inactiva', () => {
  it('Caso 7: membresía ACTIVE pero ya vencida (endsAt < now) → startsAt = now (no extiende)', async () => {
    const now = new Date()
    // Membresía vencida hace 5 días — endsAt < now, pero status = ACTIVE
    const expiredEndsAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    await createMembership({ endsAt: expiredEndsAt, status: 'ACTIVE' })

    const before = new Date()
    const result = await triggerActivate()
    const after = new Date()

    const newMembership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    // activateMembership busca endsAt: { gt: new Date() } — la expirada no matchea
    // Por lo tanto startsAt ≈ now
    expect(newMembership!.startsAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(newMembership!.startsAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })

  it('Caso 8: membresía INACTIVE → no se toma en cuenta para extensión, startsAt = now', async () => {
    const now = new Date()
    // Membresía futura pero INACTIVE
    const futureEndsAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    await createMembership({ status: 'INACTIVE', endsAt: futureEndsAt })

    const before = new Date()
    const result = await triggerActivate()
    const after = new Date()

    const newMembership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    // La membresía INACTIVE no se toma para extensión — startsAt ≈ now
    expect(newMembership!.startsAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(newMembership!.startsAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })
})

// ─── Suite 4: Exclusividad — sin solapamientos ───────────────────────────────

describe('activateMembership — sin solapamientos, membresías previas quedan INACTIVE', () => {
  it('Caso 9: membresía ACTIVE previa queda INACTIVE al activar la nueva', async () => {
    const existing = await createMembership({ status: 'ACTIVE' })
    expect(existing.status).toBe('ACTIVE')

    await triggerActivate()

    // La membresía anterior debe haber quedado INACTIVE
    const reloaded = await prisma.membership.findUnique({ where: { id: existing.id } })
    expect(reloaded!.status).toBe('INACTIVE')
  })

  it('Caso 10: membresía TRIAL previa queda INACTIVE al activar la nueva', async () => {
    const existing = await createMembership({ status: 'TRIAL' })

    await triggerActivate()

    const reloaded = await prisma.membership.findUnique({ where: { id: existing.id } })
    expect(reloaded!.status).toBe('INACTIVE')
  })

  it('Caso 11: dos membresías ACTIVE previas → ambas quedan INACTIVE (updateMany sin filtro endsAt)', async () => {
    const m1 = await createMembership({ status: 'ACTIVE' })
    const m2 = await createMembership({ status: 'ACTIVE' })

    await triggerActivate()

    const reloaded1 = await prisma.membership.findUnique({ where: { id: m1.id } })
    const reloaded2 = await prisma.membership.findUnique({ where: { id: m2.id } })

    expect(reloaded1!.status).toBe('INACTIVE')
    expect(reloaded2!.status).toBe('INACTIVE')
  })

  it('Caso 12: membresía INACTIVE previa NO cambia (updateMany filtra por status ACTIVE/TRIAL)', async () => {
    const existing = await createMembership({ status: 'INACTIVE' })

    await triggerActivate()

    // La INACTIVE ya era INACTIVE — no la toca
    const reloaded = await prisma.membership.findUnique({ where: { id: existing.id } })
    expect(reloaded!.status).toBe('INACTIVE')
  })

  it('Caso 13: después de activar, solo hay 1 membresía ACTIVE para el usuario', async () => {
    await createMembership({ status: 'ACTIVE' })
    await createMembership({ status: 'ACTIVE' })

    await triggerActivate()

    const activeCount = await prisma.membership.count({
      where: { userId: memberId, status: 'ACTIVE' },
    })
    expect(activeCount).toBe(1)
  })
})

// ─── Suite 5: Idempotencia y doble activación ─────────────────────────────────

describe('activateMembership — comportamiento ante llamadas repetidas', () => {
  it('Caso 14: llamar dos veces → primera membresía queda INACTIVE, segunda queda ACTIVE', async () => {
    const result1 = await triggerActivate()
    const result2 = await triggerActivate()

    expect(result1.membershipId).not.toBe(result2.membershipId)

    // Primera membresía: INACTIVE (fue desactivada por la segunda llamada)
    const m1 = await prisma.membership.findUnique({ where: { id: result1.membershipId } })
    expect(m1!.status).toBe('INACTIVE')

    // Segunda membresía: ACTIVE
    const m2 = await prisma.membership.findUnique({ where: { id: result2.membershipId } })
    expect(m2!.status).toBe('ACTIVE')

    // Solo 1 ACTIVE total
    const activeCount = await prisma.membership.count({
      where: { userId: memberId, status: 'ACTIVE' },
    })
    expect(activeCount).toBe(1)
  })

  it('Caso 15: segunda llamada extiende desde endsAt de la primera', async () => {
    const result1 = await triggerActivate()
    const m1 = await prisma.membership.findUnique({ where: { id: result1.membershipId } })

    const result2 = await triggerActivate()
    const m2 = await prisma.membership.findUnique({ where: { id: result2.membershipId } })

    // m2.startsAt debe ser aproximadamente m1.endsAt
    const diff = Math.abs(m2!.startsAt.getTime() - m1!.endsAt.getTime())
    expect(diff).toBeLessThan(1000)

    // m2.endsAt = m1.endsAt + 30 días
    const expectedEndsAt = new Date(m1!.endsAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const endsDiff = Math.abs(m2!.endsAt.getTime() - expectedEndsAt.getTime())
    expect(endsDiff).toBeLessThan(1000)
  })
})

// ─── Suite 6: Plan no encontrado ─────────────────────────────────────────────

describe('activateMembership — manejo de plan inexistente', () => {
  it('Caso 16: planId que no existe → no crea membresía, devuelve { received: true } sin membershipId', async () => {
    const constructEvent = getConstructEventMock()
    const fakeEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_bad_plan',
          payment_intent: null,
          metadata: {
            gymId,
            planId: 'plan-id-inexistente-en-db-12345',
            userId: memberId,
            autoRenew: '0',
          },
        },
      },
    }
    constructEvent.mockReturnValueOnce(fakeEvent)

    const result = await handleStripeWebhook(Buffer.from('{}'), 'mock-sig')

    // handleStripeWebhook hace early return { received: true } si el plan no existe
    expect(result).toEqual({ received: true })
    expect((result as any).membershipId).toBeUndefined()

    // No se creó membresía
    const count = await prisma.membership.count({ where: { userId: memberId } })
    expect(count).toBe(0)
  })
})

// ─── Suite 7: extraData — campos adicionales persistidos ─────────────────────

describe('activateMembership — extraData persistido en membresía', () => {
  it('Caso 17: autoRenew=true + paymentIntentId → stripePaymentMethodId guardado', async () => {
    // Crear plan con autoRenewEnabled=true para que el webhook lo procese
    const planWithAutoRenew = await prisma.plan.create({
      data: {
        gymId,
        name: 'Plan AutoRenew Activate Test',
        priceCents: 15000,
        currency: 'CLP',
        durationDays: 30,
        isActive: true,
        autoRenewEnabled: true,
        autoRenewDaysBefore: 3,
      },
    })

    // Mock de paymentIntents.retrieve para devolver un payment method
    const retrieveMock = getPaymentIntentsRetrieveMock()
    retrieveMock.mockResolvedValueOnce({
      id: 'pi_test_autorenew_mock',
      payment_method: 'pm_test_saved_method_001',
    })

    const result = await triggerActivate({
      planId: planWithAutoRenew.id,
      autoRenew: '1',
      paymentIntentId: 'pi_test_autorenew_mock',
    })

    const membership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    expect(membership!.autoRenew).toBe(true)
    expect(membership!.autoRenewConsent).toBe(true)
    expect(membership!.stripePaymentMethodId).toBe('pm_test_saved_method_001')
    expect(membership!.nextAutoRenewAt).not.toBeNull()

    // Cleanup: borrar membresías que referencian el plan extra, luego el plan
    // (FK constraint: Membership.planId → Plan.id)
    await prisma.membership.deleteMany({
      where: { planId: planWithAutoRenew.id },
    })
    await prisma.plan.delete({ where: { id: planWithAutoRenew.id } })
  })

  it('Caso 18: autoRenew=0 → autoRenew=false, stripePaymentMethodId=null', async () => {
    const result = await triggerActivate({ autoRenew: '0' })

    const membership = await prisma.membership.findUnique({
      where: { id: result.membershipId },
    })

    expect(membership!.autoRenew).toBe(false)
    expect(membership!.stripePaymentMethodId).toBeNull()
  })
})

// ─── Suite 8: Aislamiento cross-gym ──────────────────────────────────────────

describe('activateMembership — aislamiento por gymId', () => {
  it('Caso 19: membresía del usuario en Gym A → activar con planId de Gym A no afecta membresías de Gym B', async () => {
    // Crear membresía activa para memberB en Gym B
    const memberBMembership = await prisma.membership.create({
      data: {
        userId: memberBId,
        planId, // plan de gym A — técnicamente raro pero válido para el test
        status: 'ACTIVE',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePaid: 30000,
        currency: 'CLP',
      },
    })

    // Activar membresía para memberA (usuario del Gym A)
    await triggerActivate({ userId: memberId })

    // La membresía de memberB no fue tocada
    const reloadedB = await prisma.membership.findUnique({
      where: { id: memberBMembership.id },
    })
    expect(reloadedB!.status).toBe('ACTIVE')

    // Cleanup
    await prisma.membership.delete({ where: { id: memberBMembership.id } })
  })

  it('Caso 20: activateMembership de userB no pone INACTIVE las membresías de userA', async () => {
    // Membresía activa para memberA
    const memberAMembership = await createMembership({
      userId: memberId,
      status: 'ACTIVE',
    })

    // Activar membresía para memberB
    // Nota: plan de gym A — activateMembership no valida gymId del plan vs user
    await triggerActivate({ userId: memberBId })

    // memberA sigue con su membresía ACTIVE (el updateMany solo afecta al userId del call)
    const reloadedA = await prisma.membership.findUnique({
      where: { id: memberAMembership.id },
    })
    expect(reloadedA!.status).toBe('ACTIVE')

    // Cleanup membresía de memberB
    await prisma.membership.deleteMany({ where: { userId: memberBId } })
  })
})
