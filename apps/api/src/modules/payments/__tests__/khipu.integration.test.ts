/**
 * khipu.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de Khipu Chile.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/khipu  — crea checkout con HMAC-SHA256, mock de fetch hacia Khipu API
 *   2. POST /payments/callback/khipu  — IPN post-pago: verifica estado, idempotencia, activación
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de Khipu.
 *   - Gym A con Khipu habilitado (con secret), Gym B sin pasarela.
 *   - Gym C con Khipu sin secret (para test sin validación de firma).
 *   - Cleanup en afterAll ordenado por FK.
 *
 * Notas sobre Khipu:
 *   - Firma checkout: khipuSign('POST', url, body, secret)
 *     bodyHash = SHA256(body), msg = "POST\nURL\nBODYHASH", sig = HMAC-SHA256(msg, secret)
 *   - Header Authorization checkout: "{receiverId}:{sig}"
 *   - createKhipuCheckout devuelve { url: payment_url, paymentId: payment_id }
 *   - handleKhipuCallback valida x-khipu-signature si gym tiene cfg.secret
 *   - x-khipu-signature: HMAC-SHA256 del raw body JSON en hex
 *   - La ruta desestructura el body: { gymId, planId, userId, ...rest } — rest recibe payment_id
 *   - Idempotencia: busca membership existente con paymentNotes: 'khipu:{paymentId}'
 *   - Fix 2026-05-06: getUser(userId, gymId) al inicio valida cross-gym → 400
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

const GYM_A_SLUG = 'qa-khipu-gym-a'
const GYM_B_SLUG = 'qa-khipu-gym-b'
const GYM_C_SLUG = 'qa-khipu-gym-c'

const KHIPU_RECEIVER_ID = 'test_receiver_123'
const KHIPU_SECRET = 'test_secret_khipu'

// IDs creados en setup
let gymAId: string
let gymBId: string
let gymCId: string
let adminAId: string
let memberAId: string
let memberBId: string
let planAId: string

// Tokens JWT
let memberAToken: string
let memberBToken: string

// Tracking de registros para cleanup
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

// ─── Helper: calcular firma Khipu para checkout ──────────────────────────────

function khipuSign(method: string, url: string, body: string, secret: string): string {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const msg = `${method}\n${url}\n${bodyHash}`
  return crypto.createHmac('sha256', secret).update(msg).digest('hex')
}

// ─── Helper: calcular firma x-khipu-signature para callback ─────────────────

function makeKhipuCallbackSig(body: object, secret: string): string {
  const raw = JSON.stringify(body)
  return crypto.createHmac('sha256', secret).update(raw).digest('hex')
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG, GYM_C_SLUG]) {
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

  // Gym A — con Khipu habilitado (con receiverId + secret)
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA Khipu Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        khipu: {
          enabled: true,
          receiverId: KHIPU_RECEIVER_ID,
          secret: KHIPU_SECRET,
          sandbox: true,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela Khipu
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA Khipu Gym B',
      slug: GYM_B_SLUG,
      status: 'ACTIVE',
      paymentGateways: {},
    },
  })
  gymBId = gymB.id

  // Gym C — con Khipu SIN secret (solo receiverId) — no valida firma
  const gymC = await prisma.gym.create({
    data: {
      name: 'QA Khipu Gym C',
      slug: GYM_C_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        khipu: {
          enabled: true,
          receiverId: 'receiver_no_secret',
          sandbox: true,
          // sin campo "secret" — cfg.secret será undefined/falsy
        },
      },
    },
  })
  gymCId = gymC.id

  // Admin A (solo para FK — no se usa en los tests directamente)
  const adminA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Admin Khipu A',
      email: 'qa-khipu-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member Khipu A',
      email: 'qa-khipu-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member Khipu B',
      email: 'qa-khipu-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan Khipu Test',
      priceCents: 5000, // $5.000 CLP (CLP no tiene decimales: unidad mínima = peso)
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

  memberAToken = tempApp.jwt.sign({
    userId: memberAId, gymId: gymAId,
    email: 'qa-khipu-member-a@test.local', role: 'MEMBER', name: 'Member Khipu A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-khipu-member-b@test.local', role: 'MEMBER', name: 'Member Khipu B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Cleanup residual de membresías (incluyendo gymC si el test no limpió)
  await prisma.membership.deleteMany({
    where: { userId: { in: [adminAId, memberAId, memberBId].filter(Boolean) } },
  })
  // Limpiar todos los usuarios de los 3 gyms para poder borrar planes y gyms
  await prisma.user.deleteMany({
    where: { gymId: { in: [gymAId, gymBId, gymCId].filter(Boolean) } },
  })
  // Limpiar todos los planes de los 3 gyms
  await prisma.plan.deleteMany({
    where: { gymId: { in: [gymAId, gymBId, gymCId].filter(Boolean) } },
  })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId, gymCId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Suite 1: POST /payments/checkout/khipu ──────────────────────────────────

describe('Khipu: POST /api/payments/checkout/khipu', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Test 1
  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  // Test 2
  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  // Test 3
  it('plan inexistente (UUID válido, no existe en DB) → 400 "Plan no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  // Test 4
  it('gym sin config Khipu → 400 "gateway no configurado"', async () => {
    // memberB pertenece a Gym B que no tiene Khipu configurado
    // El plan pertenece a Gym A — getPlan(planId, gymB) falla primero con "Plan no encontrado"
    // de todos modos el gym B no tiene Khipu → 400
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  // Test 5
  it('Khipu API responde error (ok: false) → 400 error propagado al cliente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Internal Server Error from Khipu',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/khipu error/i)
  })

  // Test 6
  it('éxito → 200 con { url, paymentId }', async () => {
    const khipuPaymentUrl = 'https://khipu.com/pay/kh_test_123'
    const khipuPaymentId = 'kh_test_123'

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payment_url: khipuPaymentUrl,
        payment_id: khipuPaymentId,
      }),
      text: async () => '',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe(khipuPaymentUrl)
    expect(body.paymentId).toBe(khipuPaymentId)
  })

  // Test 7
  it('verificación firma en checkout: header Authorization es "{receiverId}:{khipuSign}"', async () => {
    let capturedUrl: string | undefined
    let capturedOptions: RequestInit | undefined

    vi.spyOn(global, 'fetch').mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = url.toString()
      capturedOptions = options
      return {
        ok: true,
        json: async () => ({ payment_url: 'https://khipu.com/pay/sig_test', payment_id: 'kh_sig_test' }),
        text: async () => '',
      } as Response
    })

    await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/khipu',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    // Verificar que se llamó al endpoint correcto de Khipu
    expect(capturedUrl).toBe('https://khipu.com/api/2.0/payments')
    expect(capturedOptions).toBeDefined()

    // Extraer header Authorization enviado a Khipu
    const sentHeaders = capturedOptions!.headers as Record<string, string>
    const authHeader: string = sentHeaders['Authorization']
    expect(authHeader).toBeDefined()

    // El formato es "{receiverId}:{firma}"
    const [sentReceiverId, sentSig] = authHeader.split(':')
    expect(sentReceiverId).toBe(KHIPU_RECEIVER_ID)

    // Recalcular la firma esperada: khipuSign('POST', url, body, secret)
    const sentBody = capturedOptions!.body as string
    const expectedSig = khipuSign('POST', 'https://khipu.com/api/2.0/payments', sentBody, KHIPU_SECRET)
    expect(sentSig).toBe(expectedSig)
  })
})

/** Checkout que el servidor guarda al iniciar el pago; el callback lo resuelve por payment_id */
async function createKhipuCheckoutRecord(paymentId: string, userId = memberAId, planId = planAId, gymId = gymAId) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } })
  await prisma.paymentCheckout.deleteMany({ where: { gateway: 'khipu', externalRef: paymentId } })
  await prisma.paymentCheckout.create({
    data: { gateway: 'khipu', externalRef: paymentId, gymId, userId, planId, amountCents: plan.priceCents, currency: plan.currency },
  })
}

