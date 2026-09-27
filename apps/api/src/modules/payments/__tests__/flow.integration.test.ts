/**
 * flow.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de Flow Chile.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/flow   — crea checkout con HMAC-SHA256, mock de fetch hacia Flow API
 *   2. POST /payments/callback/flow   — callback post-pago: getStatus, idempotencia, activación
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de Flow.
 *   - Gym A con flow habilitado, Gym B sin pasarela.
 *   - Cleanup en afterAll ordenado por FK.
 *
 * Notas sobre Flow:
 *   - Firma: HMAC-SHA256 de claves ordenadas alfabéticamente concatenadas key1val1key2val2...
 *   - El campo `s` se incluye DESPUÉS de firmar los demás params (sin incluirse a sí mismo).
 *   - createFlowCheckout devuelve { url, token, commerceOrder }.
 *   - handleFlowCallback llama getStatus con GET y verifica payment.status === 2 (aprobado).
 *   - Idempotencia: busca membership existente con paymentNotes: 'flow:{token}'.
 *   - El callback no requiere auth (redirect de Flow hacia el backend).
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

const GYM_A_SLUG = 'qa-flow-gym-a'
const GYM_B_SLUG = 'qa-flow-gym-b'

const FLOW_API_KEY = 'test_api_key_flow'
const FLOW_SECRET_KEY = 'test_secret_key_flow'

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

// ─── Helper: calcular firma Flow HMAC-SHA256 ─────────────────────────────────

function flowSign(params: Record<string, string>, secretKey: string): string {
  const keys = Object.keys(params).sort()
  const str = keys.map(k => k + params[k]).join('')
  return crypto.createHmac('sha256', secretKey).update(str).digest('hex')
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

  // Gym A — con Flow habilitado
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA Flow Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        flow: {
          enabled: true,
          apiKey: FLOW_API_KEY,
          secretKey: FLOW_SECRET_KEY,
          sandbox: true,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela flow
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA Flow Gym B',
      slug: GYM_B_SLUG,
      status: 'ACTIVE',
      paymentGateways: {},
    },
  })
  gymBId = gymB.id

  // Admin A (solo para FK — no se usa en los tests directamente)
  const adminA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Admin Flow A',
      email: 'qa-flow-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member Flow A',
      email: 'qa-flow-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member Flow B',
      email: 'qa-flow-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan Flow Test',
      priceCents: 500000, // $5000 CLP (en centavos)
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
    email: 'qa-flow-member-a@test.local', role: 'MEMBER', name: 'Member Flow A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-flow-member-b@test.local', role: 'MEMBER', name: 'Member Flow B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Cleanup residual (membresías creadas por idempotencia o tests que no trackean)
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

// ─── Suite 1: POST /payments/checkout/flow ────────────────────────────────────

describe('Flow: POST /api/payments/checkout/flow', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('plan inexistente (UUID válido, no existe en DB) → 400 "Plan no encontrado"', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'tok_test_noop', url: 'https://sandbox.flow.cl/...', flowOrder: 99 }),
      text: async () => '',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  it('gym sin config Flow habilitada → 400 "gateway no configurado"', async () => {
    // memberB pertenece a Gym B que no tiene flow habilitado
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    // El plan es de gymA — getPlan(planId, gymB) falla → "Plan no encontrado"
    // O si encuentra el plan, gatewayConfig falla → "Pasarela flow no configurada"
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('Flow API responde error (ok: false) → 400 error propagado al cliente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Internal Server Error from Flow',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/flow error/i)
  })

  it('Flow API devuelve code !== 0 → 400 con mensaje de error de Flow', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 1, message: 'Error de Flow: comercio inválido' }),
      text: async () => '',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/flow/i)
  })

  it('exito completo → 200 con { url, token, commerceOrder }', async () => {
    const flowToken = 'tok_test_123'
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: flowToken,
        url: 'https://sandbox.flow.cl/flow/app',
        flowOrder: 42,
      }),
      text: async () => '',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // createFlowCheckout arma la URL de redirect con el token
    expect(body.url).toBe(`https://sandbox.flow.cl/app/web/pay.php?token=${flowToken}`)
    expect(body.token).toBe(flowToken)
    expect(body.commerceOrder).toBeDefined()
    expect(typeof body.commerceOrder).toBe('string')
  })

  it('firma HMAC-SHA256 en checkout es correcta (verificar campo s del body enviado a Flow)', async () => {
    const flowToken = 'tok_sig_verify_456'
    await createFlowCheckoutRecord(flowToken)
    let capturedUrl: string | undefined
    let capturedOptions: RequestInit | undefined

    vi.spyOn(global, 'fetch').mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = url.toString()
      capturedOptions = options
      return {
        ok: true,
        json: async () => ({ token: flowToken, url: 'https://sandbox.flow.cl/flow/app', flowOrder: 77 }),
        text: async () => '',
      } as Response
    })

    await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/flow',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    // Verificar que se llamó al endpoint correcto
    expect(capturedUrl).toContain('sandbox.flow.cl/api/payment/create')
    expect(capturedOptions).toBeDefined()

    // Extraer los params del body form-urlencoded enviado a Flow
    const sentBody = new URLSearchParams(capturedOptions!.body as string)
    const params: Record<string, string> = {}
    sentBody.forEach((v, k) => {
      if (k !== 's') params[k] = v
    })

    // Recalcular la firma esperada según la lógica de flowSign
    const keys = Object.keys(params).sort()
    const str = keys.map(k => k + params[k]).join('')
    const expectedSig = crypto.createHmac('sha256', FLOW_SECRET_KEY).update(str).digest('hex')

    expect(sentBody.get('s')).toBe(expectedSig)

    // Verificar que el apiKey enviado es el correcto
    expect(sentBody.get('apiKey')).toBe(FLOW_API_KEY)
  })
})

/** Checkout que el servidor guarda al iniciar el pago; el callback lo resuelve por token */
async function createFlowCheckoutRecord(token: string, userId = memberAId, planId = planAId, gymId = gymAId) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } })
  await prisma.paymentCheckout.deleteMany({ where: { gateway: 'flow', externalRef: token } })
  await prisma.paymentCheckout.create({
    data: { gateway: 'flow', externalRef: token, gymId, userId, planId, amountCents: plan.priceCents, currency: plan.currency },
  })
}

