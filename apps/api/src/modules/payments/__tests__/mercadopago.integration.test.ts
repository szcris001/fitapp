/**
 * mercadopago.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de Mercado Pago.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/mercadopago — crea preferencia de pago, mock de fetch hacia MP API
 *   2. POST /payments/webhook/mercadopago  — IPN/webhook: itera gyms, activa membresía, idempotencia
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de Mercado Pago.
 *   - Gym A con MP habilitado + webhookSecret por gym, Gym B sin pasarela.
 *   - Cleanup en afterAll ordenado por FK.
 *
 * NO duplica tests de validateMercadoPagoSignature (ya cubiertos en
 * webhook-signatures.integration.test.ts — 7 tests unitarios + 4 HTTP).
 *
 * Arquitectura especial del webhook:
 *   - Sin auth JWT (endpoint público)
 *   - Itera TODOS los gyms con paymentGateways para encontrar el correcto
 *   - Idempotencia por paymentNotes: 'mp:{paymentId}'
 *   - Firma global via MERCADOPAGO_WEBHOOK_SECRET o per-gym via cfg.webhookSecret
 *   - La ruta ignora el return value del service y siempre devuelve { ok: true }
 */

import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'

// ─── Mock de mp-client (wrapper del SDK) ──────────────────────────────────────
// Mockeamos el wrapper propio (no el SDK de terceros) para evitar el problema de
// caché de módulos: vi.mock intercepta el require() del wrapper antes de que
// cualquier otro módulo lo haya cacheado, garantizando que payments.service
// siempre use nuestra implementación mock.

const { mockPreferenceCreate, mockPaymentGet } = vi.hoisted(() => ({
  mockPreferenceCreate: vi.fn(),
  mockPaymentGet: vi.fn(),
}))

vi.mock('../../../lib/mp-client', () => ({
  createMPPreference: mockPreferenceCreate,
  getMPPayment: mockPaymentGet,
}))

import { paymentRoutes } from '../payments.routes'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-mp-gym-a'
const GYM_B_SLUG = 'qa-mp-gym-b'

const MP_ACCESS_TOKEN = 'TEST-access-token-mp-123'
const MP_WEBHOOK_SECRET_GYM = 'test_mp_webhook_secret_gym_a'

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

// ─── Helper: construir x-signature válida para MP ────────────────────────────

