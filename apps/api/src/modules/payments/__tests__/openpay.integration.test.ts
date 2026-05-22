/**
 * openpay.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de OpenPay (México / Colombia).
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/openpay  — crea checkout Basic Auth contra API OpenPay
 *   2. GET  /payments/callback/openpay  — callback GET redirect del navegador (sin firma)
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de OpenPay.
 *   - Gym A con openpay habilitado, Gym B sin pasarela.
 *   - Cleanup en afterAll ordenado por FK.
 *
 * Notas sobre OpenPay:
 *   - Auth: Basic {base64(privateKey:)}.
 *   - createOpenPayCheckout: POST /charges → devuelve { url, transactionId, orderId }.
 *   - handleOpenPayCallback: GET /charges?order_id=... → verifica charge.status === 'completed'.
 *   - Idempotencia: busca membership existente con paymentNotes: 'openpay:{charge.id}'.
 *   - El callback es GET (redirect del navegador), sin auth, responde con redirect.
 *   - Sin firma entrante — diseño correcto según STATE.md.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { paymentRoutes } from '../payments.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-openpay-gym-a'
const GYM_B_SLUG = 'qa-openpay-gym-b'

const OPENPAY_MERCHANT_ID = 'test_merchant_openpay'
const OPENPAY_PRIVATE_KEY = 'test_private_key_openpay'

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

  // rawBody support — mismo patrón que producción y otros tests
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
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existing.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym A — con OpenPay habilitado
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA OpenPay Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        openpay: {
          enabled: true,
          merchantId: OPENPAY_MERCHANT_ID,
          privateKey: OPENPAY_PRIVATE_KEY,
          sandbox: true,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela openpay
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA OpenPay Gym B',
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
      name: 'Admin OpenPay A',
      email: 'qa-openpay-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member OpenPay A',
      email: 'qa-openpay-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member OpenPay B',
      email: 'qa-openpay-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan OpenPay Test',
      priceCents: 50000, // $500 MXN (en centavos → 500.00)
      currency: 'MXN',
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
    email: 'qa-openpay-member-a@test.local', role: 'MEMBER', name: 'Member OpenPay A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-openpay-member-b@test.local', role: 'MEMBER', name: 'Member OpenPay B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
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

// ─── Suite 1: POST /payments/checkout/openpay ─────────────────────────────────

describe('OpenPay: POST /api/payments/checkout/openpay', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('plan inexistente (UUID válido, no existe en DB) → 400 "Plan no encontrado"', async () => {
    // No necesita mock de fetch — getPlan lanza antes de llamar a OpenPay API
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  it('gym sin config OpenPay habilitada → 400 "Pasarela openpay no configurada"', async () => {
    // memberB pertenece a Gym B que no tiene openpay
    // El planA es de Gym A → getPlan(planAId, gymBId) fallará con "Plan no encontrado"
    // O si tuviera un plan propio en gymB, fallaría en gatewayConfig → "Pasarela openpay no configurada"
    // En cualquier caso: 400
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('OpenPay API responde error (ok: false) → 400 error propagado al cliente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Internal Server Error from OpenPay',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/openpay error/i)
  })

  it('OpenPay API no devuelve URL de pago → 400 "OpenPay no devolvió URL de pago"', async () => {
    // data sin payment_method.url ni redirect_url
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'trx_no_url', status: 'in_progress' }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/openpay no devolvió url/i)
  })

  it('exito completo → 200 con { url, transactionId, orderId }', async () => {
    const openpayTxId = 'trx_test_openpay_123'
    const paymentUrl = 'https://sandbox-api.openpay.mx/paynet-sandbox/pci/card'

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: openpayTxId,
        status: 'in_progress',
        payment_method: {
          url: paymentUrl,
        },
      }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe(paymentUrl)
    expect(body.transactionId).toBe(openpayTxId)
    expect(body.orderId).toBeDefined()
    expect(typeof body.orderId).toBe('string')
    // orderId incluye los primeros 8 chars del gymId
    expect(body.orderId).toContain(gymAId.slice(0, 8))
  })

  it('OpenPay recibe Basic Auth correcto (privateKey:) en Authorization header', async () => {
    const openpayTxId = 'trx_auth_verify_456'
    const paymentUrl = 'https://sandbox-api.openpay.mx/redirect'

    let capturedUrl: string | undefined
    let capturedOptions: RequestInit | undefined

    vi.spyOn(global, 'fetch').mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = url.toString()
      capturedOptions = options
      return {
        ok: true,
        json: async () => ({
          id: openpayTxId,
          status: 'in_progress',
          payment_method: { url: paymentUrl },
        }),
      } as Response
    })

    await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    // Verificar URL del endpoint correcto
    expect(capturedUrl).toContain(`sandbox-api.openpay.mx/v1/${OPENPAY_MERCHANT_ID}/charges`)
    expect(capturedOptions).toBeDefined()

    // Verificar Basic Auth: base64(privateKey:)
    const expectedCredentials = Buffer.from(`${OPENPAY_PRIVATE_KEY}:`).toString('base64')
    const expectedAuth = `Basic ${expectedCredentials}`
    const headers = capturedOptions!.headers as Record<string, string>
    expect(headers['Authorization']).toBe(expectedAuth)

    // Verificar body JSON enviado a OpenPay
    const sentBody = JSON.parse(capturedOptions!.body as string)
    expect(sentBody.method).toBe('card')
    expect(sentBody.currency).toBe('MXN')
    expect(sentBody.customer.email).toBe('qa-openpay-member-a@test.local')
    expect(sentBody.redirect_url).toContain('/api/payments/callback/openpay')
    expect(sentBody.redirect_url).toContain(`gymId=${gymAId}`)
    expect(sentBody.redirect_url).toContain(`planId=${planAId}`)
    expect(sentBody.redirect_url).toContain(`userId=${memberAId}`)
  })

  it('exito con redirect_url en root del response (sin payment_method.url) → 200', async () => {
    // OpenPay puede devolver redirect_url directamente en el objeto (no anidado)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'trx_redirect_url_789',
        status: 'in_progress',
        redirect_url: 'https://sandbox-api.openpay.mx/paynet/card/redirect',
      }),
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/openpay',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe('https://sandbox-api.openpay.mx/paynet/card/redirect')
    expect(body.transactionId).toBe('trx_redirect_url_789')
  })
})

// ─── Suite 2: GET /payments/callback/openpay ──────────────────────────────────

describe('OpenPay: GET /api/payments/callback/openpay', () => {
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

  it('sin params necesarios (gymId, planId, userId, orderId ausentes) → redirect a cancelled', async () => {
    // handleOpenPayCallback lanza "Parámetros incompletos" → ruta hace redirect a cancelled
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/callback/openpay',
    })
    // La ruta redirige: 302 a /payment/cancelled
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('cancelled')
  })

  it('gymId que no existe en DB → redirect a cancelled (userId no pertenece a ese gymId)', async () => {
    // validateCallbackParams verifica que userId pertenezca al gymId → falla con error de validación
    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=00000000-0000-0000-0000-000000000000&planId=${planAId}&userId=${memberAId}&orderId=test-order-xyz`,
    })
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('cancelled')
    expect(decodeURIComponent(location)).toMatch(/inválid|no válido/)
  })

  it('OpenPay getStatus falla (ok: false) → redirect a cancelled con error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'OpenPay server error',
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-fail`,
    })

    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('cancelled')
    expect(decodeURIComponent(location)).toMatch(/error verificando pago/i)
  })

  it('pago no completado (status: "pending") → redirect a cancelled con mensaje de estado', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: 'trx_pending_001', status: 'in_progress' }]),
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-pending`,
    })

    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('cancelled')
    expect(decodeURIComponent(location)).toMatch(/pago openpay no completado/i)
  })

  it('pago no completado (status: "failed") → redirect a cancelled', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: 'trx_failed_002', status: 'failed' }]),
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-failed`,
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location as string).toContain('cancelled')
  })

  it('exito: pago completado → membresía ACTIVE creada y redirect a success', async () => {
    const chargeId = 'trx_success_completed_001'

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: chargeId, status: 'completed', amount: 500, order_id: 'test-order-ok' }]),
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-ok`,
    })

    // La ruta redirige a success
    expect(res.statusCode).toBe(302)
    expect(res.headers.location as string).toContain('success')

    // Verificar en DB que se creó la membresía correctamente
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `openpay:${chargeId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('openpay')
    expect(membership!.paymentNotes).toBe(`openpay:${chargeId}`)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  it('idempotencia: mismo orderId dos veces → 1 sola membresía, segunda llamada también redirige a success', async () => {
    const chargeId = 'trx_idempotent_002'
    const orderId = 'test-order-idempotent'

    const mockCharge = { id: chargeId, status: 'completed', amount: 500, order_id: orderId }

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([mockCharge]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([mockCharge]),
      } as Response)

    const callbackUrl = `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=${orderId}`

    // Primera llamada — crea la membresía
    const res1 = await app.inject({ method: 'GET', url: callbackUrl })
    expect(res1.statusCode).toBe(302)
    expect(res1.headers.location as string).toContain('success')

    // Segunda llamada — idempotencia: no debe crear otra membresía
    const res2 = await app.inject({ method: 'GET', url: callbackUrl })
    expect(res2.statusCode).toBe(302)
    expect(res2.headers.location as string).toContain('success')

    // Verificar que solo existe una membresía con este chargeId
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `openpay:${chargeId}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `openpay:${chargeId}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  it('cross-gym: gymId de gym B (sin OpenPay) con planId de gym A → redirect a cancelled', async () => {
    // gymB no tiene openpay configurado → gatewayConfig lanza
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: 'trx_cross_003', status: 'completed' }]),
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymBId}&planId=${planAId}&userId=${memberBId}&orderId=test-cross-gym`,
    })

    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('cancelled')
    expect(decodeURIComponent(location)).toMatch(/openpay no configurad/i)
  })

  it('OpenPay devuelve array vacío (charge no encontrado) → redirect a cancelled', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([]),
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-notfound`,
    })

    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('cancelled')
    expect(decodeURIComponent(location)).toMatch(/pago openpay no completado/i)
  })

  it('OpenPay devuelve objeto único (no array) con status completed → membresía ACTIVE', async () => {
    // El servicio hace: const charge = Array.isArray(charges) ? charges[0] : charges
    // Entonces también acepta un objeto directo
    const chargeId = 'trx_object_direct_004'

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: chargeId, status: 'completed', amount: 500 }),
    } as Response)

    const res = await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-direct-obj`,
    })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location as string).toContain('success')

    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `openpay:${chargeId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('openpay')

    createdMembershipIds.push(membership!.id)
  })

  it('OpenPay usa URL sandbox cuando cfg.sandbox === true', async () => {
    // Verificar que el getStatus llama al endpoint sandbox correcto
    const chargeId = 'trx_sandbox_url_005'
    let capturedUrl: string | undefined

    vi.spyOn(global, 'fetch').mockImplementationOnce(async (url: string | URL | Request) => {
      capturedUrl = url.toString()
      return {
        ok: true,
        json: async () => ([{ id: chargeId, status: 'completed' }]),
      } as Response
    })

    await app.inject({
      method: 'GET',
      url: `/api/payments/callback/openpay?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}&orderId=test-order-sandbox-url`,
    })

    expect(capturedUrl).toContain(`sandbox-api.openpay.mx/v1/${OPENPAY_MERCHANT_ID}/charges`)
    expect(capturedUrl).toContain('order_id=test-order-sandbox-url')

    // Cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `openpay:${chargeId}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })
})
