/**
 * fintoc-pay.integration.test.ts
 *
 * Tests de integración para los 3 endpoints de Fintoc Pay by Bank.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/fintoc-pay  — crea payment intent, mock de fetch hacia Fintoc API
 *   2. GET  /payments/fintoc-pay/status/:paymentIntentId — consulta estado + ownership check
 *   3. POST /payments/webhook/fintoc-pay   — webhook HMAC-SHA256, idempotencia, tipos de evento
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de Fintoc.
 *   - Gym A con fintocPayments habilitado, Gym B sin pasarela.
 *   - Cleanup en afterAll ordenado por FK.
 *
 * Gotchas documentados:
 *   - handleFintocPayWebhook SIEMPRE requiere firma: si no hay header fintoc-signature → 401.
 *   - gymId viene de body.data.metadata.gymId (no de body.gymId como en el webhook Fintoc conciliación).
 *   - webhookSecret debe estar en gym.paymentGateways.fintocPayments.webhookSecret.
 *   - getFintocPayStatus filtra por userId: intent de otro user → null → 404.
 *   - createFintocPayCheckout usa (prisma as any).fintocPaymentIntent — model no tipado en Prisma client aún.
 *   - El rawBody en el webhook es el Buffer del body parseado; se calcula la firma sobre ese Buffer.
 */

import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { paymentRoutes } from '../payments.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-fintoc-pay-gym-a'
const GYM_B_SLUG = 'qa-fintoc-pay-gym-b'

const FINTOC_PAY_SECRET = 'sk_test_fintoc_pay_123'
const FINTOC_WEBHOOK_SECRET = 'whsec_fintoc_pay_test_456'

// IDs creados en setup
let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let memberBId: string
let planAId: string

// Tokens JWT
let adminAToken: string
let memberAToken: string
let memberBToken: string

// Tracking de registros para cleanup
const createdIntentIds: string[] = []         // fintocIntentId (string, no DB id)
const createdMembershipIds: string[] = []

// ─── Helper: calcular firma HMAC-SHA256 para webhook Fintoc Pay ──────────────

function signFintocPay(body: object, secret: string): string {
  const raw = JSON.stringify(body)
  return crypto.createHmac('sha256', secret).update(raw).digest('hex')
}

