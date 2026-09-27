/**
 * kushki.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de Kushki.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/kushki  — requiere JWT; crea checkout via Kushki API;
 *                                        devuelve { url, chargeToken }
 *   2. POST /payments/callback/kushki  — sin auth; params en query (gymId, planId, userId);
 *                                        header x-kushki-token validado si gym tiene privateMerchantId;
 *                                        body { ticketNumber, transactionStatus }
 *
 * Estrategia:
 *   - DB real (Postgres). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de Kushki.
 *   - Gym A con Kushki habilitado, Gym B sin pasarela.
 *   - Cleanup en afterAll ordenado por FK.
 *
 * Notas sobre Kushki:
 *   - Checkout: POST a api-uat.kushkipagos.com/card/v1/charges con header Private-Merchant-Id.
 *   - Callback: x-kushki-token es un JWT (3 segmentos) con merchantId en payload.
 *     La ruta mapea errores a 401 si contienen 'inválido', 'Falta header' o 'no coincide'.
 *   - transactionStatus !== 'APPROVAL' → 400 "Pago Kushki no aprobado".
 *   - Idempotencia: busca membership existente con paymentNotes: 'kushki:{ticketNumber}'.
 *
 * NO duplica tests de validateKushkiToken — esos ya están en
 * webhook-signatures.integration.test.ts (7 unit + 3 HTTP = 10 tests).
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

const GYM_A_SLUG = 'qa-kushki-gym-a'
const GYM_B_SLUG = 'qa-kushki-gym-b'

const PRIVATE_MERCHANT_ID = 'test_private_merchant'
const PUBLIC_MERCHANT_ID = 'test_merchant_kushki'

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

// Tracking de membresías para cleanup
const createdMembershipIds: string[] = []

// ─── Helper: construir app Fastify ───────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET })

  // rawBody support — mismo patrón que flow.integration.test.ts
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

// ─── Helper: genera un JWT Kushki sintético con merchantId en payload ────────
// (sin firma real — Kushki solo verifica merchantId en MVP, no la firma criptográfica)

function makeKushkiToken(merchantId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ merchantId, sub: 'callback', iat: Date.now() })).toString('base64url')
  return `${header}.${payload}.fakesig`
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

  // Gym A — con Kushki habilitado
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA Kushki Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        kushki: {
          enabled: true,
          publicMerchantId: PUBLIC_MERCHANT_ID,
          privateMerchantId: PRIVATE_MERCHANT_ID,
          sandbox: true,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela Kushki
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA Kushki Gym B',
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
      name: 'Admin Kushki A',
      email: 'qa-kushki-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member Kushki A',
      email: 'qa-kushki-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member Kushki B',
      email: 'qa-kushki-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan Kushki Test',
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
    email: 'qa-kushki-member-a@test.local', role: 'MEMBER', name: 'Member Kushki A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-kushki-member-b@test.local', role: 'MEMBER', name: 'Member Kushki B',
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

// ─── Suite 1: POST /payments/checkout/kushki ──────────────────────────────────

describe('Kushki: POST /api/payments/checkout/kushki', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin token JWT → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('planId no-uuid → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('plan inexistente (UUID válido, no existe en DB) → 400 "Plan no encontrado"', async () => {
    // El service llama getPlan(planId, gymId) antes de llamar a la API de Kushki
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  it('gym sin config Kushki habilitada → 400', async () => {
    // memberB pertenece a Gym B que no tiene Kushki habilitado
    // El plan es de Gym A → getPlan(planId, gymBId) falla: "Plan no encontrado"
    // (o si encontrara el plan, gatewayConfig lanzaría "Pasarela kushki no configurada")
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('Kushki API falla (ok: false) → 400 error propagado', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Internal Server Error from Kushki',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/kushki error/i)
  })

  it('Kushki API no devuelve redirectURL ni payment_url → 400', async () => {
    // La API devuelve 200 pero sin URL de pago
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ticketNumber: 'tk001' }), // sin redirectURL ni payment_url
      text: async () => '',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/no devolvió URL/i)
  })

  it('éxito → 200 con { url, chargeToken } y llamada a Kushki con Private-Merchant-Id correcto', async () => {
    const redirectURL = 'https://api-uat.kushkipagos.com/card/v1/deferred/charge/redirect/test123'
    const ticketNumber = 'tk_test_success_001'

    let capturedUrl: string | undefined
    let capturedOptions: RequestInit | undefined

    vi.spyOn(global, 'fetch').mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = url.toString()
      capturedOptions = options
      return {
        ok: true,
        json: async () => ({ redirectURL, ticketNumber }),
        text: async () => '',
      } as Response
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/kushki',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe(redirectURL)
    expect(body.chargeToken).toBe(ticketNumber)

    // Verificar que se llamó al endpoint de sandbox correcto
    expect(capturedUrl).toContain('api-uat.kushkipagos.com')
    expect(capturedUrl).toContain('/card/v1/charges')

    // Verificar que se envió el Private-Merchant-Id correcto
    const headers = capturedOptions?.headers as Record<string, string>
    expect(headers?.['Private-Merchant-Id']).toBe(PRIVATE_MERCHANT_ID)

    // Verificar que el body incluye amount, currency, description, callbackURL
    const sentBody = JSON.parse(capturedOptions?.body as string)
    expect(sentBody.amount).toBeDefined()
    expect(sentBody.amount.subtotalIva0).toBeGreaterThan(0)
    expect(sentBody.currency).toBe('CLP')
    // La URL de callback no lleva gymId/planId/userId: el servidor guarda el checkout
    expect(sentBody.callbackURL).not.toContain('gymId=')
    const checkout = await prisma.paymentCheckout.findUnique({
      where: { gateway_externalRef: { gateway: 'kushki', externalRef: ticketNumber } },
    })
    expect(checkout).toMatchObject({ gymId: gymAId, userId: memberAId, planId: planAId })
    expect(sentBody.callbackURL).not.toContain('planId=')
    expect(sentBody.callbackURL).not.toContain('userId=')
  })
})

/** Checkout que el servidor guarda al iniciar el pago; el callback lo resuelve por ticketNumber */
async function createKushkiCheckoutRecord(ticketNumber: string, userId = memberAId, planId = planAId, gymId = gymAId) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } })
  await prisma.paymentCheckout.deleteMany({ where: { gateway: 'kushki', externalRef: ticketNumber } })
  await prisma.paymentCheckout.create({
    data: { gateway: 'kushki', externalRef: ticketNumber, gymId, userId, planId, amountCents: plan.priceCents, currency: plan.currency },
  })
}

