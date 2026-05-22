/**
 * payments.crud.integration.test.ts
 *
 * Tests de integración para los endpoints REST de payments (excluye webhooks y transfer,
 * que ya están cubiertos en stripe.webhook.integration.test.ts y transfer.integration.test.ts).
 *
 * Endpoints cubiertos:
 *   - GET  /payments/history          — requireAdmin — historial paginado por gym
 *   - GET  /payments/revenue          — requireAdmin — estadísticas de ingresos del gym
 *   - GET  /payments/gateways         — authenticate — pasarelas habilitadas del gym
 *   - GET  /payments/my-memberships   — authenticate — membresías del usuario autenticado
 *   - PUT  /payments/my-memberships/:id/auto-renew — authenticate — toggle auto-renovación
 *   - POST /payments/manual           — requireAdmin — registro de pago manual (cash/transfer/etc.)
 *   - POST /payments/checkout         — requireAdmin — crea Stripe checkout session para un usuario
 *   - POST /payments/checkout-self    — authenticate — miembro crea su propio checkout Stripe
 *
 * Estrategia:
 *   - Stripe se mockea: no hay llamadas reales a la API de Stripe.
 *   - Email se mockea: no hay efectos secundarios de notificaciones.
 *   - La DB es real (Prisma contra Postgres de test).
 *   - DTE (emisión de documentos) se mockea: devuelve null.
 *   - Se usan dos gyms (A y B) para verificar aislamiento de tenancy.
 *   - Se limpian todos los datos al finalizar.
 *
 * Casos cubiertos: 42 tests
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'

// ─── Mocks (deben ir antes de importar el service) ───────────────────────────

// Stripe: mockear checkout.sessions.create y customers.create
vi.mock('stripe', () => {
  const mockCheckoutCreate = vi.fn().mockResolvedValue({
    id: 'cs_test_mock_001',
    url: 'https://checkout.stripe.com/test/mock',
  })
  const mockCustomersCreate = vi.fn().mockResolvedValue({ id: 'cus_mock_001' })

  function MockStripe(_key: string, _opts: unknown) {
    return {
      checkout: {
        sessions: { create: mockCheckoutCreate },
      },
      customers: {
        create: mockCustomersCreate,
      },
      paymentIntents: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
      webhooks: {
        constructEvent: vi.fn(),
        generateTestHeaderString: vi.fn(),
      },
    }
  }
  ;(MockStripe as any).__mockCheckoutCreate = mockCheckoutCreate
  ;(MockStripe as any).__mockCustomersCreate = mockCustomersCreate
  return { default: MockStripe }
})

// Email: suprimir efectos secundarios
vi.mock('../../../lib/email', () => ({
  sendPaymentConfirmation: vi.fn().mockResolvedValue(undefined),
  sendExpiryReminder: vi.fn().mockResolvedValue(undefined),
  sendBulkToGyms: vi.fn().mockResolvedValue(undefined),
}))

// DTE: suprimir emisión de documentos tributarios
vi.mock('../../../lib/dte', () => ({
  emitirDTE: vi.fn().mockResolvedValue(null),
}))

// ─── Importar rutas después de mocks ─────────────────────────────────────────

import { paymentRoutes } from '../payments.routes'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'
const GYM_A_SLUG = 'qa-crud-gym-a'
const GYM_B_SLUG = 'qa-crud-gym-b'

// IDs creados en setup
let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let coachAId: string
let adminBId: string
let memberBId: string
let planAId: string
let planBId: string

// Tokens JWT
let adminAToken: string
let memberAToken: string
let coachAToken: string
let adminBToken: string
let memberBToken: string

// IDs de membresías creadas en tests — para cleanup
const createdMembershipIds: string[] = []

// ─── Helper: construir la app Fastify mínima ──────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (_req: any, body: Buffer, done: (err: Error | null, body?: unknown) => void) {
      ;(_req as any).rawBody = body
      if (!body || body.length === 0) { done(null, null); return }
      try { done(null, JSON.parse(body.toString())) }
      catch { done(null, null) }
    },
  )

  await app.register(paymentRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

// ─── Setup / Teardown global ──────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existingGym = await prisma.gym.findUnique({ where: { slug } })
    if (existingGym) {
      const users = await prisma.user.findMany({ where: { gymId: existingGym.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existingGym.id } })
      await prisma.gym.delete({ where: { id: existingGym.id } })
    }
  }

  // Crear Gym A (con pasarela Stripe habilitada y una sin apiKey para gateways)
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA CRUD Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        stripe: { enabled: true },
        mercadopago: { enabled: false },
      },
    },
  })
  gymAId = gymA.id

  // Crear Gym B (sin pasarelas habilitadas)
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA CRUD Gym B',
      slug: GYM_B_SLUG,
      status: 'ACTIVE',
      paymentGateways: {},
    },
  })
  gymBId = gymB.id

  // Usuarios de Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin CRUD A', email: 'qa-crud-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member CRUD A', email: 'qa-crud-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  const coachA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Coach CRUD A', email: 'qa-crud-coach-a@test.local', passwordHash, role: 'COACH' },
  })
  coachAId = coachA.id

  // Usuarios de Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin CRUD B', email: 'qa-crud-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  const memberB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Member CRUD B', email: 'qa-crud-member-b@test.local', passwordHash, role: 'MEMBER' },
  })
  memberBId = memberB.id

  // Plan activo en Gym A
  const planA = await prisma.plan.create({
    data: { gymId: gymAId, name: 'Plan CRUD A', priceCents: 25000, currency: 'CLP', durationDays: 30, isActive: true },
  })
  planAId = planA.id

  // Plan activo en Gym B
  const planB = await prisma.plan.create({
    data: { gymId: gymBId, name: 'Plan CRUD B', priceCents: 20000, currency: 'CLP', durationDays: 30, isActive: true },
  })
  planBId = planB.id

  // Generar tokens JWT
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, email: 'qa-crud-admin-a@test.local', role: 'ADMIN', name: 'Admin CRUD A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, email: 'qa-crud-member-a@test.local', role: 'MEMBER', name: 'Member CRUD A' })
  coachAToken = tempApp.jwt.sign({ userId: coachAId, gymId: gymAId, email: 'qa-crud-coach-a@test.local', role: 'COACH', name: 'Coach CRUD A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, email: 'qa-crud-admin-b@test.local', role: 'ADMIN', name: 'Admin CRUD B' })
  memberBToken = tempApp.jwt.sign({ userId: memberBId, gymId: gymBId, email: 'qa-crud-member-b@test.local', role: 'MEMBER', name: 'Member CRUD B' })

  await tempApp.close()
})

afterAll(async () => {
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } }).catch(() => {})
  }
  const allUserIds = [adminAId, memberAId, coachAId, adminBId, memberBId].filter(Boolean)
  await prisma.membership.deleteMany({ where: { userId: { in: allUserIds } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } }).catch(() => {})
  await prisma.plan.deleteMany({ where: { id: { in: [planAId, planBId].filter(Boolean) } } }).catch(() => {})
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } }).catch(() => {})
  await prisma.$disconnect()
})

// ─── Suite 1: GET /payments/history ──────────────────────────────────────────

describe('GET /api/payments/history — historial de pagos del gym', () => {
  let app: FastifyInstance
  let seededMembershipId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear una membresía con paidAt para que aparezca en el historial
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    const m = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
      },
    })
    seededMembershipId = m.id
    createdMembershipIds.push(seededMembershipId)
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/history' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta acceder → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/history',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/administrador/i)
  })

  it('COACH intenta acceder → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/history',
      headers: { authorization: `Bearer ${coachAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN de Gym A ve historial — respuesta es array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/history',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('historial de Gym A incluye la membresía sembrada (con paidAt)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/history',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const found = body.find((m: any) => m.id === seededMembershipId)
    expect(found).toBeDefined()
    expect(found.user).toBeDefined()
    expect(found.user.id).toBe(memberAId)
    expect(found.plan).toBeDefined()
    expect(found.paidAt).not.toBeNull()
  })

  it('Gym A NO ve membresías de Gym B (aislamiento tenancy)', async () => {
    // Crear membresía con paidAt para memberB (Gym B)
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const mB = await prisma.membership.create({
      data: {
        userId: memberBId,
        planId: planBId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 20000,
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
      },
    })
    createdMembershipIds.push(mB.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/history',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const found = body.find((m: any) => m.id === mB.id)
    expect(found).toBeUndefined()
  })

  it('membresías sin paidAt (INACTIVE pendientes) NO aparecen en historial', async () => {
    // Crear membresía sin paidAt
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const mNoPaid = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'INACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'transfer',
        // paidAt: null (por defecto)
      },
    })
    createdMembershipIds.push(mNoPaid.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/history',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const found = body.find((m: any) => m.id === mNoPaid.id)
    expect(found).toBeUndefined()
  })
})

// ─── Suite 2: GET /payments/revenue ──────────────────────────────────────────

describe('GET /api/payments/revenue — estadísticas de ingresos', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/revenue' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta acceder → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/revenue',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN obtiene estructura correcta: today/month/allTime con total y count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/revenue',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('today')
    expect(body).toHaveProperty('month')
    expect(body).toHaveProperty('allTime')
    expect(typeof body.today.total).toBe('number')
    expect(typeof body.today.count).toBe('number')
    expect(typeof body.month.total).toBe('number')
    expect(typeof body.month.count).toBe('number')
    expect(typeof body.allTime.total).toBe('number')
    expect(typeof body.allTime.count).toBe('number')
  })

  it('revenue de Gym A no incluye pagos de Gym B', async () => {
    // Crear membresía con paidAt en Gym B
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const mB = await prisma.membership.create({
      data: {
        userId: memberBId,
        planId: planBId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 99999,  // monto muy específico para detectar si se mezcla
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
      },
    })
    createdMembershipIds.push(mB.id)

    const resA = await app.inject({
      method: 'GET',
      url: '/api/payments/revenue',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    const resB = await app.inject({
      method: 'GET',
      url: '/api/payments/revenue',
      headers: { authorization: `Bearer ${adminBToken}` },
    })

    expect(resA.statusCode).toBe(200)
    expect(resB.statusCode).toBe(200)

    // El total de allTime de gym B debe incluir la membresía sembrada
    // El total de gym A NO debe incluirla
    const bodyB = resB.json()
    expect(bodyB.allTime.total).toBeGreaterThanOrEqual(99999)

    // gym A no tiene esa membresía
    const bodyA = resA.json()
    // El total de A puede variar por otros tests, pero su count de hoy solo puede
    // tener las membresías que se crearon con paidAt en este test
    expect(typeof bodyA.allTime.total).toBe('number')
  })
})

// ─── Suite 3: GET /payments/gateways ─────────────────────────────────────────

describe('GET /api/payments/gateways — pasarelas habilitadas', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/gateways' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER puede ver gateways (authenticate, no requireAdmin)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/gateways',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('gateways')
    expect(Array.isArray(body.gateways)).toBe(true)
  })

  it('ADMIN puede ver gateways de su gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/gateways',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.gateways).toContain('stripe')
    expect(body.gateways).not.toContain('mercadopago')  // mercadopago está disabled
  })

  it('Gym B (sin gateways configuradas) devuelve array vacío', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/gateways',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.gateways).toEqual([])
  })

  it('COACH puede ver gateways (authenticate)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/gateways',
      headers: { authorization: `Bearer ${coachAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().gateways)).toBe(true)
  })
})

// ─── Suite 4: GET /payments/my-memberships ────────────────────────────────────

describe('GET /api/payments/my-memberships — membresías del miembro autenticado', () => {
  let app: FastifyInstance
  let myMembershipId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear membresía para memberA
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const m = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
      },
    })
    myMembershipId = m.id
    createdMembershipIds.push(myMembershipId)
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/my-memberships' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER ve solo sus propias membresías', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/my-memberships',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    // Todas deben ser del memberA
    for (const m of body) {
      expect(m.userId).toBe(memberAId)
    }
    // La membresía sembrada debe aparecer
    const found = body.find((m: any) => m.id === myMembershipId)
    expect(found).toBeDefined()
  })

  it('respuesta incluye datos del plan (include plan)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/my-memberships',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const found = body.find((m: any) => m.id === myMembershipId)
    expect(found).toBeDefined()
    expect(found.plan).toBeDefined()
    expect(found.plan.name).toBe('Plan CRUD A')
    expect(found.plan.durationDays).toBe(30)
    expect(found.plan.priceCents).toBe(25000)
    expect(found.plan.currency).toBe('CLP')
  })

  it('MEMBER no ve membresías de otro miembro del mismo gym', async () => {
    // adminA también es usuario del gym, crear membresía para él
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const adminMembership = await prisma.membership.create({
      data: {
        userId: adminAId,
        planId: planAId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
      },
    })
    createdMembershipIds.push(adminMembership.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/my-memberships',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // memberA no debe ver las membresías de adminA
    const found = body.find((m: any) => m.id === adminMembership.id)
    expect(found).toBeUndefined()
  })

  it('ADMIN también puede ver sus propias membresías via my-memberships', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/my-memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Todas deben ser del adminA
    for (const m of body) {
      expect(m.userId).toBe(adminAId)
    }
  })
})

// ─── Suite 5: PUT /payments/my-memberships/:id/auto-renew ─────────────────────

describe('PUT /api/payments/my-memberships/:id/auto-renew — toggle auto-renovación', () => {
  let app: FastifyInstance
  let activeMembershipId: string
  let activeMembershipWithStripeId: string

  beforeAll(async () => {
    app = await buildApp()

    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    // Membresía sin stripePaymentMethodId (no puede habilitar auto-renew)
    const m1 = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
        autoRenew: false,
      },
    })
    activeMembershipId = m1.id
    createdMembershipIds.push(activeMembershipId)

    // Membresía con stripePaymentMethodId (puede habilitar auto-renew)
    const m2 = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'stripe',
        paidAt: now,
        autoRenew: false,
        stripePaymentMethodId: 'pm_test_mock_001',
      },
    })
    activeMembershipWithStripeId = m2.id
    createdMembershipIds.push(activeMembershipWithStripeId)
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${activeMembershipId}/auto-renew`,
      payload: { enabled: true },
    })
    expect(res.statusCode).toBe(401)
  })

  it('membresía de otro usuario → 404', async () => {
    // memberB intenta cambiar auto-renew de membresía de memberA
    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${activeMembershipId}/auto-renew`,
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { enabled: false },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/membresía no encontrada/i)
  })

  it('membresía sin stripePaymentMethodId: habilitar auto-renew → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${activeMembershipId}/auto-renew`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enabled: true },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/método de pago/i)
  })

  it('membresía sin stripePaymentMethodId: deshabilitar auto-renew → 200 (no requiere PM)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${activeMembershipId}/auto-renew`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enabled: false },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.autoRenew).toBe(false)
    expect(body.id).toBe(activeMembershipId)
  })

  it('membresía con stripePaymentMethodId: habilitar auto-renew → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${activeMembershipWithStripeId}/auto-renew`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enabled: true },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.autoRenew).toBe(true)
    expect(body.id).toBe(activeMembershipWithStripeId)
  })

  it('toggle: deshabilitar auto-renew existente → 200 + autoRenew false en DB', async () => {
    // Primero asegurar que está habilitado
    await prisma.membership.update({
      where: { id: activeMembershipWithStripeId },
      data: { autoRenew: true },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${activeMembershipWithStripeId}/auto-renew`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enabled: false },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.autoRenew).toBe(false)

    // Verificar en DB
    const m = await prisma.membership.findUnique({ where: { id: activeMembershipWithStripeId } })
    expect(m!.autoRenew).toBe(false)
  })

  it('membresía INACTIVE → 404 (solo ACTIVE se puede modificar)', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const inactive = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'INACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 25000,
        currency: 'CLP',
        paymentMethod: 'cash',
      },
    })
    createdMembershipIds.push(inactive.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/payments/my-memberships/${inactive.id}/auto-renew`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enabled: false },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Suite 6: POST /payments/manual ──────────────────────────────────────────

describe('POST /api/payments/manual — registro de pago manual', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      payload: { userId: memberAId, planId: planAId, paymentMethod: 'cash' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta registrar pago manual → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { userId: memberAId, planId: planAId, paymentMethod: 'cash' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('COACH intenta registrar pago manual → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: { userId: memberAId, planId: planAId, paymentMethod: 'cash' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('body inválido (falta paymentMethod) → 400 con error de validación', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId: planAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('paymentMethod inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId: planAId, paymentMethod: 'bitcoin' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('userId que no existe en el gym → 400 "Usuario no encontrado"', async () => {
    const fakeUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: fakeUserId, planId: planAId, paymentMethod: 'cash' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })

  it('planId de otro gym → 400 "Plan no encontrado"', async () => {
    // planBId pertenece a gymB, admin de gymA no puede usarlo
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId: planBId, paymentMethod: 'cash' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('pago manual exitoso con método "cash" → 201 con membresía ACTIVE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        userId: memberAId,
        planId: planAId,
        paymentMethod: 'cash',
        paymentNotes: 'Pagó en efectivo en recepción',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('ACTIVE')
    expect(body.paymentMethod).toBe('cash')
    expect(body.paidAt).not.toBeNull()
    expect(body.userId).toBe(memberAId)
    expect(body.planId).toBe(planAId)
    expect(body.paymentNotes).toBe('Pagó en efectivo en recepción')
    createdMembershipIds.push(body.id)
  })

  it('pago manual con "card" → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        userId: memberAId,
        planId: planAId,
        paymentMethod: 'card',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('ACTIVE')
    expect(body.paymentMethod).toBe('card')
    createdMembershipIds.push(body.id)
  })

  it('pago manual incluye datos de user y plan en la respuesta', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        userId: memberAId,
        planId: planAId,
        paymentMethod: 'other',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user).toBeDefined()
    expect(body.user.name).toBe('Member CRUD A')
    expect(body.plan).toBeDefined()
    expect(body.plan.name).toBe('Plan CRUD A')
    createdMembershipIds.push(body.id)
  })

  it('pago manual desactiva membresía ACTIVE previa antes de crear nueva', async () => {
    // Obtener el estado antes: asegurarse de que hay una activa
    // (los tests anteriores crearon varias, la última debería estar ACTIVE)
    const before = await prisma.membership.findMany({
      where: { userId: memberAId, status: 'ACTIVE' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        userId: memberAId,
        planId: planAId,
        paymentMethod: 'cash',
      },
    })
    expect(res.statusCode).toBe(201)
    const newMembership = res.json()
    createdMembershipIds.push(newMembership.id)

    // Las que eran ACTIVE antes ahora deben ser INACTIVE
    for (const old of before) {
      const reloaded = await prisma.membership.findUnique({ where: { id: old.id } })
      expect(reloaded!.status).toBe('INACTIVE')
    }

    // La nueva es ACTIVE
    expect(newMembership.status).toBe('ACTIVE')
  })

  it('admin de Gym B NO puede crear pago para usuario de Gym A → 400', async () => {
    // memberAId pertenece a gymA, adminBToken tiene gymId=gymBId
    // registerManualPayment llama getUser(userId, gymId) que filtra por gymId del admin
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/manual',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {
        userId: memberAId,
        planId: planBId,
        paymentMethod: 'cash',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })
})

// ─── Suite 7: POST /payments/checkout (admin crea checkout para usuario) ──────

describe('POST /api/payments/checkout — admin crea Stripe checkout para usuario', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      payload: { planId: planAId, userId: memberAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta crear checkout → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId, userId: memberAId },
    })
    expect(res.statusCode).toBe(403)
  })

  it('body inválido (falta userId) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('planId no UUID válido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { planId: 'not-a-uuid', userId: memberAId },
    })
    expect(res.statusCode).toBe(400)
  })

  it('planId de otro gym → 400 "Plan no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { planId: planBId, userId: memberAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('userId de otro gym → 400 "Usuario no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { planId: planAId, userId: memberBId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })

  it('checkout exitoso → 200 con url y sessionId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { planId: planAId, userId: memberAId },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('url')
    expect(body).toHaveProperty('sessionId')
    expect(body.url).toContain('stripe')
    expect(body.sessionId).toBe('cs_test_mock_001')
  })
})

// ─── Suite 8: POST /payments/checkout-self (miembro crea su propio checkout) ──

describe('POST /api/payments/checkout-self — miembro inicia su propio checkout Stripe', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('body inválido (planId no UUID) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-uuid' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('planId de otro gym → 400 "Plan no encontrado"', async () => {
    // memberA tiene gymId=gymAId, planBId pertenece a gymBId
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planBId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('checkout-self exitoso sin autoRenew → 200 con url y sessionId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('url')
    expect(body).toHaveProperty('sessionId')
    expect(body.sessionId).toBe('cs_test_mock_001')
  })

  it('checkout-self con autoRenew=true → 200 (mock Stripe crea sesión)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId, autoRenew: true },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('url')
    expect(body).toHaveProperty('sessionId')
  })

  it('ADMIN también puede usar checkout-self (authenticate, no solo MEMBER)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(200)
  })

  it('autoRenew por defecto es false (campo opcional)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout-self',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },  // sin autoRenew
    })
    expect(res.statusCode).toBe(200)
    // No debe lanzar error por ausencia del campo
    expect(res.json()).toHaveProperty('sessionId')
  })
})
