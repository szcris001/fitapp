/**
 * gym-billing.integration.test.ts
 *
 * Cobro Tribu-Box -> gyms (docs/design/gym-billing-gateways.md, sección 7).
 * DB real, Fastify.inject, fetch hacia Flow mockeado. Corre bajo el contexto de tenant/RLS
 * (src/test/tenant-setup.ts) como en producción.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { prisma } from '../../../lib/prisma'
import { gymBillingRoutes } from '../gym-billing.routes'
import { gymPaymentsRoutes } from '../../superadmin/gym-payments.routes'
import { platformConfigRoutes } from '../../superadmin/config.routes'
import { gymRoutes } from '../../gyms/gyms.routes'
import { mediaRoutes } from '../../media/media.routes'
import { signMediaToken } from '../../../lib/media-token'
import { activateGymSubscriptionFromStripe } from '../../payments/payments.service'
import {
  getBillingGatewayConfig, listEnabledBillingGateways, writeBillingGateways, invalidateBillingConfigCache,
} from '../billing-config.service'
import {
  activateGymSubscriptionFromPayment, expireStaleTransferPayments, flowSign, generateTransferReference,
} from '../gym-billing.service'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const DAY = 86_400_000
const SLUG = (s: string) => `qa-gb-${s}`
const FLOW_KEY = 'FLOWKEY-AAAA1234'
const FLOW_SECRET = 'FLOWSECRET-BBBB5678'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body')])

let app: FastifyInstance
const ids: Record<string, string> = {}
const tok: Record<string, string> = {}
let originalBilling: unknown = null
const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = ['STRIPE_SECRET_KEY', 'FLOW_API_KEY', 'FLOW_SECRET_KEY', 'FLOW_API_URL']

const auth = (t: string) => ({ authorization: `Bearer ${t}` })
const bearerPut = (body: unknown) =>
  app.inject({ method: 'PUT', url: '/api/superadmin/billing-gateways', headers: auth(tok.sa), payload: body as any })

function multipartBody(filename: string, mime: string, buf: Buffer) {
  const boundary = '----qaboundary' + crypto.randomBytes(4).toString('hex')
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`)
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return { payload: Buffer.concat([head, buf, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

const BANK = {
  enabled: true, bankName: 'Banco de Chile', accountType: 'Cuenta corriente', accountNumber: '000123456',
  holderName: 'Tribu Box SpA', holderRut: '76.000.000-0', contactEmail: 'pagos@tribu.test', instructions: 'Glosa = referencia',
}

async function setBilling(flow: Record<string, unknown> | null, transfer: Record<string, unknown> | null) {
  const v: Record<string, Record<string, unknown>> = {}
  if (flow) v.flow = flow
  if (transfer) v.transfer = transfer
  await writeBillingGateways(v)
}
const FLOW_ON = { enabled: true, sandbox: true, apiKey: FLOW_KEY, secretKey: FLOW_SECRET }

async function newGymWithSub(slug: string, opts: { country?: string; sub?: { planId: string; status: any; endsAt: Date; startsAt?: Date }; status?: any } = {}) {
  const gym = await prisma.gym.create({
    data: { name: `QA GB ${slug}`, slug: SLUG(slug), status: opts.status ?? 'ACTIVE', country: opts.country ?? 'CL', ownerEmail: `owner-${slug}@test.local` },
  })
  if (opts.sub) {
    await prisma.gymSubscription.create({
      data: { gymId: gym.id, planId: opts.sub.planId, status: opts.sub.status, startsAt: opts.sub.startsAt ?? new Date(Date.now() - 10 * DAY), endsAt: opts.sub.endsAt },
    })
  }
  return gym
}

async function paidPayment(gymId: string, planId: string, amount = 30000) {
  return prisma.gymSubscriptionPayment.create({
    data: { gymId, planId, amount, gateway: 'manual', status: 'PAID', paidAt: new Date() },
  })
}

async function cleanup() {
  const gyms = await prisma.gym.findMany({ where: { slug: { startsWith: 'qa-gb-' } }, select: { id: true } })
  for (const g of gyms) fs.rmSync(path.resolve(process.cwd(), 'uploads', 'gym-billing', g.id), { recursive: true, force: true })
  await prisma.gym.deleteMany({ where: { slug: { startsWith: 'qa-gb-' } } })
  await prisma.fitAppPlan.deleteMany({ where: { slug: { startsWith: 'qa-gb-' } } })
}

beforeAll(async () => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k] }
  await cleanup()
  const s = await prisma.platformSettings.upsert({ where: { id: 'system' }, create: { id: 'system' }, update: {} })
  originalBilling = s.billingGateways

  ids.plan = (await prisma.fitAppPlan.create({ data: { name: 'QA Pro', slug: 'qa-gb-pro', priceCLP: 30000, durationDays: 30 } })).id
  ids.plan2 = (await prisma.fitAppPlan.create({ data: { name: 'QA Elite', slug: 'qa-gb-elite', priceCLP: 50000, durationDays: 60 } })).id
  ids.planInactive = (await prisma.fitAppPlan.create({ data: { name: 'QA Off', slug: 'qa-gb-off', priceCLP: 1000, isActive: false } })).id
  ids.planFree = (await prisma.fitAppPlan.create({ data: { name: 'QA Free', slug: 'qa-gb-free', priceCLP: 0, isFree: true } })).id

  ids.gymA = (await newGymWithSub('a')).id
  ids.gymB = (await newGymWithSub('b')).id
  ids.gymUS = (await newGymWithSub('us', { country: 'US' })).id
  for (const [key, gym] of [['A', ids.gymA], ['B', ids.gymB], ['US', ids.gymUS]] as const) {
    ids['admin' + key] = (await prisma.user.create({ data: { gymId: gym, name: 'Admin ' + key, email: `qa-gb-admin-${key}@test.local`, passwordHash: 'x', role: 'ADMIN' } })).id
  }
  ids.memberA = (await prisma.user.create({ data: { gymId: ids.gymA, name: 'M', email: 'qa-gb-member@test.local', passwordHash: 'x', role: 'MEMBER' } })).id

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
  await app.register(gymBillingRoutes, { prefix: '/api' })
  await app.register(gymPaymentsRoutes, { prefix: '/api' })
  await app.register(platformConfigRoutes, { prefix: '/api' })
  await app.register(gymRoutes, { prefix: '/api' })
  await app.register(mediaRoutes)
  await app.ready()

  const sign = (userId: string, gymId: string | null, role: string) => app.jwt.sign({ userId, gymId, role, email: 'x@test.local' }, { expiresIn: '1h' })
  tok.sa = sign('00000000-0000-0000-0000-000000000001', null, 'SUPER_ADMIN')
  tok.adminA = sign(ids.adminA, ids.gymA, 'ADMIN')
  tok.adminB = sign(ids.adminB, ids.gymB, 'ADMIN')
  tok.adminUS = sign(ids.adminUS, ids.gymUS, 'ADMIN')
  tok.memberA = sign(ids.memberA, ids.gymA, 'MEMBER')
})

afterAll(async () => {
  await cleanup()
  await prisma.platformSettings.update({ where: { id: 'system' }, data: { billingGateways: (originalBilling ?? undefined) as any } })
  if (originalBilling === null) await prisma.$executeRaw`UPDATE "PlatformSettings" SET "billingGateways" = NULL WHERE id = 'system'`
  invalidateBillingConfigCache()
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k] }
  await app.close()
})

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.restoreAllMocks() })

// ─── Unit puros ──────────────────────────────────────────────────────────────

describe('utilidades', () => {
  it('flowSign: HMAC-SHA256 de params ordenados (vector fijo)', () => {
    const expected = crypto.createHmac('sha256', 'sec').update('amount100apiKeyk').digest('hex')
    expect(flowSign({ apiKey: 'k', amount: '100' }, 'sec')).toBe(expected)
  })
  it('generateTransferReference: TB- + 6 caracteres sin ambiguos', () => {
    for (let i = 0; i < 50; i++) expect(generateTransferReference()).toMatch(/^TB-[A-HJ-NP-Z2-9]{6}$/)
  })
})

// ─── Resolver ────────────────────────────────────────────────────────────────

describe('resolver de pasarelas', () => {
  afterEach(() => { for (const k of ENV_KEYS) delete process.env[k] })

  it('la DB manda sobre el env, incluso con enabled:false explícito', async () => {
    process.env.FLOW_API_KEY = 'envk'; process.env.FLOW_SECRET_KEY = 'envs'
    await setBilling({ ...FLOW_ON, enabled: false }, null)
    const cfg = await getBillingGatewayConfig('flow')
    expect(cfg.enabled).toBe(false)
    expect(cfg.source).toBe('db')
  })

  it('sin entrada en DB cae al env (sandbox según FLOW_API_URL)', async () => {
    process.env.FLOW_API_KEY = 'envk'; process.env.FLOW_SECRET_KEY = 'envs'
    await setBilling(null, null)
    process.env.FLOW_API_URL = 'https://www.flow.cl/api'
    let cfg = await getBillingGatewayConfig('flow')
    expect(cfg).toMatchObject({ enabled: true, source: 'env', sandbox: false, apiUrl: 'https://www.flow.cl/api' })
    process.env.FLOW_API_URL = 'https://sandbox.flow.cl/api'
    cfg = await getBillingGatewayConfig('flow')
    expect(cfg.sandbox).toBe(true)
  })

  it('db sandbox:false usa la URL de producción; enabled sin credenciales queda deshabilitado', async () => {
    await setBilling({ ...FLOW_ON, sandbox: false }, null)
    expect((await getBillingGatewayConfig('flow')).apiUrl).toBe('https://www.flow.cl/api')
    await setBilling({ enabled: true, sandbox: true, apiKey: 'solo-key' }, null)
    expect((await getBillingGatewayConfig('flow')).enabled).toBe(false)
  })

  it('Flow solo para país CL; transfer nunca por env; stripe solo por env', async () => {
    await setBilling(FLOW_ON, BANK)
    expect(await listEnabledBillingGateways('CL')).toEqual(['flow', 'transfer'])
    expect(await listEnabledBillingGateways('US')).toEqual(['transfer'])
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    expect(await listEnabledBillingGateways('US')).toEqual(['stripe', 'transfer'])
    await setBilling(null, null)
    delete process.env.STRIPE_SECRET_KEY
    expect(await listEnabledBillingGateways('CL')).toEqual([])
  })
})

// ─── Cifrado en reposo (D1) ──────────────────────────────────────────────────
describe('billingGateways cifrado en reposo', () => {
  it('con SECRETS_ENCRYPTION_KEY la fila en DB no contiene secretos legibles y la API sigue funcionando', async () => {
    const prev = process.env.SECRETS_ENCRYPTION_KEY
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
    try {
      const put = await app.inject({ method: 'PUT', url: '/api/superadmin/billing-gateways', headers: auth(tok.sa),
        payload: { flow: { enabled: true, sandbox: true, apiKey: 'AK-cifrada-1', secretKey: 'SK-cifrada-2' } } as any })
      expect(put.statusCode).toBe(200)
      const raw = await prisma.platformSettings.findUnique({ where: { id: 'system' }, select: { billingGateways: true } })
      const dump = JSON.stringify(raw?.billingGateways)
      expect(dump).toContain('__enc')
      expect(dump).not.toContain('AK-cifrada-1')
      expect(dump).not.toContain('SK-cifrada-2')
      // descifra bien: el GET devuelve la máscara del secreto real
      const get = await app.inject({ method: 'GET', url: '/api/superadmin/billing-gateways', headers: auth(tok.sa) })
      expect(get.statusCode).toBe(200)
      expect(get.json().gateways.flow.secretKey).toBe('••••da-2')
      expect(get.payload).not.toContain('SK-cifrada-2')
    } finally {
      if (prev === undefined) delete process.env.SECRETS_ENCRYPTION_KEY; else process.env.SECRETS_ENCRYPTION_KEY = prev
      invalidateBillingConfigCache()
    }
  })
})

// ─── PUT/GET /superadmin/billing-gateways ────────────────────────────────────

describe('config de pasarelas (superadmin)', () => {
  beforeAll(async () => { await setBilling(null, null) })

  it('ADMIN -> 403, sin token -> 401, COACH/MEMBER -> 403', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/superadmin/billing-gateways', headers: auth(tok.adminA) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PUT', url: '/api/superadmin/billing-gateways', headers: auth(tok.memberA), payload: {} })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/api/superadmin/billing-gateways' })).statusCode).toBe(401)
  })

  it('PUT guarda; respuesta y GET nunca contienen secretos en claro; transfer se muestra tal cual', async () => {
    const put = await bearerPut({ flow: FLOW_ON, transfer: BANK })
    expect(put.statusCode).toBe(200)
    const get = await app.inject({ method: 'GET', url: '/api/superadmin/billing-gateways', headers: auth(tok.sa) })
    for (const res of [put, get]) {
      expect(res.payload).not.toContain(FLOW_KEY)
      expect(res.payload).not.toContain(FLOW_SECRET)
      const b = res.json()
      expect(b.gateways.flow.apiKey).toBe('••••1234')
      expect(b.gateways.flow.secretKey).toBe('••••5678')
      expect(b.gateways.transfer.accountNumber).toBe('000123456')
      expect(b.source).toMatchObject({ flow: 'db', transfer: 'db' })
    }
    // el resolver (servidor) sí lee el valor real
    expect((await getBillingGatewayConfig('flow')).apiKey).toBe(FLOW_KEY)
  })

  it('reenviar el valor enmascarado conserva el secreto; null lo borra', async () => {
    await bearerPut({ flow: { apiKey: '••••1234', secretKey: '••••5678', sandbox: false } })
    expect((await getBillingGatewayConfig('flow'))).toMatchObject({ apiKey: FLOW_KEY, secretKey: FLOW_SECRET, sandbox: false })
    const del = await bearerPut({ flow: { enabled: false, secretKey: null } })
    expect(del.statusCode).toBe(200)
    expect((await getBillingGatewayConfig('flow')).secretKey).toBeUndefined()
  })

  it('enabled:true sin credenciales -> 422 con missing[]', async () => {
    const res = await bearerPut({ flow: { enabled: true } })
    expect(res.statusCode).toBe(422)
    expect(res.json().missing).toContain('flow.secretKey')
    const t = await bearerPut({ transfer: { enabled: true, bankName: null, accountNumber: null, holderName: null, holderRut: null } })
    expect(t.statusCode).toBe(422)
    expect(t.json().missing).toEqual(expect.arrayContaining(['transfer.bankName', 'transfer.holderRut']))
  })

  it('banco y tipo de cuenta son lista cerrada: texto libre -> 400; GET expone las opciones', async () => {
    expect((await bearerPut({ transfer: { bankName: 'Banco Inventado' } })).statusCode).toBe(400)
    expect((await bearerPut({ transfer: { accountType: 'Cuenta Premium' } })).statusCode).toBe(400)
    expect((await bearerPut({ transfer: { bankName: 'BancoEstado', accountType: 'Cuenta RUT' } })).statusCode).toBe(200)
    const view = (await app.inject({ method: 'GET', url: '/api/superadmin/billing-gateways', headers: auth(tok.sa) })).json()
    expect(view.options.banks).toContain('Banco de Chile')
    expect(view.options.accountTypes).toContain('Cuenta vista')
  })

  it('body inválido (stripe no se configura por DB, campos desconocidos, tipos) -> 400', async () => {
    expect((await bearerPut({ stripe: { enabled: true } })).statusCode).toBe(400)
    expect((await bearerPut({ flow: { enabled: 'si' } })).statusCode).toBe(400)
    expect((await bearerPut({ flow: { apiKey: 123 } })).statusCode).toBe(400)
  })

  it('GET/PATCH /superadmin/config ya no incluyen billingGateways ni secretos', async () => {
    await bearerPut({ flow: { ...FLOW_ON, enabled: true, secretKey: FLOW_SECRET } })
    const get = await app.inject({ method: 'GET', url: '/api/superadmin/config', headers: auth(tok.sa) })
    expect(get.statusCode).toBe(200)
    expect(get.json()).not.toHaveProperty('billingGateways')
    expect(get.payload).not.toContain(FLOW_SECRET)
    const patch = await app.inject({ method: 'PATCH', url: '/api/superadmin/config', headers: auth(tok.sa), payload: { subExpiryReminderDays: 7 } })
    expect(patch.json()).not.toHaveProperty('billingGateways')
    expect(patch.payload).not.toContain(FLOW_SECRET)
  })
})

// ─── GET /gyms/me/billing/gateways ───────────────────────────────────────────

describe('GET /gyms/me/billing/gateways', () => {
  beforeAll(async () => { await setBilling(FLOW_ON, BANK) })

  it('lista solo habilitadas, con datos bancarios y sin secretos', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gyms/me/billing/gateways', headers: auth(tok.adminA) })
    expect(res.statusCode).toBe(200)
    const list = res.json().gateways
    expect(list.map((g: any) => g.gateway)).toEqual(['flow', 'transfer'])
    expect(list[1].transfer.accountNumber).toBe('000123456')
    expect(res.payload).not.toContain(FLOW_KEY)
    expect(res.payload).not.toContain(FLOW_SECRET)
    expect(res.payload).not.toMatch(/apiKey|secretKey/)
  })

  it('gym de país no-CL no ve Flow', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gyms/me/billing/gateways', headers: auth(tok.adminUS) })
    expect(res.json().gateways.map((g: any) => g.gateway)).toEqual(['transfer'])
  })

  it('pasarela deshabilitada no aparece', async () => {
    await setBilling(FLOW_ON, { ...BANK, enabled: false })
    const res = await app.inject({ method: 'GET', url: '/api/gyms/me/billing/gateways', headers: auth(tok.adminA) })
    expect(res.json().gateways.map((g: any) => g.gateway)).toEqual(['flow'])
    await setBilling(FLOW_ON, BANK)
  })

  it('SUPER_ADMIN sin gymId -> 400; MEMBER -> 403; sin token -> 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/gyms/me/billing/gateways', headers: auth(tok.sa) })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/gyms/me/billing/gateways', headers: auth(tok.memberA) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/api/gyms/me/billing/gateways' })).statusCode).toBe(401)
  })
})

// ─── Checkout ────────────────────────────────────────────────────────────────

const checkout = (token: string, body: unknown) =>
  app.inject({ method: 'POST', url: '/api/gyms/me/subscription/checkout', headers: auth(token), payload: body as any })

describe('POST /gyms/me/subscription/checkout', () => {
  beforeAll(async () => { await setBilling(FLOW_ON, BANK) })

  it('validaciones: body inválido 400, pasarela inactiva 400, plan inexistente/inactivo 404, plan gratuito 422', async () => {
    expect((await checkout(tok.adminA, { planId: 'no-uuid', gateway: 'flow' })).statusCode).toBe(400)
    expect((await checkout(tok.adminA, { planId: ids.plan })).statusCode).toBe(400)
    expect((await checkout(tok.adminA, { planId: ids.plan, gateway: 'paypal' })).statusCode).toBe(400)
    // stripe sin STRIPE_SECRET_KEY
    expect((await checkout(tok.adminA, { planId: ids.plan, gateway: 'stripe' })).json().error).toBe('Pasarela no disponible')
    // Flow no permitida en gym US
    expect((await checkout(tok.adminUS, { planId: ids.plan, gateway: 'flow' })).statusCode).toBe(400)
    expect((await checkout(tok.adminA, { planId: crypto.randomUUID(), gateway: 'transfer' })).statusCode).toBe(404)
    expect((await checkout(tok.adminA, { planId: ids.planInactive, gateway: 'transfer' })).statusCode).toBe(404)
    expect((await checkout(tok.adminA, { planId: ids.planFree, gateway: 'transfer' })).statusCode).toBe(422)
    expect((await checkout(tok.memberA, { planId: ids.plan, gateway: 'transfer' })).statusCode).toBe(403)
    expect((await checkout(tok.sa, { planId: ids.plan, gateway: 'transfer' })).statusCode).toBe(400)
  })

  it('transferencia: monto del plan (ignora el del body), referencia, y duplicado devuelve la misma', async () => {
    const a = await checkout(tok.adminB, { planId: ids.plan, gateway: 'transfer', amount: 1, gymId: ids.gymA })
    expect(a.statusCode).toBe(200)
    const body = a.json()
    expect(body).toMatchObject({ type: 'transfer', amountCLP: 30000 })
    expect(body.reference).toMatch(/^TB-/)
    expect(body.bank.accountNumber).toBe('000123456')
    const row = await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: body.paymentId } })
    expect(row).toMatchObject({ gymId: ids.gymB, amount: 30000, status: 'PENDING', gateway: 'transfer', gatewayOrderId: body.reference })

    const b = await checkout(tok.adminB, { planId: ids.plan, gateway: 'transfer' })
    expect(b.json().paymentId).toBe(body.paymentId)
    // concurrentes: una sola fila nueva por plan2
    const [c, d] = await Promise.all([
      checkout(tok.adminB, { planId: ids.plan2, gateway: 'transfer' }),
      checkout(tok.adminB, { planId: ids.plan2, gateway: 'transfer' }),
    ])
    expect(c.json().paymentId).toBe(d.json().paymentId)
    expect(await prisma.gymSubscriptionPayment.count({ where: { gymId: ids.gymB, planId: ids.plan2 } })).toBe(1)
  })

  it('Flow: crea pago PENDING, firma HMAC, urlConfirmation al endpoint nuevo y devuelve redirect', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ token: 'TOK-CHK-1', url: 'https://sandbox.flow.cl/app/web/pay.php', flowOrder: 999 }),
    } as any)
    const res = await checkout(tok.adminA, { planId: ids.plan, gateway: 'flow', amount: 5 })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.type).toBe('redirect')
    expect(body.url).toBe('https://sandbox.flow.cl/app/web/pay.php?token=TOK-CHK-1')

    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, any]
    expect(calledUrl).toBe('https://sandbox.flow.cl/api/payment/create')
    const sent = Object.fromEntries(new URLSearchParams(init.body as string))
    const { s, ...rest } = sent
    expect(s).toBe(flowSign(rest, FLOW_SECRET))
    expect(sent.amount).toBe('30000')
    expect(sent.currency).toBe('CLP')
    expect(sent.email).toBe('owner-a@test.local')
    expect(sent.urlConfirmation).toMatch(/\/api\/gym-billing\/flow\/confirm$/)
    expect(sent.commerceOrder).toBe(`SUB-${body.paymentId}`)

    const row = await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: body.paymentId } })
    expect(row).toMatchObject({ status: 'PENDING', gateway: 'flow', amount: 30000, gatewayOrderId: `SUB-${body.paymentId}` })
    expect(row.gatewayData).toEqual({ token: 'TOK-CHK-1', flowOrder: 999, sandbox: true })
    expect(JSON.stringify(row.gatewayData)).not.toContain(FLOW_SECRET)
  })

  it('Flow caído/rechaza -> 502 y el pago queda FAILED', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ code: 105, message: 'bad' }) } as any)
    const res = await checkout(tok.adminA, { planId: ids.plan2, gateway: 'flow' })
    expect(res.statusCode).toBe(502)
    expect(res.payload).not.toContain('bad')
    const failed = await prisma.gymSubscriptionPayment.findFirst({ where: { gymId: ids.gymA, planId: ids.plan2, gateway: 'flow' } })
    expect(failed?.status).toBe('FAILED')
  })
})

// ─── Flow confirm ────────────────────────────────────────────────────────────

describe('POST /gym-billing/flow/confirm', () => {
  let paymentId: string
  const TOKEN = 'TOK-CONFIRM-1'

  const confirm = (token?: string, url = '/api/gym-billing/flow/confirm') =>
    app.inject({
      method: 'POST', url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: token === undefined ? '' : `token=${encodeURIComponent(token)}`,
    })
  const flowStatus = (over: Record<string, unknown> = {}) =>
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ status: 2, commerceOrder: `SUB-${paymentId}`, amount: '30000', currency: 'CLP', flowOrder: 77, ...over }),
    } as any)

  beforeAll(async () => {
    await setBilling(FLOW_ON, BANK)
    const gym = await newGymWithSub('flowconf', { sub: { planId: ids.plan, status: 'EXPIRED', endsAt: new Date(Date.now() - 2 * DAY) }, status: 'SUSPENDED' })
    ids.gymFlow = gym.id
  })
  beforeEach(async () => {
    const p = await prisma.gymSubscriptionPayment.create({
      data: {
        gymId: ids.gymFlow, planId: ids.plan, amount: 30000, gateway: 'flow', status: 'PENDING',
        gatewayData: { token: TOKEN + Math.random(), sandbox: true },
      },
    })
    paymentId = p.id
    await prisma.gymSubscriptionPayment.update({ where: { id: p.id }, data: { gatewayOrderId: `SUB-${p.id}` } })
  })

  const tokenOf = async () => ((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })).gatewayData as any).token as string

  it('sin token -> 400', async () => {
    expect((await confirm()).statusCode).toBe(400)
  })

  it('token desconocido -> 200 sin efecto y sin llamar a Flow', async () => {
    const spy = flowStatus()
    const res = await confirm('NO-EXISTE')
    expect(res.statusCode).toBe(200)
    expect(spy).not.toHaveBeenCalled()
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING')
  })

  it('token válido activa UNA vez (firma de getStatus válida, gym SUSPENDED -> ACTIVE); el reintento es no-op', async () => {
    const token = await tokenOf()
    const spy = flowStatus()
    const subsBefore = await prisma.gymSubscription.count({ where: { gymId: ids.gymFlow } })

    const r1 = await confirm(token)
    expect(r1.statusCode).toBe(200)
    expect(r1.json().activated).toBe(true)

    const qs = new URL(spy.mock.calls[0][0] as string).searchParams
    const params = { apiKey: FLOW_KEY, token }
    expect(qs.get('s')).toBe(flowSign(params, FLOW_SECRET))

    const pay = await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })
    expect(pay.status).toBe('PAID')
    expect(pay.subscriptionId).toBeTruthy()
    expect((await prisma.gym.findUniqueOrThrow({ where: { id: ids.gymFlow } })).status).toBe('ACTIVE')
    expect(await prisma.gymSubscription.count({ where: { gymId: ids.gymFlow } })).toBe(subsBefore + 1)

    const r2 = await confirm(token)
    expect(r2.statusCode).toBe(200)
    expect(r2.json().activated).toBe(false)
    expect(await prisma.gymSubscription.count({ where: { gymId: ids.gymFlow } })).toBe(subsBefore + 1)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('dos confirmaciones simultáneas activan una sola vez', async () => {
    const token = await tokenOf()
    flowStatus()
    const before = await prisma.gymSubscription.count({ where: { gymId: ids.gymFlow } })
    const [a, b] = await Promise.all([confirm(token), confirm(token)])
    expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    expect(await prisma.gymSubscription.count({ where: { gymId: ids.gymFlow } })).toBe(before + 1)
  })

  it('monto, moneda, commerceOrder o status distintos -> no activa', async () => {
    const token = await tokenOf()
    for (const over of [{ amount: '1' }, { currency: 'USD' }, { commerceOrder: 'SUB-otra' }, { status: 1 }, { status: 3 }]) {
      flowStatus(over)
      const res = await confirm(token)
      expect(res.statusCode).toBe(200)
      expect(res.json().activated).toBe(false)
    }
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING')
  })

  it('Flow no responde -> 502 (Flow reintentará) y el pago sigue PENDING', async () => {
    const token = await tokenOf()
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET /home/secret/path.ts'))
    const res = await confirm(token)
    expect(res.statusCode).toBe(502)
    expect(res.payload).not.toContain('/home/')
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING')
  })

  it('el alias /superadmin/gym-payments/flow/confirm sigue funcionando', async () => {
    const token = await tokenOf()
    flowStatus()
    const res = await confirm(token, '/api/superadmin/gym-payments/flow/confirm')
    expect(res.statusCode).toBe(200)
    expect(res.json().activated).toBe(true)
  })

  it('/flow/create fue retirado', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/superadmin/gym-payments/flow/create', headers: auth(tok.sa), payload: {} })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Activación compartida ───────────────────────────────────────────────────

describe('activateGymSubscriptionFromPayment', () => {
  it('extiende desde el endsAt vigente (pago por adelantado) y cambia de plan; la anterior queda CANCELLED', async () => {
    const endsAt = new Date(Date.now() + 10 * DAY)
    const gym = await newGymWithSub('act1', { sub: { planId: ids.plan, status: 'ACTIVE', endsAt } })
    const pay = await paidPayment(gym.id, ids.plan2, 50000)
    const sub = await activateGymSubscriptionFromPayment(pay.id)

    expect(sub.planId).toBe(ids.plan2)
    expect(sub.status).toBe('ACTIVE')
    expect(sub.startsAt.getTime()).toBe(endsAt.getTime())
    expect(sub.endsAt.getTime()).toBe(endsAt.getTime() + 60 * DAY)
    const subs = await prisma.gymSubscription.findMany({ where: { gymId: gym.id } })
    expect(subs).toHaveLength(2)
    expect(subs.filter(s => s.status === 'ACTIVE')).toHaveLength(1)
    expect(subs.filter(s => s.status === 'CANCELLED')).toHaveLength(1)
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: pay.id } })).subscriptionId).toBe(sub.id)
  })

  it('sub vencida -> empieza desde ahora; gym SUSPENDED pasa a ACTIVE', async () => {
    const gym = await newGymWithSub('act2', { sub: { planId: ids.plan, status: 'EXPIRED', endsAt: new Date(Date.now() - 5 * DAY) }, status: 'SUSPENDED' })
    const pay = await paidPayment(gym.id, ids.plan)
    const before = Date.now()
    const sub = await activateGymSubscriptionFromPayment(pay.id)
    expect(sub.startsAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(Math.round((sub.endsAt.getTime() - sub.startsAt.getTime()) / DAY)).toBe(30)
    expect((await prisma.gym.findUniqueOrThrow({ where: { id: gym.id } })).status).toBe('ACTIVE')
  })

  it('doble llamada no duplica la suscripción; un pago no PAID no activa', async () => {
    const gym = await newGymWithSub('act3')
    const pay = await paidPayment(gym.id, ids.plan)
    const [a, b] = await Promise.allSettled([activateGymSubscriptionFromPayment(pay.id), activateGymSubscriptionFromPayment(pay.id)])
    expect(a.status === 'fulfilled' || b.status === 'fulfilled').toBe(true)
    await activateGymSubscriptionFromPayment(pay.id).catch(() => {})
    expect(await prisma.gymSubscription.count({ where: { gymId: gym.id } })).toBe(1)

    const pending = await prisma.gymSubscriptionPayment.create({ data: { gymId: gym.id, planId: ids.plan, amount: 1, gateway: 'transfer', status: 'PENDING' } })
    await expect(activateGymSubscriptionFromPayment(pending.id)).rejects.toThrow()
  })

  it('GET /gyms/me/subscription refleja el plan nuevo tras renovar', async () => {
    const gym = await newGymWithSub('act4', { sub: { planId: ids.plan, status: 'ACTIVE', endsAt: new Date(Date.now() + 5 * DAY) } })
    const admin = await prisma.user.create({ data: { gymId: gym.id, name: 'A4', email: 'qa-gb-a4@test.local', passwordHash: 'x', role: 'ADMIN' } })
    const t = app.jwt.sign({ userId: admin.id, gymId: gym.id, role: 'ADMIN' }, { expiresIn: '1h' })
    await activateGymSubscriptionFromPayment((await paidPayment(gym.id, ids.plan2, 50000)).id)
    const res = await app.inject({ method: 'GET', url: '/api/gyms/me/subscription', headers: auth(t) })
    expect(res.json().subscription.planId).toBe(ids.plan2)
    expect(res.json().daysLeft).toBeGreaterThan(60)
  })
})

// ─── Stripe (webhook checkout.session.completed de suscripción) ──────────────

describe('activateGymSubscriptionFromStripe (webhook)', () => {
  async function stripePending(gymId: string, planId = ids.plan, amount = 30000) {
    const sessionId = 'cs_test_' + crypto.randomBytes(5).toString('hex')
    const p = await prisma.gymSubscriptionPayment.create({ data: { gymId, planId, amount, gateway: 'stripe', gatewayOrderId: sessionId, status: 'PENDING' } })
    return { p, sessionId }
  }

  it('activa una vez; el evento duplicado de Stripe es no-op', async () => {
    const gym = await newGymWithSub('stripe1')
    const { p, sessionId } = await stripePending(gym.id)
    await activateGymSubscriptionFromStripe(gym.id, ids.plan, sessionId, p.id, 30000)
    await activateGymSubscriptionFromStripe(gym.id, ids.plan, sessionId, p.id, 30000)
    expect(await prisma.gymSubscription.count({ where: { gymId: gym.id } })).toBe(1)
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PAID')
  })

  it('metadata con gymId incorrecto (otro gym) no activa nada', async () => {
    const gym = await newGymWithSub('stripe2')
    const other = await newGymWithSub('stripe3')
    const { p, sessionId } = await stripePending(gym.id)
    await activateGymSubscriptionFromStripe(other.id, ids.plan, sessionId, p.id, 30000)
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING')
    expect(await prisma.gymSubscription.count({ where: { gymId: { in: [gym.id, other.id] } } })).toBe(0)
  })

  it('monto de la sesión distinto al del pago no activa', async () => {
    const gym = await newGymWithSub('stripe4')
    const { p, sessionId } = await stripePending(gym.id)
    await activateGymSubscriptionFromStripe(gym.id, ids.plan, sessionId, p.id, 100)
    expect((await prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING')
  })

  it('sesión legacy sin paymentId: registra el pago y activa una sola vez', async () => {
    const gym = await newGymWithSub('stripe5')
    await activateGymSubscriptionFromStripe(gym.id, ids.plan, 'cs_legacy_1', undefined, 30000)
    await activateGymSubscriptionFromStripe(gym.id, ids.plan, 'cs_legacy_1', undefined, 30000)
    expect(await prisma.gymSubscription.count({ where: { gymId: gym.id } })).toBe(1)
    expect(await prisma.gymSubscriptionPayment.count({ where: { gymId: gym.id, gateway: 'stripe' } })).toBe(1)
  })
})

// ─── Transferencia: comprobante, confirmar, rechazar, expirar ────────────────

describe('transferencia de suscripción', () => {
  let paymentId: string
  const receiptUrl = (id: string) => `/api/gyms/me/subscription/payments/${id}/receipt`
  const upload = (token: string, id: string, filename: string, mime: string, buf: Buffer) => {
    const m = multipartBody(filename, mime, buf)
    return app.inject({ method: 'POST', url: receiptUrl(id), headers: { ...auth(token), ...m.headers }, payload: m.payload })
  }

  beforeAll(async () => {
    await setBilling(FLOW_ON, BANK)
    const gym = await newGymWithSub('tr', { sub: { planId: ids.plan, status: 'EXPIRED', endsAt: new Date(Date.now() - DAY) } })
    ids.gymTr = gym.id
    ids.adminTr = (await prisma.user.create({ data: { gymId: gym.id, name: 'ATr', email: 'qa-gb-atr@test.local', passwordHash: 'x', role: 'ADMIN' } })).id
    tok.adminTr = app.jwt.sign({ userId: ids.adminTr, gymId: gym.id, role: 'ADMIN' }, { expiresIn: '1h' })
  })

  const newTransfer = async (planId = ids.plan) => {
    await prisma.gymSubscriptionPayment.deleteMany({ where: { gymId: ids.gymTr, gateway: 'transfer', status: 'PENDING' } })
    const r = await checkout(tok.adminTr, { planId, gateway: 'transfer' })
    return r.json().paymentId as string
  }
  beforeEach(async () => { paymentId = await newTransfer() })

  it('sube comprobante PNG válido: guarda archivo en uploads/gym-billing/<gymId>/ y setea receiptUrl', async () => {
    const res = await upload(tok.adminTr, paymentId, 'comp.png', 'image/png', PNG)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ paymentId, status: 'PENDING' })
    expect(res.json().receiptUrl).toMatch(new RegExp(`^/uploads/gym-billing/${ids.gymTr}/${paymentId}-[0-9a-f]{12}\\.png$`))
    const file = path.resolve(process.cwd(), res.json().receiptUrl.replace(/^\//, ''))
    expect(fs.existsSync(file)).toBe(true)
  })

  it('comprobante de pago de OTRO gym -> 404 (igual que inexistente); sin archivo -> 400', async () => {
    expect((await upload(tok.adminB, paymentId, 'comp.png', 'image/png', PNG)).statusCode).toBe(404)
    expect((await upload(tok.adminTr, crypto.randomUUID(), 'comp.png', 'image/png', PNG)).statusCode).toBe(404)
    const noFile = await app.inject({ method: 'POST', url: receiptUrl(paymentId), headers: auth(tok.adminTr), payload: {} })
    expect(noFile.statusCode).toBe(400)
    expect(noFile.payload).not.toMatch(/\.ts:\d+|node_modules/)
  })

  it('tipo inválido (texto renombrado a .png) -> 415; >5MB -> 413', async () => {
    expect((await upload(tok.adminTr, paymentId, 'x.png', 'image/png', Buffer.from('esto es texto, no una imagen'))).statusCode).toBe(415)
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)])
    expect((await upload(tok.adminTr, paymentId, 'big.png', 'image/png', big)).statusCode).toBe(413)
  })

  it('pago ya no PENDING -> 409', async () => {
    await prisma.gymSubscriptionPayment.update({ where: { id: paymentId }, data: { status: 'FAILED' } })
    expect((await upload(tok.adminTr, paymentId, 'comp.png', 'image/png', PNG)).statusCode).toBe(409)
  })

  it('SUPER_ADMIN ve el comprobante con token de medios; admin de otro gym no; el dueño sí; sin token 401', async () => {
    const up = await upload(tok.adminTr, paymentId, 'comp.pdf', 'application/pdf', Buffer.from('%PDF-1.4 fake'))
    expect(up.statusCode).toBe(200)
    const url: string = up.json().receiptUrl
    const mediaSA = signMediaToken(app, { userId: '00000000-0000-0000-0000-000000000001', gymId: null, role: 'SUPER_ADMIN' })
    const mediaOwn = signMediaToken(app, { userId: ids.adminTr, gymId: ids.gymTr, role: 'ADMIN' })
    const mediaOther = signMediaToken(app, { userId: ids.adminB, gymId: ids.gymB, role: 'ADMIN' })
    const get = (t?: string) => app.inject({ method: 'GET', url: t ? `${url}?t=${t}` : url })
    const sa = await get(mediaSA)
    expect(sa.statusCode).toBe(200)
    expect(sa.headers['content-type']).toBe('application/pdf')
    expect((await get(mediaOwn)).statusCode).toBe(200)
    expect((await get(mediaOther)).statusCode).toBe(404)
    expect((await get()).statusCode).toBe(401)
  })

  it('cola superadmin: filtro hasReceipt y sin gatewayData', async () => {
    await upload(tok.adminTr, paymentId, 'comp.png', 'image/png', PNG)
    const res = await app.inject({ method: 'GET', url: `/api/superadmin/gym-payments?gateway=transfer&status=PENDING&hasReceipt=true&gymId=${ids.gymTr}`, headers: auth(tok.sa) })
    expect(res.statusCode).toBe(200)
    expect(res.json().payments.map((p: any) => p.id)).toContain(paymentId)
    expect(res.json().payments[0].receiptUrl).toBeTruthy()
    expect(res.json().payments[0]).not.toHaveProperty('gatewayData')
    const none = await app.inject({ method: 'GET', url: `/api/superadmin/gym-payments?hasReceipt=false&gateway=transfer&gymId=${ids.gymTr}`, headers: auth(tok.sa) })
    expect(none.json().payments.map((p: any) => p.id)).not.toContain(paymentId)
    expect((await app.inject({ method: 'GET', url: '/api/superadmin/gym-payments?status=XX', headers: auth(tok.sa) })).statusCode).toBe(400)
  })

  const sa = (action: 'confirm' | 'reject', id: string, payload: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/superadmin/gym-payments/${id}/${action}`, headers: auth(tok.sa), payload: payload as any })

  it('confirm: PAID + suscripción activa del plan pagado; doble confirm -> 409; admin no puede (403); simultáneos: uno solo', async () => {
    const id = await newTransfer(ids.plan2)
    const forbidden = await app.inject({ method: 'POST', url: `/api/superadmin/gym-payments/${id}/confirm`, headers: auth(tok.adminTr), payload: {} })
    expect(forbidden.statusCode).toBe(403)

    const before = await prisma.gymSubscription.count({ where: { gymId: ids.gymTr } })
    const ok = await sa('confirm', id, { notes: 'visto en cartola' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ status: 'PAID', confirmedById: '00000000-0000-0000-0000-000000000001', notes: 'visto en cartola' })
    expect(ok.json().subscriptionId).toBeTruthy()
    expect(await prisma.gymSubscription.count({ where: { gymId: ids.gymTr } })).toBe(before + 1)
    const sub = await prisma.gymSubscription.findUniqueOrThrow({ where: { id: ok.json().subscriptionId } })
    expect(sub).toMatchObject({ planId: ids.plan2, status: 'ACTIVE' })

    const again = await sa('confirm', id)
    expect(again.statusCode).toBe(409)
    expect(await prisma.gymSubscription.count({ where: { gymId: ids.gymTr } })).toBe(before + 1)
    expect((await sa('confirm', crypto.randomUUID())).statusCode).toBe(404)
    // confirmaciones simultáneas: una sola activa
    const id2 = await newTransfer()
    const [a, b] = await Promise.all([sa('confirm', id2), sa('confirm', id2)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })

  it('reject: FAILED + motivo, no activa; motivo corto -> 400; rechazar dos veces -> 409; el admin puede reintentar', async () => {
    const before = await prisma.gymSubscription.count({ where: { gymId: ids.gymTr } })
    expect((await sa('reject', paymentId, { reason: 'x' })).statusCode).toBe(400)
    const res = await sa('reject', paymentId, { reason: 'Comprobante ilegible' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'FAILED', rejectionReason: 'Comprobante ilegible' })
    expect(await prisma.gymSubscription.count({ where: { gymId: ids.gymTr } })).toBe(before)
    expect((await sa('reject', paymentId, { reason: 'otra vez' })).statusCode).toBe(409)
    const retry = await checkout(tok.adminTr, { planId: ids.plan, gateway: 'transfer' })
    expect(retry.json().paymentId).not.toBe(paymentId)

    const list = await app.inject({ method: 'GET', url: '/api/gyms/me/subscription/payments', headers: auth(tok.adminTr) })
    const row = list.json().payments.find((p: any) => p.id === paymentId)
    expect(row).toMatchObject({ status: 'FAILED', rejectionReason: 'Comprobante ilegible', hasReceipt: false })
  })

  it('confirm/reject sobre un pago que no es transferencia -> 409', async () => {
    const p = await prisma.gymSubscriptionPayment.create({ data: { gymId: ids.gymTr, planId: ids.plan, amount: 1, gateway: 'flow', status: 'PENDING' } })
    expect((await sa('confirm', p.id)).statusCode).toBe(409)
    expect((await sa('reject', p.id, { reason: 'motivo' })).statusCode).toBe(409)
  })

  it('cron: expira PENDING sin comprobante >7 días; respeta las con comprobante y las recientes', async () => {
    const gym = await newGymWithSub('exp')
    const mk = (data: Record<string, unknown>) => prisma.gymSubscriptionPayment.create({
      data: { gymId: gym.id, planId: ids.plan, amount: 1, gateway: 'transfer', status: 'PENDING', ...data } as any,
    })
    const old = await mk({ createdAt: new Date(Date.now() - 8 * DAY) })
    const oldWithReceipt = await mk({ createdAt: new Date(Date.now() - 8 * DAY), receiptUrl: '/uploads/gym-billing/x/y.png' })
    const fresh = await mk({ createdAt: new Date(Date.now() - 2 * DAY) })
    const oldFlow = await mk({ createdAt: new Date(Date.now() - 8 * DAY), gateway: 'flow' })

    expect(await expireStaleTransferPayments()).toBeGreaterThanOrEqual(1)
    const get = (id: string) => prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id } })
    expect(await get(old.id)).toMatchObject({ status: 'FAILED' })
    expect((await get(old.id)).rejectionReason).toMatch(/Expirada/)
    expect((await get(oldWithReceipt.id)).status).toBe('PENDING')
    expect((await get(fresh.id)).status).toBe('PENDING')
    expect((await get(oldFlow.id)).status).toBe('PENDING')
  })
})

// ─── Manual / refund / RLS ───────────────────────────────────────────────────

describe('pago manual y reembolso (superadmin)', () => {
  it('manual valida gym y plan, y activa la suscripción de verdad', async () => {
    const gym = await newGymWithSub('man', { status: 'SUSPENDED' })
    const bad = await app.inject({ method: 'POST', url: '/api/superadmin/gym-payments/manual', headers: auth(tok.sa), payload: { gymId: gym.id, planId: crypto.randomUUID(), amount: 100 } })
    expect(bad.statusCode).toBe(404)
    const nogym = await app.inject({ method: 'POST', url: '/api/superadmin/gym-payments/manual', headers: auth(tok.sa), payload: { gymId: crypto.randomUUID(), planId: ids.plan, amount: 100 } })
    expect(nogym.statusCode).toBe(404)
    const ok = await app.inject({ method: 'POST', url: '/api/superadmin/gym-payments/manual', headers: auth(tok.sa), payload: { gymId: gym.id, planId: ids.plan, amount: 30000 } })
    expect(ok.statusCode).toBe(201)
    expect(ok.json().subscriptionId).toBeTruthy()
    expect((await prisma.gym.findUniqueOrThrow({ where: { id: gym.id } })).status).toBe('ACTIVE')
    expect(await prisma.gymSubscription.count({ where: { gymId: gym.id, status: 'ACTIVE' } })).toBe(1)

    const refund = await app.inject({ method: 'PATCH', url: `/api/superadmin/gym-payments/${ok.json().id}/refund`, headers: auth(tok.sa) })
    expect(refund.json().status).toBe('REFUNDED')
    expect((await app.inject({ method: 'PATCH', url: `/api/superadmin/gym-payments/${ok.json().id}/refund`, headers: auth(tok.sa) })).statusCode).toBe(409)
  })

  it('refund de un pago PENDING -> 409; inexistente -> 404', async () => {
    const gym = await newGymWithSub('ref')
    const p = await prisma.gymSubscriptionPayment.create({ data: { gymId: gym.id, planId: ids.plan, amount: 1, gateway: 'transfer', status: 'PENDING' } })
    expect((await app.inject({ method: 'PATCH', url: `/api/superadmin/gym-payments/${p.id}/refund`, headers: auth(tok.sa) })).statusCode).toBe(409)
    expect((await app.inject({ method: 'PATCH', url: `/api/superadmin/gym-payments/${crypto.randomUUID()}/refund`, headers: auth(tok.sa) })).statusCode).toBe(404)
  })

  it('gateways/:gymId usa el resolver (+ manual)', async () => {
    await setBilling(FLOW_ON, BANK)
    const res = await app.inject({ method: 'GET', url: `/api/superadmin/gym-payments/gateways/${ids.gymA}`, headers: auth(tok.sa) })
    expect(res.json().gateways).toEqual(['manual', 'flow', 'transfer'])
  })
})

describe('RLS: pagos de suscripción', () => {
  it('el admin del gym B no ve los pagos del gym A en /gyms/me/subscription/payments', async () => {
    await setBilling(FLOW_ON, BANK)
    const a = await checkout(tok.adminA, { planId: ids.plan, gateway: 'transfer' })
    const aId = a.json().paymentId
    const resB = await app.inject({ method: 'GET', url: '/api/gyms/me/subscription/payments', headers: auth(tok.adminB) })
    expect(resB.statusCode).toBe(200)
    expect(resB.json().payments.map((p: any) => p.id)).not.toContain(aId)
    expect(resB.payload).not.toContain('gatewayData')
    const resA = await app.inject({ method: 'GET', url: '/api/gyms/me/subscription/payments', headers: auth(tok.adminA) })
    expect(resA.json().payments.map((p: any) => p.id)).toContain(aId)
    expect((await app.inject({ method: 'GET', url: '/api/gyms/me/subscription/payments', headers: auth(tok.sa) })).statusCode).toBe(400)
  })
})