// ─── Suite 2: POST /payments/callback/kushki ──────────────────────────────────

describe('Kushki: POST /api/payments/callback/kushki', () => {
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

  it('ticketNumber sin checkout guardado → 400 "Checkout no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      payload: { ticketNumber: 'tk_sin_checkout', transactionStatus: 'APPROVAL' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Checkout no encontrado/i)
  })

  it('gymId/planId/userId de la URL se ignoran: sin checkout no se activa nada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/callback/kushki?gymId=${gymAId}&planId=${planAId}&userId=${memberAId}`,
      payload: { ticketNumber: 'tk_url_params_only', transactionStatus: 'APPROVAL' },
    })
    expect(res.statusCode).toBe(400)
    expect(await prisma.membership.findFirst({ where: { paymentNotes: 'kushki:tk_url_params_only' } })).toBeNull()
  })

  it('sin header x-kushki-token cuando gym tiene privateMerchantId → 401', async () => {
    await createKushkiCheckoutRecord('tk_no_token', memberAId, planAId, gymAId)
    // handleKushkiCallback: cfg.enabled && cfg.privateMerchantId → validateKushkiToken(undefined, ...)
    // → lanza "Falta header x-kushki-token" → ruta mapea a 401
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      // Sin header x-kushki-token
      payload: { ticketNumber: 'tk_no_token', transactionStatus: 'APPROVAL' },
    })
    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/Falta header x-kushki-token/i)
  })

  it('token JWT con formato incorrecto (sin puntos) → 401', async () => {
    await createKushkiCheckoutRecord('tk_bad_fmt', memberAId, planAId, gymAId)
    // Fix 2026-05-07: routes.ts ahora incluye "no tiene formato" en el mapeo a 401
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': 'notajwttoken' },
      payload: { ticketNumber: 'tk_bad_fmt', transactionStatus: 'APPROVAL' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toMatch(/no tiene formato JWT/i)
  })

  it('token JWT con merchantId incorrecto → 401', async () => {
    await createKushkiCheckoutRecord('tk_wrong_merchant', memberAId, planAId, gymAId)
    const tokenWithWrongMerchant = makeKushkiToken('otro-merchant-diferente')

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': tokenWithWrongMerchant },
      payload: { ticketNumber: 'tk_wrong_merchant', transactionStatus: 'APPROVAL' },
    })
    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/no coincide/i)
  })

  it('transactionStatus distinto de APPROVAL (DECLINED) → 400 "Pago Kushki no aprobado"', async () => {
    await createKushkiCheckoutRecord('tk_declined', memberAId, planAId, gymAId)
    const validToken = makeKushkiToken(PRIVATE_MERCHANT_ID)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': validToken },
      payload: { ticketNumber: 'tk_declined', transactionStatus: 'DECLINED' },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/pago kushki no aprobado/i)
  })

  it('transactionStatus = FAILED → 400 "Pago Kushki no aprobado"', async () => {
    await createKushkiCheckoutRecord('tk_failed', memberAId, planAId, gymAId)
    const validToken = makeKushkiToken(PRIVATE_MERCHANT_ID)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': validToken },
      payload: { ticketNumber: 'tk_failed', transactionStatus: 'FAILED' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/pago kushki no aprobado/i)
  })

  it('éxito: token válido + APPROVAL → 200 + membresía ACTIVE + paymentNotes kushki:{ticketNumber}', async () => {
    const ticketNumber = 'tk_success_approved_001'
    await createKushkiCheckoutRecord(ticketNumber, memberAId, planAId, gymAId)
    const validToken = makeKushkiToken(PRIVATE_MERCHANT_ID)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': validToken },
      payload: { ticketNumber, transactionStatus: 'APPROVAL' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)

    // Verificar en DB que se creó la membresía correctamente
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `kushki:${ticketNumber}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('kushki')
    expect(membership!.paymentNotes).toBe(`kushki:${ticketNumber}`)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  it('idempotencia: mismo ticketNumber dos veces → 1 sola membresía', async () => {
    const ticketNumber = 'tk_idempotent_002'
    await createKushkiCheckoutRecord(ticketNumber, memberAId, planAId, gymAId)
    const validToken = makeKushkiToken(PRIVATE_MERCHANT_ID)

    const callbackUrl = '/api/payments/callback/kushki'
    const payload = { ticketNumber, transactionStatus: 'APPROVAL' }
    const headers = { 'x-kushki-token': validToken }

    // Primera llamada — crea la membresía
    const res1 = await app.inject({
      method: 'POST',
      url: callbackUrl,
      headers,
      payload,
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().ok).toBe(true)

    // Segunda llamada — idempotencia: no debe crear otra membresía
    const res2 = await app.inject({
      method: 'POST',
      url: callbackUrl,
      headers: { 'x-kushki-token': makeKushkiToken(PRIVATE_MERCHANT_ID) },
      payload,
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().ok).toBe(true)

    // Verificar que solo existe una membresía con este ticketNumber
    const count = await prisma.membership.count({
      where: { userId: memberAId, paymentNotes: `kushki:${ticketNumber}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `kushki:${ticketNumber}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  it('gymB sin Kushki habilitado → 400 "Pasarela Kushki no habilitada"', async () => {
    await createKushkiCheckoutRecord('tk_cross_gym_003', memberBId, planAId, gymBId)
    // Fix 2026-05-07: handleKushkiCallback lanza si !cfg?.enabled
    const validToken = makeKushkiToken(PRIVATE_MERCHANT_ID)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': validToken },
      payload: { ticketNumber: 'tk_cross_gym_003', transactionStatus: 'APPROVAL' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no habilitada/i)
  })

  it('transactionStatus ausente (body solo con ticketNumber) → activa membresía (status undefined !== APPROVAL es falsy)', async () => {
    // El service: if (transactionStatus && transactionStatus !== 'APPROVAL') throw ...
    // Si transactionStatus es undefined → condición es falsa → no lanza → activa membresía
    const ticketNumber = 'tk_no_status_004'
    await createKushkiCheckoutRecord(ticketNumber, memberAId, planAId, gymAId)
    const validToken = makeKushkiToken(PRIVATE_MERCHANT_ID)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/callback/kushki',
      headers: { 'x-kushki-token': validToken },
      payload: { ticketNumber },
      // transactionStatus no enviado
    })

    // Sin transactionStatus → la condición `transactionStatus && ... !== APPROVAL` es falsa → 200
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // Verificar membresía creada
    const membership = await prisma.membership.findFirst({
      where: { userId: memberAId, paymentNotes: `kushki:${ticketNumber}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
  })
})