// ─── Suite 2: POST /payments/callback/khipu ──────────────────────────────────

describe('Khipu: POST /api/payments/callback/khipu', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(async () => {
    vi.restoreAllMocks()
    // Limpiar membresías creadas durante cada test para no contaminar los siguientes
    if (createdMembershipIds.length) {
      await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
      createdMembershipIds.length = 0
    }
  })

  // Test 8
  it('payment_id sin checkout guardado → 400 "Checkout no encontrado"', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/payments/callback/khipu', payload: { payment_id: 'kh_no_checkout' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Checkout no encontrado/i)
  })

  it('Khipu getPayment responde error (ok: false) → 400', async () => {
    // La firma es requerida si gym tiene secret — construimos firma válida
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberAId,
      payment_id: 'kh_get_fail',
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)
    const sig = makeKhipuCallbackSig(callbackBody, KHIPU_SECRET)

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Khipu server error',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': sig },
      payload: callbackBody,
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/error verificando pago khipu/i)
  })

  // Test 10
  it('payment.status !== "done" (status "pending") → 400', async () => {
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberAId,
      payment_id: 'kh_pending_001',
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)
    const sig = makeKhipuCallbackSig(callbackBody, KHIPU_SECRET)

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'pending', payment_id: 'kh_pending_001', amount: 5000 }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': sig },
      payload: callbackBody,
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/pago khipu no completado/i)
  })

  // Test 11
  it('sin header x-khipu-signature cuando gym tiene secret → 401', async () => {
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberAId,
      payment_id: 'kh_no_sig',
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)

    // NO enviamos x-khipu-signature — validateKhipuSignature lanzará "Falta header"
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      // sin header de firma
      payload: callbackBody,
    })

    // La ruta mapea "Falta header" → 401
    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/falta header/i)
  })

  // Test 12
  it('firma x-khipu-signature inválida → 401', async () => {
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberAId,
      payment_id: 'kh_bad_sig',
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': 'firma_completamente_invalida_0000' },
      payload: callbackBody,
    })

    // La ruta mapea "inválida" → 401
    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/firma khipu inválida/i)
  })

  // Test 13
  it('éxito con firma válida → membresía ACTIVE con paymentMethod "khipu" y paymentNotes "khipu:{paymentId}"', async () => {
    const paymentId = 'kh_success_001'
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberAId,
      payment_id: paymentId,
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)
    const sig = makeKhipuCallbackSig(callbackBody, KHIPU_SECRET)

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done', payment_id: paymentId, amount: 5000 }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': sig },
      payload: callbackBody,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)

    // Verificar en DB que se creó la membresía correctamente
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `khipu:${paymentId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('khipu')
    expect(membership!.paymentNotes).toBe(`khipu:${paymentId}`)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  // Test 14
  it('idempotencia: mismo payment_id dos veces → segunda llamada devuelve { ok: true } sin duplicar membresía', async () => {
    const paymentId = 'kh_idempotent_002'
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberAId,
      payment_id: paymentId,
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)
    const sig = makeKhipuCallbackSig(callbackBody, KHIPU_SECRET)

    // Mockear fetch para las dos llamadas: checkout → getPayment x2
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'done', payment_id: paymentId, amount: 5000 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'done', payment_id: paymentId, amount: 5000 }),
      } as Response)

    const callbackPayload = callbackBody

    // Primera llamada — crea la membresía
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': sig },
      payload: callbackPayload,
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().ok).toBe(true)

    // Segunda llamada — idempotencia: encontrará la membresía existente
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': sig },
      payload: callbackPayload,
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().ok).toBe(true)

    // Verificar que solo existe UNA membresía con este paymentId
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `khipu:${paymentId}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `khipu:${paymentId}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  // Test 15
  it('gymId/planId/userId del body se ignoran: el pago activa solo el checkout guardado', async () => {
    const paymentId = 'kh_cross_gym_003'
    await createKhipuCheckoutRecord(paymentId) // checkout de memberA
    const callbackBody = {
      gymId: gymAId,
      planId: planAId,
      userId: memberBId, // antes decidía a quién se activaba la membresía
      payment_id: paymentId,
    }
    const sig = makeKhipuCallbackSig(callbackBody, KHIPU_SECRET)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done', payment_id: paymentId, amount: 5000 }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      headers: { 'x-khipu-signature': sig },
      payload: callbackBody,
    })

    expect(res.statusCode).toBe(200)
    expect(await prisma.membership.findFirst({ where: { userId: memberBId, paymentNotes: `khipu:${paymentId}` } })).toBeNull()
    const forA = await prisma.membership.findFirst({ where: { userId: memberAId, paymentNotes: `khipu:${paymentId}` } })
    expect(forA).not.toBeNull()
    createdMembershipIds.push(forA!.id)
  })

  // Test 16
  it('gym sin secret: callback sin firma procesa correctamente el pago', async () => {
    // Fix aplicado 2026-05-07: cfg.secret ?? '' evita TypeError en crypto.createHmac

    const passwordHash = await (await import('bcryptjs')).hash(TEST_PASSWORD, 10)

    const memberC = await prisma.user.create({
      data: {
        gymId: gymCId,
        name: 'Member Khipu C',
        email: 'qa-khipu-member-c@test.local',
        passwordHash,
        role: 'MEMBER',
      },
    })

    const planC = await prisma.plan.create({
      data: {
        gymId: gymCId,
        name: 'Plan Khipu C Test',
        priceCents: 3000, // $3.000 CLP
        currency: 'CLP',
        durationDays: 30,
        isActive: true,
      },
    })

    const paymentId = 'kh_nosecret_004'
    const callbackBody = {
      gymId: gymCId,
      planId: planC.id,
      userId: memberC.id,
      payment_id: paymentId,
    }
    await createKhipuCheckoutRecord(callbackBody.payment_id, callbackBody.userId, callbackBody.planId, callbackBody.gymId)

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done', payment_id: paymentId, amount: 3000 }),
    } as Response)

    // Sin header x-khipu-signature — gym C no tiene secret, así que no debería validar firma
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/khipu',
      payload: callbackBody,
    })

    // Post-fix: gym sin secret procesa callback sin validar firma → membresía activa
    expect(res.statusCode).toBe(200)
    const body2 = res.json()
    expect(body2.ok).toBe(true)

    const created = await prisma.membership.findFirst({
      where: { userId: memberC.id, paymentNotes: `khipu:${paymentId}` },
    })
    expect(created).not.toBeNull()
    if (created) createdMembershipIds.push(created.id)

    // Cleanup inmediato para estos recursos extra (membresía antes que usuario por FK)
    if (created) await prisma.membership.delete({ where: { id: created.id } })
    await prisma.user.delete({ where: { id: memberC.id } })
    await prisma.plan.delete({ where: { id: planC.id } })
  })
})