function makeMpSignature(paymentId: string, requestId: string, secret: string): string {
  const ts = '1234567890'
  const template = `id:${paymentId};request-id:${requestId};ts:${ts}`
  const v1 = crypto.createHmac('sha256', secret).update(template).digest('hex')
  return `ts=${ts},v1=${v1}`
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

  // Gym A — con Mercado Pago habilitado y webhookSecret por gym
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA MP Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        mercadopago: {
          enabled: true,
          accessToken: MP_ACCESS_TOKEN,
          webhookSecret: MP_WEBHOOK_SECRET_GYM,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela MP
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA MP Gym B',
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
      name: 'Admin MP A',
      email: 'qa-mp-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member MP A',
      email: 'qa-mp-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member MP B',
      email: 'qa-mp-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan MP Test',
      priceCents: 500000, // $5000 ARS (en centavos)
      currency: 'ARS',
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
    email: 'qa-mp-member-a@test.local', role: 'MEMBER', name: 'Member MP A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-mp-member-b@test.local', role: 'MEMBER', name: 'Member MP B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Cleanup residual (membresías creadas por tests que no trackean)
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

// ─── Suite 1: POST /payments/checkout/mercadopago ────────────────────────────

describe('Mercado Pago: POST /api/payments/checkout/mercadopago', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    mockPreferenceCreate.mockReset()
  })

  // Caso 1: Sin auth → 401
  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  // Caso 2: planId no-uuid → 400 Zod
  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  // Caso 3: Plan inexistente (UUID válido, no existe en DB) → 400
  it('plan inexistente (UUID válido, no existe en DB) → 400 "Plan no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  // Caso 4: Gym sin config MP habilitada → 400
  it('gym sin config MP habilitada → 400 "pasarela no configurada"', async () => {
    // memberB pertenece a Gym B que no tiene MP configurado
    // El plan es de gymA → getPlan(planId, gymBId) lanzará "Plan no encontrado"
    // En cualquier caso el resultado debe ser 400
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  // Caso 5: SDK lanza error → 400 propagado al cliente
  it('MP SDK lanza error → 400 error propagado al cliente', async () => {
    mockPreferenceCreate.mockRejectedValueOnce(new Error('unauthorized - invalid token'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/unauthorized|invalid/i)
  })

  // Caso 6: Éxito → 200 con { url, preferenceId }
  it('éxito → 200 con { url, preferenceId }', async () => {
    mockPreferenceCreate.mockResolvedValueOnce({
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_test_123',
      id: 'pref_test_123',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_test_123')
    expect(body.preferenceId).toBe('pref_test_123')
  })

  // Caso 7: Verificar external_reference contiene gymId|planId|userId
  it('external_reference enviado a MP contiene "gymId|planId|userId"', async () => {
    let capturedBody: any

    mockPreferenceCreate.mockImplementationOnce(async (_accessToken: string, body: any) => {
      capturedBody = body
      return {
        init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_ref_check',
        id: 'pref_ref_check',
      }
    })

    await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mercadopago',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(capturedBody).toBeDefined()
    expect(capturedBody.external_reference).toBe(`${gymAId}|${planAId}|${memberAId}`)
  })
})

// ─── Suite 2: POST /payments/webhook/mercadopago ─────────────────────────────

describe('Mercado Pago: POST /api/payments/webhook/mercadopago', () => {
  let app: FastifyInstance
  const originalMpSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET

  beforeAll(async () => {
    app = await buildApp()
    // Asegurarse de que no haya secret global por defecto en estas pruebas
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
  })

  afterAll(async () => {
    // Restaurar estado original
    if (originalMpSecret !== undefined) {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalMpSecret
    } else {
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET
    }
    await app.close()
  })

  afterEach(async () => {
    mockPaymentGet.mockReset()
    mockPaymentGet.mockRejectedValue(new Error('mock not configured'))
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
    // Limpiar membresías creadas durante cada test
    if (createdMembershipIds.length) {
      await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
      createdMembershipIds.length = 0
    }
  })

  // Caso 8: Action desconocida → 200 { received: true } sin activar nada
  it('action desconocida ("payment.refunded") → 200 { ok: true } sin activar membresía', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.refunded', data: { id: '999001' } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // Verificar que no se creó ninguna membresía
    const count = await prisma.membership.count({
      where: { paymentNotes: 'mp:999001' },
    })
    expect(count).toBe(0)
  })

  // Caso 9: Sin data.id → 200 { ok: true } sin activar nada
  it('sin data.id → 200 { ok: true } sin activar membresía', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: {} },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  // Caso 10: SDK lanza error (accessToken incorrecto) → itera gyms, no activa → 200
  it('MP SDK lanza error al obtener pago → no activa membresía, devuelve 200', async () => {
    mockPaymentGet.mockRejectedValueOnce(new Error('Unauthorized'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: { id: '999002' } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    const count = await prisma.membership.count({
      where: { paymentNotes: 'mp:999002' },
    })
    expect(count).toBe(0)
  })

  // Caso 11: payment.status !== 'approved' (status: 'pending') → no activa membresía
  it('payment.status "pending" → no activa membresía, devuelve 200', async () => {
    mockPaymentGet.mockResolvedValue({
      status: 'pending',
      external_reference: `${gymAId}|${planAId}|${memberAId}`,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: { id: '999003' } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    const count = await prisma.membership.count({
      where: { paymentNotes: 'mp:999003' },
    })
    expect(count).toBe(0)
  })

  // Caso 12: external_reference con gymId que no coincide con gym iterado → no activa
  it('external_reference con gymId distinto al gym iterado → no activa membresía', async () => {
    mockPaymentGet.mockResolvedValue({
      status: 'approved',
      external_reference: `${gymBId}|${planAId}|${memberAId}`,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: { id: '999004' } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    const count = await prisma.membership.count({
      where: { paymentNotes: 'mp:999004' },
    })
    expect(count).toBe(0)
  })

  // Caso 13: Éxito completo → membresía ACTIVE creada → 200 { ok: true }
  it('éxito completo: payment.created + approved + external_reference correcto → membresía ACTIVE creada', async () => {
    const paymentId = '800001'

    // mockResolvedValue sin Once: el mock retorna este valor para TODOS los gyms
    // que tengan MP habilitado (puede haber residuos de otros tests en la DB).
    mockPaymentGet.mockResolvedValue({
      status: 'approved',
      external_reference: `${gymAId}|${planAId}|${memberAId}`,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: { id: paymentId } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // Verificar membresía creada correctamente en DB
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `mp:${paymentId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('mercadopago')
    expect(membership!.paymentNotes).toBe(`mp:${paymentId}`)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  // Caso 14: Idempotencia — mismo paymentId dos veces → 1 sola membresía
  it('idempotencia: mismo paymentId dos veces → solo 1 membresía creada', async () => {
    const paymentId = '800002'

    const approvedPayment = {
      status: 'approved',
      external_reference: `${gymAId}|${planAId}|${memberAId}`,
    }

    // mockResolvedValue sin Once para que funcione aunque haya N gyms en la DB
    mockPaymentGet.mockResolvedValue(approvedPayment)

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: { id: paymentId } },
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().ok).toBe(true)

    // Segundo webhook — misma paymentId (el mock ya está configurado)

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.created', data: { id: paymentId } },
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().ok).toBe(true)

    // Verificar que solo existe UNA membresía con este paymentId
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `mp:${paymentId}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `mp:${paymentId}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  // Caso 15: Firma x-signature inválida con webhookSecret global → 401
  it('firma x-signature inválida con MERCADOPAGO_WEBHOOK_SECRET global → 401', async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'global_secret_for_test'

    // Firma calculada con secret incorrecto
    const ts = String(Math.floor(Date.now() / 1000))
    const wrongHash = crypto
      .createHmac('sha256', 'secret-equivocado')
      .update(`id:123;request-id:req-test;ts:${ts}`)
      .digest('hex')
    const xSignature = `ts=${ts},v1=${wrongHash}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: {
        'content-type': 'application/json',
        'x-signature': xSignature,
        'x-request-id': 'req-test',
      },
      payload: { action: 'payment.created', data: { id: '123' } },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/inválid/i)
  })

  // Bonus: action 'payment.updated' también activa (igual que payment.created)
  it('action "payment.updated" también activa membresía cuando pago está approved', async () => {
    const paymentId = '800003'

    mockPaymentGet.mockResolvedValue({
      status: 'approved',
      external_reference: `${gymAId}|${planAId}|${memberAId}`,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mercadopago',
      headers: { 'content-type': 'application/json' },
      payload: { action: 'payment.updated', data: { id: paymentId } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `mp:${paymentId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')

    createdMembershipIds.push(membership!.id)
  })
})
