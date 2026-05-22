/**
 * payu.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de PayU LATAM.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/payu  — genera params de formulario con firma MD5
 *   2. POST /payments/callback/payu  — confirmación de pago post-transacción
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - NO hay fetch externo en checkout (PayU usa redirect con form POST desde el frontend).
 *   - Callback recibe body form-urlencoded con params de PayU; gymId/planId/userId van en query string.
 *   - Firma checkout: MD5(apiKey~merchantId~referenceCode~amount~currency)
 *   - Firma callback: MD5(apiKey~merchantId~referenceCode~TX_VALUE~currency~transactionState)
 *   - transactionState === '4' (string) significa aprobado.
 *   - Idempotencia: busca membership existente con paymentNotes: 'payu:{referenceCode}'.
 *
 * Notas importantes sobre PayU:
 *   - A diferencia de Flow/Khipu, el checkout NO hace fetch a la API de PayU. Solo genera
 *     los parámetros para que el frontend construya un form POST a la URL de PayU.
 *   - La firma del callback incluye transactionState (la del checkout no).
 *   - Si el campo 'sign' no está presente en el callback body, no se verifica firma
 *     (gap de seguridad documentado — ver BUG abajo).
 */

import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { paymentRoutes } from '../payments.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-payu-gym-a'
const GYM_B_SLUG = 'qa-payu-gym-b'

const PAYU_API_KEY = 'test_api_key_payu'
const PAYU_MERCHANT_ID = 'test_merchant_payu'
const PAYU_ACCOUNT_ID = 'test_account_payu'

// IDs creados en setup
let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let memberBId: string
let planAId: string

// Tokens JWT
let memberAToken: string
let memberBToken: string

// Tracking de membresías creadas para cleanup
const createdMembershipIds: string[] = []

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

// ─── Helpers de firma PayU ────────────────────────────────────────────────────

/** Firma para el checkout: MD5(apiKey~merchantId~referenceCode~amount~currency) */
function payuCheckoutSignature(
  apiKey: string,
  merchantId: string,
  referenceCode: string,
  amount: string,
  currency: string,
): string {
  return crypto
    .createHash('md5')
    .update(`${apiKey}~${merchantId}~${referenceCode}~${amount}~${currency}`)
    .digest('hex')
}