// ─── Helper: construir app Fastify ───────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET })

  // rawBody support — mismo patrón que en producción y otros tests
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

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) {
      // Orden FK: FintocPaymentIntent → Membership → User → Plan → Gym
      await (prisma as any).fintocPaymentIntent.deleteMany({ where: { gymId: existing.id } })
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existing.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym A — con fintocPayments habilitado
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA Fintoc Pay Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        fintocPayments: {
          enabled: true,
          secretKey: FINTOC_PAY_SECRET,
          webhookSecret: FINTOC_WEBHOOK_SECRET,
          currency: 'CLP',
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela fintocPayments
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA Fintoc Pay Gym B',
      slug: GYM_B_SLUG,
      status: 'ACTIVE',
      paymentGateways: {},
    },
  })
  gymBId = gymB.id

  // Admin A
  const adminA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Admin FintocPay A',
      email: 'qa-fintocpay-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member FintocPay A',
      email: 'qa-fintocpay-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member FintocPay B',
      email: 'qa-fintocpay-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan FintocPay Test',
      priceCents: 30000,
      currency: 'CLP',
      durationDays: 30,
      isActive: true,
    },
  })
  planAId = planA.id

  // Tokens JWT
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({
    userId: adminAId, gymId: gymAId,
    email: 'qa-fintocpay-admin-a@test.local', role: 'ADMIN', name: 'Admin FintocPay A',
  })
  memberAToken = tempApp.jwt.sign({
    userId: memberAId, gymId: gymAId,
    email: 'qa-fintocpay-member-a@test.local', role: 'MEMBER', name: 'Member FintocPay A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-fintocpay-member-b@test.local', role: 'MEMBER', name: 'Member FintocPay B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdIntentIds.length) {
    await (prisma as any).fintocPaymentIntent.deleteMany({
      where: { fintocIntentId: { in: createdIntentIds } },
    })
  }
  await (prisma as any).fintocPaymentIntent.deleteMany({
    where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } },
  })
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  await prisma.membership.deleteMany({
    where: { userId: { in: [adminAId, memberAId, memberBId].filter(Boolean) } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [adminAId, memberAId, memberBId].filter(Boolean) } },
  })
  await prisma.plan.deleteMany({ where: { id: planAId } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Suite 1: POST /payments/checkout/fintoc-pay ─────────────────────────────

describe('Fintoc Pay: POST /api/payments/checkout/fintoc-pay', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  // Mock fetch para cada test de éxito
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: `fi_test_${Date.now()}`,
        widget_url: 'https://widget.fintoc.com/test-session',
      }),
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('planId faltante → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('gym sin fintocPayments habilitado → 400', async () => {
    // Member B pertenece a Gym B que NO tiene fintocPayments
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    // El plan pertenece a gymA, no gymB → "Plan no encontrado" o "Pasarela no configurada"
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('plan que no existe en el gym → 400', async () => {
    // UUID válido pero que no existe en DB
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  it('Fintoc API responde 500 → el endpoint devuelve 400', async () => {
    vi.restoreAllMocks()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      text: async () => 'Internal Server Error',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/fintoc pay error/i)
  })

  it('exito: plan valido, gym con fintocPayments habilitado → 200 con widgetUrl y paymentIntentId + FintocPaymentIntent en DB', async () => {
    const fakeIntentId = `fi_test_ok_${Date.now()}`

    // Reemplazar el mock para este test con un ID predecible
    vi.restoreAllMocks()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: fakeIntentId,
        widget_url: 'https://widget.fintoc.com/ok-session',
      }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/fintoc-pay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.widgetUrl).toBe('https://widget.fintoc.com/ok-session')
    expect(body.paymentIntentId).toBe(fakeIntentId)

    // Verificar que se creó el intent en DB con status PENDING
    const intent = await (prisma as any).fintocPaymentIntent.findUnique({
      where: { fintocIntentId: fakeIntentId },
    })
    expect(intent).not.toBeNull()
    expect(intent.status).toBe('PENDING')
    expect(intent.gymId).toBe(gymAId)
    expect(intent.userId).toBe(memberAId)
    expect(intent.planId).toBe(planAId)
    expect(intent.amountCents).toBe(30000)
    expect(intent.widgetUrl).toBe('https://widget.fintoc.com/ok-session')

    createdIntentIds.push(fakeIntentId)
  })
})

// ─── Suite 2: GET /payments/fintoc-pay/status/:paymentIntentId ───────────────

describe('Fintoc Pay: GET /api/payments/fintoc-pay/status/:paymentIntentId', () => {
  let app: FastifyInstance
  let intentIdPending: string
  let intentIdSucceeded: string
  let succeededMembershipId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear intent PENDING para memberA
    intentIdPending = `fi_status_pending_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId,
        userId: memberAId,
        planId: planAId,
        fintocIntentId: intentIdPending,
        widgetUrl: 'https://widget.fintoc.com/pending',
        status: 'PENDING',
        amountCents: 30000,
      },
    })
    createdIntentIds.push(intentIdPending)

    // Crear una membresía y un intent SUCCEEDED
    const startsAt = new Date()
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() + 30)
    const membership = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId: planAId,
        status: 'ACTIVE',
        startsAt,
        endsAt,
        pricePaid: 30000,
        currency: 'CLP',
        paymentMethod: 'fintoc_pay',
        paidAt: new Date(),
      },
    })
    succeededMembershipId = membership.id
    createdMembershipIds.push(succeededMembershipId)

    intentIdSucceeded = `fi_status_succeeded_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId,
        userId: memberAId,
        planId: planAId,
        fintocIntentId: intentIdSucceeded,
        widgetUrl: 'https://widget.fintoc.com/succeeded',
        status: 'SUCCEEDED',
        amountCents: 30000,
        membershipId: succeededMembershipId,
      },
    })
    createdIntentIds.push(intentIdSucceeded)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/fintoc-pay/status/${intentIdPending}`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('intent en DB con status PENDING, mismo userId → 200 { status: PENDING, membershipId: null }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/fintoc-pay/status/${intentIdPending}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('PENDING')
    expect(body.membershipId).toBeNull()
  })

  it('intent SUCCEEDED con membershipId → 200 con ambos campos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/fintoc-pay/status/${intentIdSucceeded}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('SUCCEEDED')
    expect(body.membershipId).toBe(succeededMembershipId)
  })

  it('intent de otro usuario (cross-user) → 404', async () => {
    // memberB intenta ver el intent de memberA
    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/fintoc-pay/status/${intentIdPending}`,
      headers: { authorization: `Bearer ${memberBToken}` },
    })

    // getFintocPayStatus filtra por userId, devuelve null → 404
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/payment intent no encontrado/i)
  })

  it('intent inexistente → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc-pay/status/fi_does_not_exist_xyz',
      headers: { authorization: `Bearer ${memberAToken}` },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/payment intent no encontrado/i)
  })
})