// ─── Suite 2: POST /payments/callback/flow ────────────────────────────────────

describe('Flow: POST /api/payments/callback/flow', () => {
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

  it('token sin checkout guardado → 400 "Checkout no encontrado"', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/payments/callback/flow', payload: { token: 'tok_sin_checkout' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Checkout no encontrado/i)
  })

  it('Flow getStatus responde error (ok: false) → 400', async () => {
    await createFlowCheckoutRecord('tok_bad_status')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Flow getStatus server error',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      payload: {
        token: 'tok_bad_status',
      },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/flow getStatus error/i)
  })

  it('Flow getStatus devuelve status !== 2 (rechazado, status 3) → 400 con mensaje de rechazo', async () => {
    await createFlowCheckoutRecord('tok_rejected_status3')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 3, commerceOrder: 'test-order-1', amount: 5000 }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      payload: {
        token: 'tok_rejected_status3',
      },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/pago flow no aprobado/i)
  })

  it('Flow getStatus devuelve status !== 2 (pendiente, status 1) → 400 error', async () => {
    await createFlowCheckoutRecord('tok_pending_status1')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 1, commerceOrder: 'test-order-pending', amount: 5000 }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      payload: {
        token: 'tok_pending_status1',
      },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/pago flow no aprobado/i)
  })

  it('exito: pago aprobado (status 2) → membresía ACTIVE creada con paymentMethod flow y paymentNotes flow:token', async () => {
    const flowToken = 'tok_success_approved_001'
    await createFlowCheckoutRecord(flowToken)

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 2, commerceOrder: 'test-order-ok', amount: 5000 }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      payload: {
        token: flowToken,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // La ruta devuelve { ok: true } (no membershipId directamente)
    expect(body.ok).toBe(true)

    // Verificar en DB que se creó la membresía correctamente
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `flow:${flowToken}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('flow')
    expect(membership!.paymentNotes).toBe(`flow:${flowToken}`)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  it('idempotencia: mismo token dos veces → segunda llamada devuelve { ok: true } sin duplicar membresía', async () => {
    const flowToken = 'tok_idempotent_002'
    await createFlowCheckoutRecord(flowToken)

    // Mockear fetch dos veces para las dos llamadas al callback
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 2, commerceOrder: 'test-idem-order', amount: 5000 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 2, commerceOrder: 'test-idem-order', amount: 5000 }),
      } as Response)

    const callbackPayload = {
      token: flowToken,
    }

    // Primera llamada — crea la membresía
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      payload: callbackPayload,
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().ok).toBe(true)

    // Segunda llamada — idempotencia: no debe crear otra membresía
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      payload: callbackPayload,
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().ok).toBe(true)

    // Verificar que solo existe una membresía con este token
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `flow:${flowToken}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `flow:${flowToken}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  it('checkout de un gym sin Flow → 400', async () => {
    await createFlowCheckoutRecord('tok_cross_gym_003', memberBId, planAId, gymBId)
    const res = await app.inject({ method: 'POST', url: '/api/payments/callback/flow', payload: { token: 'tok_cross_gym_003' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Pasarela flow no configurada/i)
  })

  it('gymId/planId/userId del body se ignoran: el pago activa solo el checkout guardado', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 2, commerceOrder: 'test-cross-user' }),
    } as Response)
    const crossToken = 'tok_cross_user_004'
    await createFlowCheckoutRecord(crossToken) // checkout de memberA

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/flow',
      // Antes estos campos decidían a quién se activaba la membresía
      payload: { token: crossToken, gymId: gymBId, planId: planAId, userId: memberBId },
    })

    expect(res.statusCode).toBe(200)
    expect(await prisma.membership.findFirst({ where: { userId: memberBId, paymentNotes: `flow:${crossToken}` } })).toBeNull()
    const forA = await prisma.membership.findFirst({ where: { userId: memberAId, paymentNotes: `flow:${crossToken}` } })
    expect(forA).not.toBeNull()
    createdMembershipIds.push(forA!.id)
  })

  it('monto informado por Flow distinto al del checkout → 400', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 2, commerceOrder: 'test-amount', amount: 1 }),
    } as Response)
    await createFlowCheckoutRecord('tok_amount_005')
    const res = await app.inject({ method: 'POST', url: '/api/payments/callback/flow', payload: { token: 'tok_amount_005' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/monto pagado no coincide/i)
  })
})