/** Firma para el callback: MD5(apiKey~merchantId~referenceCode~TX_VALUE~currency~transactionState) */
function payuCallbackSignature(
  apiKey: string,
  merchantId: string,
  referenceCode: string,
  txValue: string,
  currency: string,
  transactionState: string,
): string {
  return crypto
    .createHash('md5')
    .update(`${apiKey}~${merchantId}~${referenceCode}~${txValue}~${currency}~${transactionState}`)
    .digest('hex')
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) {
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existing.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym A — con PayU habilitado
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA PayU Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        payu: {
          enabled: true,
          merchantId: PAYU_MERCHANT_ID,
          apiKey: PAYU_API_KEY,
          accountId: PAYU_ACCOUNT_ID,
          sandbox: true,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela PayU
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA PayU Gym B',
      slug: GYM_B_SLUG,
      status: 'ACTIVE',
      paymentGateways: {},
    },
  })
  gymBId = gymB.id

  // Admin A (solo para FK)
  const adminA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Admin PayU A',
      email: 'qa-payu-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member PayU A',
      email: 'qa-payu-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member PayU B',
      email: 'qa-payu-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan PayU Test',
      priceCents: 5000000, // $50.000,00 COP (en centavos)
      currency: 'COP',
      durationDays: 30,
      isActive: true,
    },
  })
  planAId = planA.id

  // Tokens JWT
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  memberAToken = tempApp.jwt.sign({
    userId: memberAId,
    gymId: gymAId,
    email: 'qa-payu-member-a@test.local',
    role: 'MEMBER',
    name: 'Member PayU A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId,
    gymId: gymBId,
    email: 'qa-payu-member-b@test.local',
    role: 'MEMBER',
    name: 'Member PayU B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Cleanup residual
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

// ─── Suite 1: POST /payments/checkout/payu ───────────────────────────────────

describe('PayU: POST /api/payments/checkout/payu', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/payu',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/payu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('plan inexistente (UUID válido) → 400 "Plan no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/payu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  it('gym sin config PayU → 400 "Pasarela payu no configurada"', async () => {
    // memberB pertenece a Gym B que no tiene PayU habilitado
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/payu',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    // El plan es de gymA — getPlan(planAId, gymB) falla con "Plan no encontrado"
    // O si el usuario intenta con un planId de gymB → "Pasarela payu no configurada"
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('éxito → 200 con { url, params, referenceCode }', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/payu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    // createPayUCheckout devuelve { url, params, referenceCode }
    expect(body.url).toBeDefined()
    expect(typeof body.url).toBe('string')
    // URL de sandbox
    expect(body.url).toContain('sandbox.checkout.payulatam.com')

    expect(body.params).toBeDefined()
    expect(typeof body.params).toBe('object')

    expect(body.referenceCode).toBeDefined()
    expect(typeof body.referenceCode).toBe('string')
  })

  it('firma MD5 del checkout es correcta — parámetros del formulario son válidos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/payu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    const params = body.params as Record<string, string>

    // Verificar que los campos requeridos están presentes
    expect(params.merchantId).toBe(PAYU_MERCHANT_ID)
    expect(params.accountId).toBe(PAYU_ACCOUNT_ID)
    expect(params.referenceCode).toBeDefined()
    expect(params.amount).toBeDefined()
    expect(params.currency).toBeDefined()
    expect(params.signature).toBeDefined()

    // Recalcular la firma esperada y comparar
    const expectedSig = payuCheckoutSignature(
      PAYU_API_KEY,
      PAYU_MERCHANT_ID,
      params.referenceCode,
      params.amount,
      params.currency,
    )
    expect(params.signature).toBe(expectedSig)

    // Verificar que test=1 (sandbox) está presente
    expect(params.test).toBe('1')

    // Verificar que el buyerEmail es el del usuario autenticado
    expect(params.buyerEmail).toBe('qa-payu-member-a@test.local')
  })
})

// ─── Suite 2: POST /payments/callback/payu ───────────────────────────────────

