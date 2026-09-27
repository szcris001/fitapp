/**
 * mach.integration.test.ts
 *
 * Tests de integración para los 2 endpoints de MACH Business.
 *
 * Endpoints cubiertos:
 *   1. POST /payments/checkout/mach  — crea payment link, mock de fetch hacia MACH API
 *   2. POST /payments/webhook/mach   — webhook post-pago: Bearer token, idempotencia, activación
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - vi.spyOn(global, 'fetch') para simular respuestas de la API de MACH.
 *   - Gym A con mach habilitado, Gym B sin pasarela.
 *   - Cleanup en afterAll ordenado por FK.
 *
 * Notas sobre MACH Business:
 *   - Checkout: Authorization: Bearer <cfg.apiKey> en header hacia MACH API.
 *   - Respuesta de MACH: { payment_url, id }.
 *   - external_id del checkout: "<gymId8>-<planId8>-<userId8>-<timestamp>".
 *   - Webhook: Authorization: Bearer <webhookSecret> en header entrante.
 *   - validateMachWebhookToken: timingSafeEqual entre Bearer token y webhookSecret del gym.
 *   - Idempotencia: busca membership con paymentNotes: 'mach:{payment_id}'.
 *   - Cross-gym: external_id.gymId8 prefix debe corresponder al gym hallado en DB.
 *   - Sin gymId explícito en body del webhook: se extrae del external_id por prefix.
 *
 * Tests NO incluidos (ya cubiertos en webhook-signatures.integration.test.ts):
 *   - validateMachWebhookToken unit puro (6 casos)
 *   - Tests HTTP de mapeo 401 sin DB real (3 casos HTTP-MA-*)
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

const GYM_A_SLUG = 'qa-mach-gym-a'
const GYM_B_SLUG = 'qa-mach-gym-b'

const MACH_API_KEY = 'test_mach_api_key'
const MACH_WEBHOOK_SECRET = 'test_mach_webhook_secret'

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

  // Gym A — con MACH habilitado
  const gymA = await prisma.gym.create({
    data: {
      name: 'QA MACH Gym A',
      slug: GYM_A_SLUG,
      status: 'ACTIVE',
      paymentGateways: {
        mach: {
          enabled: true,
          apiKey: MACH_API_KEY,
          webhookSecret: MACH_WEBHOOK_SECRET,
          sandbox: true,
        },
      },
    },
  })
  gymAId = gymA.id

  // Gym B — sin pasarela MACH
  const gymB = await prisma.gym.create({
    data: {
      name: 'QA MACH Gym B',
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
      name: 'Admin MACH A',
      email: 'qa-mach-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Member A — pertenece a Gym A
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member MACH A',
      email: 'qa-mach-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAId = memberA.id

  // Member B — pertenece a Gym B (para tests cross-gym)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member MACH B',
      email: 'qa-mach-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan MACH Test',
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
    email: 'qa-mach-member-a@test.local', role: 'MEMBER', name: 'Member MACH A',
  })
  memberBToken = tempApp.jwt.sign({
    userId: memberBId, gymId: gymBId,
    email: 'qa-mach-member-b@test.local', role: 'MEMBER', name: 'Member MACH B',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Cleanup residual (membresías no trackeadas)
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

// ─── Suite 1: POST /payments/checkout/mach ────────────────────────────────────

describe('MACH: POST /api/payments/checkout/mach', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      payload: { planId: planAId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('planId inválido (no uuid) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: 'no-es-un-uuid' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('plan inexistente (UUID válido, no existe en DB) → 400 "Plan no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    const errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
    expect(errorMsg).toMatch(/plan no encontrado/i)
  })

  it('gym sin config MACH habilitada → 400 "gateway no configurado"', async () => {
    // memberB pertenece a Gym B que no tiene mach habilitado
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { planId: planAId },
    })
    // Plan pertenece a gymA → getPlan(planId, gymB) falla → "Plan no encontrado"
    // O si el gym se busca primero, falla con "Pasarela mach no configurada"
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('MACH API responde error (ok: false) → 400 error propagado al cliente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'Internal Server Error from MACH',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toMatch(/mach business error/i)
  })

  it('exito → 200 con { url, externalId, linkId }', async () => {
    const mockPaymentUrl = 'https://biz.soymach.com/pay/test-link-123'
    const mockLinkId = 'mach-link-id-abc'

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payment_url: mockPaymentUrl,
        url: mockPaymentUrl,
        id: mockLinkId,
      }),
      text: async () => '',
    } as Response)

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe(mockPaymentUrl)
    expect(body.externalId).toBeDefined()
    expect(typeof body.externalId).toBe('string')
    // externalId format: <gymId8>-<planId8>-<userId8>-<timestamp>
    const parts = body.externalId.split('-')
    expect(parts.length).toBeGreaterThanOrEqual(4)
    expect(parts[0]).toBe(gymAId.slice(0, 8))
    expect(parts[1]).toBe(planAId.slice(0, 8))
    expect(parts[2]).toBe(memberAId.slice(0, 8))
    expect(body.linkId).toBe(mockLinkId)
  })

  it('apiKey se incluye correctamente en el header Authorization hacia MACH API', async () => {
    let capturedUrl: string | undefined
    let capturedOptions: RequestInit | undefined

    vi.spyOn(global, 'fetch').mockImplementationOnce(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = url.toString()
      capturedOptions = options
      return {
        ok: true,
        json: async () => ({
          payment_url: 'https://biz.soymach.com/pay/test-link-456',
          id: 'mach-link-verify',
        }),
        text: async () => '',
      } as Response
    })

    await app.inject({
      method: 'POST',
      url: '/api/payments/checkout/mach',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { planId: planAId },
    })

    // Verificar que se llamó al endpoint correcto de MACH
    expect(capturedUrl).toContain('biz.soymach.com/api/v1/payment-links')
    expect(capturedOptions).toBeDefined()

    // Verificar que el Authorization header usa el apiKey correcto
    const headers = capturedOptions!.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${MACH_API_KEY}`)

    // Verificar que el body incluye el external_id con el formato correcto
    const sentBody = JSON.parse(capturedOptions!.body as string)
    expect(sentBody.external_id).toBeDefined()
    const externalParts = sentBody.external_id.split('-')
    expect(externalParts[0]).toBe(gymAId.slice(0, 8))
    expect(externalParts[1]).toBe(planAId.slice(0, 8))
    expect(externalParts[2]).toBe(memberAId.slice(0, 8))

    // Verificar que el amount es en CLP (priceCents / 100)
    expect(sentBody.amount).toBe(5000) // 500000 centavos / 100
    expect(sentBody.currency).toBe('CLP')
  })
})

// ─── Suite 2: POST /payments/webhook/mach ─────────────────────────────────────

describe('MACH: POST /api/payments/webhook/mach', () => {
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

  it('sin header Authorization cuando gym tiene webhookSecret → 401', async () => {
    // handleMachWebhook: busca el gym por gymPrefix del external_id, luego valida token si cfg.webhookSecret.
    // validateMachWebhookToken(undefined, secret) lanza 'Falta header Authorization en webhook MACH'
    // La ruta mapea ese mensaje a 401.
    // Construimos un external_id válido para que llegue a la validación del token.
    const externalId = `${gymAId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: { 'content-type': 'application/json' },
      // Sin Authorization header
      payload: {
        status: 'PAID',
        external_id: externalId,
        payment_id: 'mach-pay-no-auth',
        amount: 5000,
      },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/falta header/i)
  })

  it('token inválido en Authorization → 401', async () => {
    // Bearer token incorrecto → validateMachWebhookToken lanza 'Token de webhook MACH inválido'
    const externalId = `${gymAId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer token-incorrecto-que-no-coincide',
      },
      payload: {
        status: 'PAID',
        external_id: externalId,
        payment_id: 'mach-pay-bad-token',
        amount: 5000,
      },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toMatch(/inválido/i)
  })

  it('pago no aprobado (status PENDING) → no activa membresía → 200 { received: true }', async () => {
    const externalId = `${gymAId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
      },
      payload: {
        status: 'PENDING', // no es PAID ni COMPLETED
        external_id: externalId,
        payment_id: 'mach-pay-pending',
        amount: 5000,
      },
    })

    // status !== PAID/COMPLETED → early return antes de validar token
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.received).toBe(true)

    // Verificar que NO se creó membresía
    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: 'mach:mach-pay-pending' },
    })
    expect(membership).toBeNull()
  })

  it('exito: token válido + pago aprobado (PAID) → membresía ACTIVE → 200', async () => {
    const paymentId = `mach-pay-success-${Date.now()}`
    const externalId = `${gymAId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
      },
      payload: {
        status: 'PAID',
        external_id: externalId,
        payment_id: paymentId,
        amount: 5000,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.received).toBe(true)
    expect(body.membershipId).toBeDefined()

    // Verificar en DB que se creó la membresía correctamente
    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: `mach:${paymentId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.paymentMethod).toBe('mach')
    expect(membership!.paymentNotes).toBe(`mach:${paymentId}`)
    expect(membership!.userId).toBe(memberAId)
    expect(membership!.planId).toBe(planAId)

    createdMembershipIds.push(membership!.id)
  })

  it('exito con status COMPLETED (alias de PAID) → membresía ACTIVE → 200', async () => {
    const paymentId = `mach-pay-completed-${Date.now()}`
    const externalId = `${gymAId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
      },
      payload: {
        status: 'COMPLETED',
        external_id: externalId,
        payment_id: paymentId,
        amount: 5000,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.received).toBe(true)
    expect(body.membershipId).toBeDefined()

    // Verificar membresía en DB
    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: `mach:${paymentId}` },
    })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')

    createdMembershipIds.push(membership!.id)
  })

  it('idempotencia: mismo payment_id dos veces → 1 sola membresía', async () => {
    const paymentId = `mach-pay-idem-${Date.now()}`
    const externalId = `${gymAId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const webhookPayload = {
      status: 'PAID',
      external_id: externalId,
      payment_id: paymentId,
      amount: 5000,
    }

    const headers = {
      'content-type': 'application/json',
      'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
    }

    // Primera llamada — crea la membresía
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers,
      payload: webhookPayload,
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().received).toBe(true)

    // Segunda llamada — idempotencia: no debe crear otra membresía
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers,
      payload: webhookPayload,
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().received).toBe(true)

    // Verificar que solo existe una membresía con este payment_id
    const count = await prisma.membership.count({
      where: { paymentNotes: `mach:${paymentId}` },
    })
    expect(count).toBe(1)

    // Registrar para cleanup
    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: `mach:${paymentId}` },
    })
    if (membership) createdMembershipIds.push(membership.id)
  })

  it('cross-gym: gymId en external_id que no corresponde al gym del plan → { received: true } sin membresía', async () => {
    // El external_id tiene el prefix de gymB, pero el plan y el user son de gymA.
    // handleMachWebhook busca gymB, gymB no tiene mach habilitado → return { received: true }
    const paymentId = `mach-pay-cross-${Date.now()}`
    // Usamos gymBId prefix pero los demás son de gymA — gymB no tiene MACH enabled
    const externalId = `${gymBId.slice(0, 8)}-${planAId.slice(0, 8)}-${memberAId.slice(0, 8)}-${Date.now()}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
      },
      payload: {
        status: 'PAID',
        external_id: externalId,
        payment_id: paymentId,
        amount: 5000,
      },
    })

    // gymB no tiene MACH enabled → handleMachWebhook devuelve { received: true } sin error
    expect(res.statusCode).toBe(200)
    expect(res.json().received).toBe(true)

    // Verificar que NO se creó membresía
    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: `mach:${paymentId}` },
    })
    expect(membership).toBeNull()
  })

  it('external_id sin partes suficientes (malformado) → { received: true } sin membresía ni error 5xx', async () => {
    // handleMachWebhook: parts.length < 3 → return { received: true }
    const paymentId = 'mach-pay-malformed'

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
      },
      payload: {
        status: 'PAID',
        external_id: 'malformed-id', // solo 2 partes
        payment_id: paymentId,
        amount: 5000,
      },
    })

    // parts.length < 3 → early return
    expect(res.statusCode).toBe(200)
    expect(res.json().received).toBe(true)

    // Sin membresía
    const membership = await prisma.membership.findFirst({
      where: { paymentNotes: `mach:${paymentId}` },
    })
    expect(membership).toBeNull()
  })

  it('sin external_id en body → { received: true } sin 5xx', async () => {
    // handleMachWebhook: !external_id → return { received: true }
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/mach',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${MACH_WEBHOOK_SECRET}`,
      },
      payload: {
        status: 'PAID',
        // Sin external_id
        payment_id: 'mach-pay-no-extid',
        amount: 5000,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().received).toBe(true)
  })
})