// ─── Suite 3: POST /payments/webhook/fintoc-pay ───────────────────────────────

describe('Fintoc Pay: POST /api/payments/webhook/fintoc-pay — HMAC, idempotencia, tipos de evento', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  // Helper: construir body de webhook payment_intent.succeeded
  function makeSucceededBody(fintocIntentId: string) {
    return {
      type: 'payment_intent.succeeded',
      data: {
        id: fintocIntentId,
        metadata: {
          gymId: gymAId,
          planId: planAId,
          userId: memberAId,
        },
      },
    }
  }

  // Helper: construir body de webhook payment_intent.failed
  function makeFailedBody(fintocIntentId: string) {
    return {
      type: 'payment_intent.failed',
      data: {
        id: fintocIntentId,
        metadata: {
          gymId: gymAId,
          planId: planAId,
          userId: memberAId,
        },
      },
    }
  }

  it('sin header fintoc-signature → 401 (firma siempre requerida)', async () => {
    const intentId = `fi_wh_nosig_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId, userId: memberAId, planId: planAId,
        fintocIntentId: intentId,
        widgetUrl: 'https://widget.fintoc.com/nosig',
        status: 'PENDING', amountCents: 30000,
      },
    })
    createdIntentIds.push(intentId)

    const body = makeSucceededBody(intentId)
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc-pay',
      payload: body,
      // Sin header fintoc-signature
    })

    expect(res.statusCode).toBe(401)
  })

  it('firma HMAC inválida → 401', async () => {
    const intentId = `fi_wh_badsig_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId, userId: memberAId, planId: planAId,
        fintocIntentId: intentId,
        widgetUrl: 'https://widget.fintoc.com/badsig',
        status: 'PENDING', amountCents: 30000,
      },
    })
    createdIntentIds.push(intentId)

    const body = makeSucceededBody(intentId)
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc-pay',
      headers: {
        'fintoc-signature': 'firma_incorrecta_xyz_que_no_coincide',
      },
      payload: body,
    })

    expect(res.statusCode).toBe(401)
  })

  it('payment_intent.succeeded — exito: firma valida, intent PENDING → membresía activa, intent SUCCEEDED → { received: true }', async () => {
    const intentId = `fi_wh_ok_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId, userId: memberAId, planId: planAId,
        fintocIntentId: intentId,
        widgetUrl: 'https://widget.fintoc.com/ok',
        status: 'PENDING', amountCents: 30000,
      },
    })
    createdIntentIds.push(intentId)

    const body = makeSucceededBody(intentId)
    const bodyStr = JSON.stringify(body)
    const sig = signFintocPay(body, FINTOC_WEBHOOK_SECRET)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc-pay',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': sig,
      },
      payload: bodyStr,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ received: true })

    // Verificar intent en DB → SUCCEEDED
    const intent = await (prisma as any).fintocPaymentIntent.findUnique({
      where: { fintocIntentId: intentId },
    })
    expect(intent.status).toBe('SUCCEEDED')
    expect(intent.membershipId).not.toBeNull()

    // Verificar que se creó la membresía ACTIVE
    const membership = await prisma.membership.findUnique({ where: { id: intent.membershipId } })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('fintoc_pay')
    expect(membership!.paymentNotes).toBe(`fintoc_pay:${intentId}`)
    createdMembershipIds.push(membership!.id)
  })

  it('idempotencia: mismo webhook dos veces → solo una membresía, segunda llamada devuelve { received: true } sin error', async () => {
    const intentId = `fi_wh_idem_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId, userId: memberAId, planId: planAId,
        fintocIntentId: intentId,
        widgetUrl: 'https://widget.fintoc.com/idem',
        status: 'PENDING', amountCents: 30000,
      },
    })
    createdIntentIds.push(intentId)

    const body = makeSucceededBody(intentId)
    const bodyStr = JSON.stringify(body)
    const sig = signFintocPay(body, FINTOC_WEBHOOK_SECRET)

    const injectOptions = {
      method: 'POST' as const,
      url: '/api/payments/webhook/fintoc-pay',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': sig,
      },
      payload: bodyStr,
    }

    // Primera llamada
    const res1 = await app.inject(injectOptions)
    expect(res1.statusCode).toBe(200)
    expect(res1.json()).toMatchObject({ received: true })

    // Segunda llamada — idempotencia
    const res2 = await app.inject(injectOptions)
    expect(res2.statusCode).toBe(200)
    expect(res2.json()).toMatchObject({ received: true })

    // Verificar que solo existe una membresía con este paymentNotes
    const count = await prisma.membership.count({
      where: { paymentNotes: `fintoc_pay:${intentId}` },
    })
    expect(count).toBe(1)

    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: `fintoc_pay:${intentId}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  it('payment_intent.failed: firma valida → intent pasa a FAILED, no se crea membresía', async () => {
    const intentId = `fi_wh_failed_${Date.now()}`
    await (prisma as any).fintocPaymentIntent.create({
      data: {
        gymId: gymAId, userId: memberAId, planId: planAId,
        fintocIntentId: intentId,
        widgetUrl: 'https://widget.fintoc.com/failed',
        status: 'PENDING', amountCents: 30000,
      },
    })
    createdIntentIds.push(intentId)

    const body = makeFailedBody(intentId)
    const bodyStr = JSON.stringify(body)
    const sig = signFintocPay(body, FINTOC_WEBHOOK_SECRET)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc-pay',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': sig,
      },
      payload: bodyStr,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ received: true })

    // Verificar intent en DB → FAILED
    const intent = await (prisma as any).fintocPaymentIntent.findUnique({
      where: { fintocIntentId: intentId },
    })
    expect(intent.status).toBe('FAILED')
    expect(intent.membershipId).toBeNull()

    // No se debe haber creado membresía para este intent
    const membershipCount = await prisma.membership.count({
      where: { paymentNotes: `fintoc_pay:${intentId}` },
    })
    expect(membershipCount).toBe(0)
  })

  it('gymId inexistente en metadata → 400', async () => {
    const body = {
      type: 'payment_intent.succeeded',
      data: {
        id: `fi_wh_nogym_${Date.now()}`,
        metadata: {
          gymId: '00000000-0000-0000-0000-000000000000',
          planId: planAId,
          userId: memberAId,
        },
      },
    }
    // No podemos calcular la firma real porque no hay secret para ese gym
    // Pero el handler va a lanzar "Gimnasio no encontrado" o "webhookSecret no configurado"
    // antes de validar la firma (o la firma fallará con el secret del gym real)
    // Usamos una firma cualquiera — el resultado será 400 o 401 en ambos casos
    const bodyStr = JSON.stringify(body)
    const sig = signFintocPay(body, 'cualquier-secret')

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc-pay',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': sig,
      },
      payload: bodyStr,
    })

    // Esperamos error (400 o 401) — no 200
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('body sin gymId en metadata → 400', async () => {
    const body = {
      type: 'payment_intent.succeeded',
      data: {
        id: `fi_wh_nometa_${Date.now()}`,
        // metadata sin gymId
        metadata: {},
      },
    }
    const bodyStr = JSON.stringify(body)
    const sig = signFintocPay(body, FINTOC_WEBHOOK_SECRET)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc-pay',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': sig,
      },
      payload: bodyStr,
    })

    // handleFintocPayWebhook lanza "gymId no encontrado en metadata del webhook" → 400
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/gymId/i)
  })
})