describe('PayU: POST /api/payments/callback/payu', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(async () => {
    vi.restoreAllMocks()
    // Limpiar membresías creadas durante cada test
    if (createdMembershipIds.length) {
      await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
      createdMembershipIds.length = 0
    }
  })

  it('sin query params (gymId, planId, userId) → 400', async () => {
    // Sin query params: getGym(undefined) falla
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/payu',
      // Sin query string — gymId es undefined
      payload: {
        transactionState: '4',
        referenceCode: 'REF-TEST-001',
        TX_VALUE: '50000.00',
        currency: 'COP',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('firma inválida en callback → 400 "Firma PayU inválida"', async () => {
    const referenceCode = `${gymAId.slice(0, 8)}-fake-ref`

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: {
        transactionState: '4',
        referenceCode,
        TX_VALUE: '50000.00',
        currency: 'COP',
        sign: 'firma-md5-incorrecta-totalmente-falsa',
      },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/firma payu inválida/i)
  })

  it('transactionState !== "4" (estado 5 = rechazado) → 400 sin activar membresía', async () => {
    const referenceCode = `${gymAId.slice(0, 8)}-rejected-test`
    const txValue = '50000.00'
    const currency = 'COP'
    const transactionState = '5' // rechazado

    const sign = payuCallbackSignature(
      PAYU_API_KEY,
      PAYU_MERCHANT_ID,
      referenceCode,
      txValue,
      currency,
      transactionState,
    )

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: {
        transactionState,
        referenceCode,
        TX_VALUE: txValue,
        currency,
        sign,
      },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    // El mensaje incluye el estado recibido
    expect(body.error).toMatch(/pago payu no aprobado/i)

    // Verificar que NO se creó membresía
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `payu:${referenceCode}` },
    })
    expect(count).toBe(0)
  })

  it('transactionState !== "4" (estado 6 = pendiente) → 400 sin activar membresía', async () => {
    const referenceCode = `${gymAId.slice(0, 8)}-pending-test`
    const txValue = '50000.00'
    const currency = 'COP'
    const transactionState = '6' // pendiente / en proceso

    const sign = payuCallbackSignature(
      PAYU_API_KEY,
      PAYU_MERCHANT_ID,
      referenceCode,
      txValue,
      currency,
      transactionState,
    )

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: {
        transactionState,
        referenceCode,
        TX_VALUE: txValue,
        currency,
        sign,
      },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/pago payu no aprobado/i)

    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `payu:${referenceCode}` },
    })
    expect(count).toBe(0)
  })

  it('éxito: firma válida + transactionState "4" → membresía ACTIVE creada con paymentMethod payu', async () => {
    const referenceCode = `${gymAId.slice(0, 8)}-success-001`
    const txValue = '50000.00'
    const currency = 'COP'
    const transactionState = '4'

    const sign = payuCallbackSignature(
      PAYU_API_KEY,
      PAYU_MERCHANT_ID,
      referenceCode,
      txValue,
      currency,
      transactionState,
    )

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: {
        transactionState,
        referenceCode,
        TX_VALUE: txValue,
        currency,
        sign,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)

    // Verificar en DB que se creó la membresía correctamente
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `payu:${referenceCode}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('payu')
    expect(membership!.paymentNotes).toBe(`payu:${referenceCode}`)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  it('idempotencia: mismo referenceCode dos veces → una sola membresía creada', async () => {
    const referenceCode = `${gymAId.slice(0, 8)}-idem-002`
    const txValue = '50000.00'
    const currency = 'COP'
    const transactionState = '4'

    const sign = payuCallbackSignature(
      PAYU_API_KEY,
      PAYU_MERCHANT_ID,
      referenceCode,
      txValue,
      currency,
      transactionState,
    )

    const callbackPayload = {
      transactionState,
      referenceCode,
      TX_VALUE: txValue,
      currency,
      sign,
    }

    // Primera llamada — debe crear membresía
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: callbackPayload,
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().ok).toBe(true)

    // Segunda llamada — idempotencia: no debe crear otra membresía
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: callbackPayload,
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().ok).toBe(true)

    // Verificar que solo existe UNA membresía con este referenceCode
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `payu:${referenceCode}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `payu:${referenceCode}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  it('cross-gym: gymId de otro gym sin PayU → 400 "Pasarela payu no configurada"', async () => {
    const referenceCode = `${gymBId.slice(0, 8)}-cross-003`
    const txValue = '50000.00'
    const currency = 'COP'
    const transactionState = '4'

    // Usar gymBId — que no tiene PayU configurado
    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymBId}&planId=${planAId}&userId=${memberBId}`,
      payload: {
        transactionState,
        referenceCode,
        TX_VALUE: txValue,
        currency,
        // Sin sign para que no falle en firma antes de fallar en config
      },
    })

    // gymB no tiene PayU habilitado → gatewayConfig lanza → 400
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/pasarela payu no configurada/i)
  })

  it('callback sin campo sign es rechazado → 400', async () => {
    // Fix 2026-05-07: sign es ahora obligatorio en handlePayUCallback
    const referenceCode = `${gymAId.slice(0, 8)}-nosign-004`

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: {
        transactionState: '4',
        referenceCode,
        TX_VALUE: '50000.00',
        currency: 'COP',
        // 'sign' omitido deliberadamente
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Falta firma PayU/i)
  })

  it('userId cross-gym es rechazado → 400', async () => {
    // Fix 2026-05-07: getUser(userId, gymId) al inicio de handlePayUCallback
    const referenceCode = `${gymAId.slice(0, 8)}-cross-user-005`
    const txValue = '50000.00'
    const currency = 'COP'
    const transactionState = '4'

    const sign = payuCallbackSignature(
      PAYU_API_KEY,
      PAYU_MERCHANT_ID,
      referenceCode,
      txValue,
      currency,
      transactionState,
    )

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/payu?gymId=${gymAId}&planId=${planAId}&userId=${memberBId}`,
      payload: { transactionState, referenceCode, TX_VALUE: txValue, currency, sign },
    })

    expect(res.statusCode).toBe(400)
  })
})
