/**
 * fintoc.integration.test.ts
 *
 * Tests de integración para los 7 endpoints de Fintoc (conciliación bancaria).
 *
 * Flujo que cubre:
 *   1. POST /payments/fintoc/link    — upsert del link Fintoc por gym
 *   2. GET  /payments/fintoc/status  — estado de conexión + conteos
 *   3. POST /payments/fintoc/sync    — importa movimientos, idempotencia, matcher
 *   4. GET  /payments/fintoc/movements — lista con filtros y paginación
 *   5. PATCH /payments/fintoc/movements/:id/confirm — confirma movimiento
 *   6. PATCH /payments/fintoc/movements/:id/reject  — rechaza movimiento
 *   7. POST /payments/webhook/fintoc — webhook HMAC-SHA256
 *
 * Estrategia:
 *   - DB real (Postgres en Docker). No se mockea Prisma.
 *   - Fastify.inject() — sin levantar puerto real.
 *   - Gyms A y B para aislamiento cross-gym.
 *   - Cleanup completo en afterAll, ordenado por FK.
 *
 * Gotchas documentados:
 *   - importFintocMovements lanza "No hay link Fintoc configurado" si no existe FintocLink.
 *   - confirmBankMovement llama confirmTransfer internamente, que requiere membership.transferStatus === 'PENDING_REVIEW'.
 *   - El matcher Fase 1 (exact_rut) llama a confirmTransfer y pone reconciliationStatus='CONFIRMED'.
 *   - El matcher Fase 2 (amount_only) solo pone MATCHED, no confirma la membresía.
 *   - rejectBankMovement añade prefix "[RECHAZADO] " a la description si se pasa reason.
 *   - El webhook NO requiere JWT. gymId viene en body.gymId o body.metadata.gymId.
 *   - La firma HMAC se valida solo si el header fintoc-signature está presente.
 *     Si NO hay firma → pasa (modo sin secret). Si hay firma + secret → debe coincidir.
 */

import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { paymentRoutes } from '../payments.routes'
import { prisma } from '../../../lib/prisma'
import {
  saveFintocLink,
  importFintocMovements,
} from '../payments.service'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-fintoc-gym-a'
const GYM_B_SLUG = 'qa-fintoc-gym-b'

// IDs creados en setup
let gymAId: string
let gymBId: string
let adminAId: string
let adminBId: string
let memberAId: string
let planAId: string

// Tokens JWT
let adminAToken: string
let adminBToken: string
let memberAToken: string

// Tracking de registros creados durante tests para cleanup
const createdBankMovementIds: string[] = []
const createdMembershipIds: string[] = []
const createdFintocLinkIds: string[] = []

// ─── Helper: construir app Fastify ───────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET })

  // rawBody support (mismo patrón que en production y otros tests)
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
      // Orden FK: BankMovement → FintocLink → Membership → User → Plan → Gym
      await prisma.bankMovement.deleteMany({ where: { gymId: existing.id } })
      await prisma.fintocLink.deleteMany({ where: { gymId: existing.id } })
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existing.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Fintoc Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Fintoc Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Admin A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Fintoc A', email: 'qa-fintoc-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  // Admin B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Fintoc B', email: 'qa-fintoc-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  // Member A (con RUT para tests del matcher Fase 1)
  const memberA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member Fintoc A',
      email: 'qa-fintoc-member-a@test.local',
      passwordHash,
      role: 'MEMBER',
      rut: '12345678-9',
    },
  })
  memberAId = memberA.id

  // Plan en Gym A
  const planA = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan Fintoc Test',
      priceCents: 50000,
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

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, email: 'qa-fintoc-admin-a@test.local', role: 'ADMIN', name: 'Admin Fintoc A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, email: 'qa-fintoc-admin-b@test.local', role: 'ADMIN', name: 'Admin Fintoc B' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, email: 'qa-fintoc-member-a@test.local', role: 'MEMBER', name: 'Member Fintoc A' })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  if (createdBankMovementIds.length) {
    await prisma.bankMovement.deleteMany({ where: { id: { in: createdBankMovementIds } } })
  }
  await prisma.bankMovement.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.fintocLink.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })

  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  await prisma.membership.deleteMany({ where: { userId: { in: [adminAId, adminBId, memberAId].filter(Boolean) } } })
  await prisma.user.deleteMany({ where: { id: { in: [adminAId, adminBId, memberAId].filter(Boolean) } } })
  await prisma.plan.deleteMany({ where: { id: planAId } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Helper: crear FintocLink directamente en DB ──────────────────────────────

async function ensureFintocLink(gymId: string, opts?: { holderRut?: string }) {
  const link = await prisma.fintocLink.upsert({
    where: { gymId },
    create: {
      gymId,
      linkToken: `link_token_${gymId}`,
      accountId: `acc_${gymId}`,
      holderRut: opts?.holderRut ?? null,
      status: 'ACTIVE',
    },
    update: {
      linkToken: `link_token_${gymId}`,
      accountId: `acc_${gymId}`,
      holderRut: opts?.holderRut ?? null,
      status: 'ACTIVE',
    },
  })
  return link
}

// ─── Helper: crear membresía PENDING_REVIEW (como si el alumno subió comprobante) ──

async function createPendingTransferMembership(gymId: string, userId: string, planId: string, priceCents: number) {
  const startsAt = new Date()
  const endsAt = new Date()
  endsAt.setDate(endsAt.getDate() + 30)

  const membership = await prisma.membership.create({
    data: {
      userId,
      planId,
      status: 'INACTIVE',
      startsAt,
      endsAt,
      pricePaid: priceCents,
      currency: 'CLP',
      paymentMethod: 'transfer',
      transferStatus: 'PENDING_REVIEW',
      transferReceiptUrl: `/uploads/test-${Date.now()}.jpg`,
    },
  })
  createdMembershipIds.push(membership.id)
  return membership
}

// ─── Suite 1: POST /payments/fintoc/link ─────────────────────────────────────

describe('Fintoc: POST /api/payments/fintoc/link', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      payload: { linkToken: 'tok_abc', accountId: 'acc_001' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta guardar link → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { linkToken: 'tok_abc', accountId: 'acc_001' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('body sin linkToken → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { accountId: 'acc_001' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  it('body sin accountId → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { linkToken: 'tok_abc' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('admin A crea link con campos obligatorios → 201 + FintocLink creado', async () => {
    // Eliminar link previo si existe (de runs anteriores)
    await prisma.bankMovement.deleteMany({ where: { gymId: gymAId } })
    await prisma.fintocLink.deleteMany({ where: { gymId: gymAId } })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        linkToken: 'link_tok_001',
        accountId: 'acc_001',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.gymId).toBe(gymAId)
    expect(body.linkToken).toBe('link_tok_001')
    expect(body.accountId).toBe('acc_001')
    expect(body.status).toBe('ACTIVE')
    expect(body.accountNumber).toBeNull()
    expect(body.bankName).toBeNull()
    expect(body.holderName).toBeNull()
    expect(body.holderRut).toBeNull()
  })

  it('admin A actualiza link con todos los campos opcionales (upsert) → 201 + mismo gymId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        linkToken: 'link_tok_002_updated',
        accountId: 'acc_001_updated',
        accountNumber: '001-123-456',
        bankName: 'Banco Estado',
        holderName: 'QA Fintoc Gym A SpA',
        holderRut: '76543210-K',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.gymId).toBe(gymAId)
    expect(body.linkToken).toBe('link_tok_002_updated')
    expect(body.accountNumber).toBe('001-123-456')
    expect(body.bankName).toBe('Banco Estado')
    expect(body.holderName).toBe('QA Fintoc Gym A SpA')
    expect(body.holderRut).toBe('76543210-K')

    // Verificar en DB que solo existe un registro por gymId
    const count = await prisma.fintocLink.count({ where: { gymId: gymAId } })
    expect(count).toBe(1)
  })

  it('gymId viene del JWT, no del body — Admin B no puede ver ni modificar link de A', async () => {
    // Admin B crea su propio link
    await prisma.bankMovement.deleteMany({ where: { gymId: gymBId } })
    await prisma.fintocLink.deleteMany({ where: { gymId: gymBId } })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/link',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { linkToken: 'link_tok_gym_b', accountId: 'acc_b_001' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    // El link creado tiene gymId de B, no de A
    expect(body.gymId).toBe(gymBId)
    expect(body.gymId).not.toBe(gymAId)

    // El link de A sigue siendo el mismo
    const linkA = await prisma.fintocLink.findUnique({ where: { gymId: gymAId } })
    expect(linkA?.linkToken).toBe('link_tok_002_updated')
  })
})

// ─── Suite 2: GET /payments/fintoc/status ────────────────────────────────────

describe('Fintoc: GET /api/payments/fintoc/status', () => {
  let app: FastifyInstance
  let gymCId: string

  beforeAll(async () => {
    app = await buildApp()

    // Gym C limpio sin link para testear "sin conexión"
    const existing = await prisma.gym.findUnique({ where: { slug: 'qa-fintoc-gym-c' } })
    if (existing) {
      await prisma.bankMovement.deleteMany({ where: { gymId: existing.id } })
      await prisma.fintocLink.deleteMany({ where: { gymId: existing.id } })
      await prisma.user.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }

    const gymC = await prisma.gym.create({
      data: { name: 'QA Fintoc Gym C', slug: 'qa-fintoc-gym-c', status: 'ACTIVE' },
    })
    gymCId = gymC.id
  })

  afterAll(async () => {
    await app.close()
    await prisma.bankMovement.deleteMany({ where: { gymId: gymCId } })
    await prisma.fintocLink.deleteMany({ where: { gymId: gymCId } })
    await prisma.gym.delete({ where: { id: gymCId } }).catch(() => {})
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/fintoc/status' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta ver status → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/status',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('gym sin link → { connected: false, link: null, pendingCount: 0, matchedCount: 0 }', async () => {
    // Usar un admin de gymC (sin link)
    const tempApp = Fastify({ logger: false })
    await tempApp.register(jwt, { secret: JWT_SECRET })
    await tempApp.ready()
    const passwordHash = await bcrypt.hash('pw', 10)
    const adminC = await prisma.user.create({
      data: { gymId: gymCId, name: 'Admin C', email: 'qa-fintoc-admin-c@test.local', passwordHash, role: 'ADMIN' },
    })
    const tokenC = tempApp.jwt.sign({ userId: adminC.id, gymId: gymCId, role: 'ADMIN', name: 'Admin C', email: 'qa-fintoc-admin-c@test.local' })
    await tempApp.close()

    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/status',
      headers: { authorization: `Bearer ${tokenC}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.connected).toBe(false)
    expect(body.link).toBeNull()
    expect(body.pendingCount).toBe(0)
    expect(body.matchedCount).toBe(0)

    await prisma.user.delete({ where: { id: adminC.id } })
  })

  it('gym con link → connected: true + datos del link', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/status',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.connected).toBe(true)
    expect(body.link).not.toBeNull()
    expect(body.link.gymId).toBe(gymAId)
    expect(typeof body.pendingCount).toBe('number')
    expect(typeof body.matchedCount).toBe('number')
  })

  it('pendingCount refleja movimientos PENDING reales', async () => {
    // Crear movimiento PENDING directamente en DB
    const link = await prisma.fintocLink.findUnique({ where: { gymId: gymAId } })
    const movement = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: link!.id,
        fintocMovementId: `mv_status_test_${Date.now()}`,
        amount: 50000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(movement.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/status',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.pendingCount).toBeGreaterThanOrEqual(1)
  })
})

// ─── Suite 3: POST /payments/fintoc/sync — importación e idempotencia ────────

describe('Fintoc: POST /api/payments/fintoc/sync — importación e idempotencia', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    // Asegurar que gymA tiene un FintocLink activo
    await ensureFintocLink(gymAId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      payload: {
        movements: [{ id: 'mv_auth_test', amount: 10000, post_date: '2026-05-01' }],
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta sync → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: {
        movements: [{ id: 'mv_auth_member', amount: 10000, post_date: '2026-05-01' }],
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('body vacío (movements array vacío) → 400 Zod (min(1))', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { movements: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body sin movements → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { foo: 'bar' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('sync de 2 movimientos nuevos → imported: 2, skipped: 0', async () => {
    const ts = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [
          { id: `mv_new_1_${ts}`, amount: 10000, post_date: '2026-05-01', description: 'Abono alumno 1' },
          { id: `mv_new_2_${ts}`, amount: 20000, post_date: '2026-05-02', description: 'Abono alumno 2' },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.imported).toBe(2)
    expect(body.skipped).toBe(0)
    expect(typeof body.matched).toBe('number')
    expect(typeof body.confirmed).toBe('number')

    // Verificar en DB que se crearon
    const mvs = await prisma.bankMovement.findMany({
      where: { fintocMovementId: { in: [`mv_new_1_${ts}`, `mv_new_2_${ts}`] } },
    })
    expect(mvs).toHaveLength(2)
    mvs.forEach(mv => createdBankMovementIds.push(mv.id))
  })

  it('importar el mismo fintocMovementId dos veces → idempotencia: imported: 0, skipped: 1', async () => {
    const ts = Date.now()
    const movementId = `mv_idempotent_${ts}`

    // Primera importación
    await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [{ id: movementId, amount: 15000, post_date: '2026-05-03' }],
      },
    })

    // Segunda importación (mismo id)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [{ id: movementId, amount: 15000, post_date: '2026-05-03' }],
      },
    })

    expect(res2.statusCode).toBe(200)
    const body = res2.json()
    expect(body.imported).toBe(0)
    expect(body.skipped).toBe(1)

    // Solo existe un registro en DB
    const count = await prisma.bankMovement.count({ where: { fintocMovementId: movementId } })
    expect(count).toBe(1)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: movementId } })
    if (mv) createdBankMovementIds.push(mv.id)
  })

  it('mezcla de nuevos y duplicados → conteos correctos', async () => {
    const ts = Date.now()
    const existingId = `mv_mix_existing_${ts}`
    const newId = `mv_mix_new_${ts}`

    // Crear el existente primero
    await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { movements: [{ id: existingId, amount: 5000, post_date: '2026-05-01' }] },
    })

    // Importar mezcla
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [
          { id: existingId, amount: 5000, post_date: '2026-05-01' },  // duplicado
          { id: newId, amount: 7500, post_date: '2026-05-04' },        // nuevo
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.imported).toBe(1)
    expect(body.skipped).toBe(1)

    const mvExisting = await prisma.bankMovement.findUnique({ where: { fintocMovementId: existingId } })
    const mvNew = await prisma.bankMovement.findUnique({ where: { fintocMovementId: newId } })
    if (mvExisting) createdBankMovementIds.push(mvExisting.id)
    if (mvNew) createdBankMovementIds.push(mvNew.id)
  })

  it('sync actualiza lastSyncAt del FintocLink', async () => {
    const linkBefore = await prisma.fintocLink.findUnique({ where: { gymId: gymAId } })
    const beforeSync = linkBefore?.lastSyncAt

    const ts = Date.now()
    await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { movements: [{ id: `mv_sync_ts_${ts}`, amount: 1000, post_date: '2026-05-05' }] },
    })

    const linkAfter = await prisma.fintocLink.findUnique({ where: { gymId: gymAId } })
    expect(linkAfter?.lastSyncAt).not.toBeNull()

    // Si había un lastSyncAt antes, el nuevo debe ser posterior
    if (beforeSync) {
      expect(linkAfter!.lastSyncAt!.getTime()).toBeGreaterThanOrEqual(beforeSync.getTime())
    }

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: `mv_sync_ts_${ts}` } })
    if (mv) createdBankMovementIds.push(mv.id)
  })

  it('gym sin FintocLink configurado → 400 "No hay link Fintoc"', async () => {
    // Crear un gym temporal sin link
    const tempGym = await prisma.gym.create({
      data: { name: 'QA Gym Sin Link', slug: 'qa-fintoc-no-link-gym', status: 'ACTIVE' },
    })
    const passwordHash = await bcrypt.hash('pw', 10)
    const tempAdmin = await prisma.user.create({
      data: { gymId: tempGym.id, name: 'Admin Sin Link', email: 'qa-fintoc-nolink@test.local', passwordHash, role: 'ADMIN' },
    })

    const tempApp2 = Fastify({ logger: false })
    await tempApp2.register(jwt, { secret: JWT_SECRET })
    await tempApp2.ready()
    const tempToken = tempApp2.jwt.sign({ userId: tempAdmin.id, gymId: tempGym.id, role: 'ADMIN', name: 'Admin Sin Link', email: 'qa-fintoc-nolink@test.local' })
    await tempApp2.close()

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${tempToken}` },
      payload: { movements: [{ id: 'mv_nolink_1', amount: 1000, post_date: '2026-05-01' }] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no hay link fintoc/i)

    // Cleanup del gym temporal
    await prisma.user.delete({ where: { id: tempAdmin.id } })
    await prisma.gym.delete({ where: { id: tempGym.id } })
  })
})

// ─── Suite 4: Matcher — Fase 1 (exact_rut) y Fase 2 (amount_only) ────────────

describe('Fintoc: Matcher de conciliación — Fase 1 exact_rut y Fase 2 amount_only', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await ensureFintocLink(gymAId)
  })

  afterAll(async () => { await app.close() })

  it('Fase 1 exact_rut: senderRut coincide con user.rut + mismo monto → confirmed: 1, movimiento CONFIRMED, membresía ACTIVE', async () => {
    // memberA tiene rut '12345678-9'
    const membership = await createPendingTransferMembership(gymAId, memberAId, planAId, 50000)
    const ts = Date.now()
    const movementId = `mv_rut_match_${ts}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [{
          id: movementId,
          amount: 50000,          // mismo monto que la membresía (plan.priceCents = 50000)
          post_date: new Date().toISOString().split('T')[0],
          sender_rut: '12345678-9',  // coincide con memberA.rut
          sender_name: 'Member Fintoc A',
        }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.confirmed).toBe(1)

    // El movimiento debe estar CONFIRMED con matchConfidence exact_rut
    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: movementId } })
    expect(mv).not.toBeNull()
    expect(mv!.reconciliationStatus).toBe('CONFIRMED')
    expect(mv!.matchConfidence).toBe('exact_rut')
    expect(mv!.membershipId).toBe(membership.id)
    if (mv) createdBankMovementIds.push(mv.id)

    // La membresía debe haber sido confirmada (ACTIVE)
    const refreshedMembership = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(refreshedMembership!.status).toBe('ACTIVE')
    expect(refreshedMembership!.transferStatus).toBe('CONFIRMED')
    expect(refreshedMembership!.paidAt).not.toBeNull()
  })

  it('Fase 1 exact_rut: RUT no coincide con ningún candidato → no confirma', async () => {
    const membership = await createPendingTransferMembership(gymAId, memberAId, planAId, 50000)
    const ts = Date.now()
    const movementId = `mv_rut_no_match_${ts}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [{
          id: movementId,
          amount: 50000,
          post_date: new Date().toISOString().split('T')[0],
          sender_rut: '99999999-9',   // RUT inexistente
        }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Puede caer en Fase 2 (amount + ±72h) → matched puede ser 1
    // Lo importante: confirmed debe ser 0
    expect(body.confirmed).toBe(0)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: movementId } })
    if (mv) {
      createdBankMovementIds.push(mv.id)
      // Si matcheó por amount_only, debe ser MATCHED no CONFIRMED
      expect(['MATCHED', 'PENDING']).toContain(mv.reconciliationStatus)
      if (mv.reconciliationStatus === 'MATCHED') {
        expect(mv.matchConfidence).toBe('amount_only')
      }
    }
  })

  it('Fase 2 amount_only: monto coincide + postedAt dentro de ±72h → matched: 1, movimiento MATCHED', async () => {
    // Crear membresía sin RUT en user (para que no caiga en Fase 1)
    const memberNoRut = await prisma.user.create({
      data: { gymId: gymAId, name: 'Member No Rut', email: `qa-fintoc-norut-${Date.now()}@test.local`, passwordHash: await bcrypt.hash('pw', 10), role: 'MEMBER' },
    })

    const plan2 = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan Amount Only', priceCents: 77777, currency: 'CLP', durationDays: 30, isActive: true },
    })

    const membership = await createPendingTransferMembership(gymAId, memberNoRut.id, plan2.id, 77777)
    const ts = Date.now()
    const movementId = `mv_amount_only_${ts}`

    // postedAt = ahora (dentro de ±72h de membership.createdAt = ahora)
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [{
          id: movementId,
          amount: 77777,
          post_date: new Date().toISOString(),
          // Sin sender_rut → no hay Fase 1
        }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.matched).toBeGreaterThanOrEqual(1)
    expect(body.confirmed).toBe(0)  // Fase 2 no confirma, requiere revisión manual

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: movementId } })
    expect(mv).not.toBeNull()
    expect(mv!.reconciliationStatus).toBe('MATCHED')
    expect(mv!.matchConfidence).toBe('amount_only')
    expect(mv!.membershipId).toBe(membership.id)
    if (mv) createdBankMovementIds.push(mv.id)

    // La membresía NO debe estar CONFIRMED (Fase 2 requiere revisión humana)
    const refreshedMembership = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(refreshedMembership!.transferStatus).toBe('PENDING_REVIEW')

    // Cleanup
    await prisma.membership.delete({ where: { id: membership.id } }).catch(() => {})
    await prisma.plan.delete({ where: { id: plan2.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: memberNoRut.id } }).catch(() => {})
  })

  it('sin candidatos en DB → movimiento queda PENDING, matched: 0, confirmed: 0', async () => {
    const ts = Date.now()
    const movementId = `mv_no_candidates_${ts}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/fintoc/sync',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        movements: [{
          id: movementId,
          amount: 99999999,  // monto que no existe en ninguna membresía
          post_date: new Date().toISOString(),
        }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.matched).toBe(0)
    expect(body.confirmed).toBe(0)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: movementId } })
    expect(mv).not.toBeNull()
    expect(mv!.reconciliationStatus).toBe('PENDING')
    if (mv) createdBankMovementIds.push(mv.id)
  })
})

// ─── Suite 5: GET /payments/fintoc/movements ─────────────────────────────────

describe('Fintoc: GET /api/payments/fintoc/movements — filtros, paginación, cross-gym', () => {
  let app: FastifyInstance
  let linkAId: string

  beforeAll(async () => {
    app = await buildApp()
    const link = await ensureFintocLink(gymAId)
    linkAId = link.id

    // Crear algunos movimientos con distintos estados para gymA
    const baseTime = new Date('2026-05-01T12:00:00Z')

    const mvs = await Promise.all([
      prisma.bankMovement.create({
        data: { gymId: gymAId, fintocLinkId: linkAId, fintocMovementId: `mv_list_pending_1_${Date.now()}`, amount: 10000, currency: 'CLP', postedAt: baseTime, reconciliationStatus: 'PENDING' },
      }),
      prisma.bankMovement.create({
        data: { gymId: gymAId, fintocLinkId: linkAId, fintocMovementId: `mv_list_matched_1_${Date.now()}`, amount: 20000, currency: 'CLP', postedAt: baseTime, reconciliationStatus: 'MATCHED' },
      }),
      prisma.bankMovement.create({
        data: { gymId: gymAId, fintocLinkId: linkAId, fintocMovementId: `mv_list_confirmed_1_${Date.now()}`, amount: 30000, currency: 'CLP', postedAt: baseTime, reconciliationStatus: 'CONFIRMED' },
      }),
    ])
    mvs.forEach(mv => createdBankMovementIds.push(mv.id))

    // Crear movimiento en gymB (para cross-gym)
    const linkB = await ensureFintocLink(gymBId)
    const mvB = await prisma.bankMovement.create({
      data: { gymId: gymBId, fintocLinkId: linkB.id, fintocMovementId: `mv_list_gymb_${Date.now()}`, amount: 99000, currency: 'CLP', postedAt: baseTime, reconciliationStatus: 'PENDING' },
    })
    createdBankMovementIds.push(mvB.id)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/fintoc/movements' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta listar → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('sin filtros → devuelve array de movimientos con total, limit, offset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.movements)).toBe(true)
    expect(typeof body.total).toBe('number')
    expect(body.limit).toBe(50)   // default
    expect(body.offset).toBe(0)   // default
  })

  it('filtro status=PENDING → solo movimientos PENDING', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements?status=PENDING',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    body.movements.forEach((mv: any) => {
      expect(mv.reconciliationStatus).toBe('PENDING')
    })
  })

  it('filtro status=MATCHED → solo movimientos MATCHED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements?status=MATCHED',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    body.movements.forEach((mv: any) => {
      expect(mv.reconciliationStatus).toBe('MATCHED')
    })
  })

  it('filtro status=CONFIRMED → solo movimientos CONFIRMED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements?status=CONFIRMED',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    body.movements.forEach((mv: any) => {
      expect(mv.reconciliationStatus).toBe('CONFIRMED')
    })
  })

  it('paginación: limit=1, offset=0 → devuelve 1 movimiento', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements?limit=1&offset=0',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.movements).toHaveLength(1)
    expect(body.limit).toBe(1)
    expect(body.offset).toBe(0)
  })

  it('aislamiento cross-gym: admin A NO ve movimientos de gym B', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    body.movements.forEach((mv: any) => {
      expect(mv.gymId).toBe(gymAId)
    })
  })

  it('admin B solo ve sus propios movimientos (gymB)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements',
      headers: { authorization: `Bearer ${adminBToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    body.movements.forEach((mv: any) => {
      expect(mv.gymId).toBe(gymBId)
    })
  })

  it('cada movimiento incluye membership (null si no tiene)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/fintoc/movements',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Cada item debe tener el campo membership (puede ser null)
    body.movements.forEach((mv: any) => {
      expect('membership' in mv).toBe(true)
    })
  })
})

// ─── Suite 6: PATCH /payments/fintoc/movements/:id/confirm ───────────────────

describe('Fintoc: PATCH /api/payments/fintoc/movements/:id/confirm', () => {
  let app: FastifyInstance
  let linkAId: string

  beforeAll(async () => {
    app = await buildApp()
    const link = await ensureFintocLink(gymAId)
    linkAId = link.id
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/payments/fintoc/movements/fake-id/confirm',
      payload: { membershipId: 'fake-membership-id' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta confirmar → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/payments/fintoc/movements/fake-id/confirm',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { membershipId: 'fake-membership-id' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('sin membershipId en body → 400', async () => {
    const mv = await prisma.bankMovement.create({
      data: { gymId: gymAId, fintocLinkId: linkAId, fintocMovementId: `mv_conf_nomb_${Date.now()}`, amount: 50000, currency: 'CLP', postedAt: new Date(), reconciliationStatus: 'PENDING' },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/membershipId/i)
  })

  it('confirmar movimiento PENDING con membresía PENDING_REVIEW → 200, movimiento CONFIRMED, membresía ACTIVE', async () => {
    const membership = await createPendingTransferMembership(gymAId, memberAId, planAId, 50000)
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_confirm_ok_${Date.now()}`,
        amount: 50000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { membershipId: membership.id },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.reconciliationStatus).toBe('CONFIRMED')
    expect(body.membershipId).toBe(membership.id)
    expect(body.reviewedBy).toBe(adminAId)
    expect(body.reviewedAt).not.toBeNull()

    // La membresía debe estar ACTIVE
    const refreshedMembership = await prisma.membership.findUnique({ where: { id: membership.id } })
    expect(refreshedMembership!.status).toBe('ACTIVE')
    expect(refreshedMembership!.transferStatus).toBe('CONFIRMED')
  })

  it('doble confirmación del mismo movimiento → 400 "ya fue procesado"', async () => {
    const membership = await createPendingTransferMembership(gymAId, memberAId, planAId, 50000)
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_double_confirm_${Date.now()}`,
        amount: 50000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    // Primera confirmación
    await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { membershipId: membership.id },
    })

    // Segunda confirmación → debe fallar
    const res2 = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { membershipId: membership.id },
    })

    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/ya fue procesado/i)
  })

  it('cross-gym: admin B intenta confirmar movimiento de gym A → 400 "no encontrado"', async () => {
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_crossgym_confirm_${Date.now()}`,
        amount: 50000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/confirm`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { membershipId: 'any-membership-id' },
    })

    // confirmBankMovement filtra por { id: movementId, gymId: admin.gymId }
    // Admin B tiene gymId B, movimiento es de gym A → no encontrado
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/movimiento bancario no encontrado/i)
  })
})

// ─── Suite 7: PATCH /payments/fintoc/movements/:id/reject ────────────────────

describe('Fintoc: PATCH /api/payments/fintoc/movements/:id/reject', () => {
  let app: FastifyInstance
  let linkAId: string

  beforeAll(async () => {
    app = await buildApp()
    const link = await ensureFintocLink(gymAId)
    linkAId = link.id
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/payments/fintoc/movements/fake-id/reject',
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta rechazar → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/payments/fintoc/movements/fake-id/reject',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })

  it('rechazar movimiento PENDING → 200, reconciliationStatus = REJECTED, reviewedBy = adminAId', async () => {
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_reject_ok_${Date.now()}`,
        amount: 10000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { reason: 'Monto no corresponde' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.reconciliationStatus).toBe('REJECTED')
    expect(body.reviewedBy).toBe(adminAId)
    expect(body.reviewedAt).not.toBeNull()
    // rejectBankMovement escribe "[RECHAZADO] {reason}" en description si hay reason
    expect(body.description).toMatch(/\[RECHAZADO\]/)
    expect(body.description).toContain('Monto no corresponde')
  })

  it('rechazar sin reason → 200, description sin prefix [RECHAZADO]', async () => {
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_reject_noreason_${Date.now()}`,
        amount: 10000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.reconciliationStatus).toBe('REJECTED')
    // Sin reason: description permanece como estaba (null en este caso)
    expect(body.description).toBeNull()
  })

  it('rechazar un movimiento ya rechazado → 400 "ya fue procesado"', async () => {
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_reject_twice_${Date.now()}`,
        amount: 10000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    // Primer rechazo
    await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    // Segundo rechazo
    const res2 = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/ya fue procesado/i)
  })

  it('rechazar un movimiento ya confirmado → 400 "ya fue procesado"', async () => {
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_reject_after_confirm_${Date.now()}`,
        amount: 10000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'CONFIRMED',  // ya estaba confirmado
      },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/ya fue procesado/i)
  })

  it('cross-gym: admin B no puede rechazar movimiento de gym A → 400', async () => {
    const mv = await prisma.bankMovement.create({
      data: {
        gymId: gymAId,
        fintocLinkId: linkAId,
        fintocMovementId: `mv_crossgym_reject_${Date.now()}`,
        amount: 10000,
        currency: 'CLP',
        postedAt: new Date(),
        reconciliationStatus: 'PENDING',
      },
    })
    createdBankMovementIds.push(mv.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/fintoc/movements/${mv.id}/reject`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/movimiento bancario no encontrado/i)
  })
})

// ─── Suite 8: POST /payments/webhook/fintoc ───────────────────────────────────

describe('Fintoc: POST /api/payments/webhook/fintoc — webhook HMAC + idempotencia', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    // Asegurar FintocLink en gymA para que el webhook pueda importar movimientos
    await ensureFintocLink(gymAId)
  })

  afterAll(async () => { await app.close() })

  it('body sin gymId → 400 "gymId requerido en payload"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload: { movements: [] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/gymId requerido/i)
  })

  it('gymId en body.gymId → 200 (procesa correctamente)', async () => {
    const ts = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload: {
        gymId: gymAId,
        movements: [{ id: `mv_webhook_direct_${ts}`, amount: 5000, post_date: '2026-05-05' }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.imported).toBe(1)
    expect(body.skipped).toBe(0)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: `mv_webhook_direct_${ts}` } })
    if (mv) createdBankMovementIds.push(mv.id)
  })

  it('gymId en body.metadata.gymId → 200', async () => {
    const ts = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload: {
        metadata: { gymId: gymAId },
        movements: [{ id: `mv_webhook_meta_${ts}`, amount: 6000, post_date: '2026-05-05' }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.imported).toBe(1)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: `mv_webhook_meta_${ts}` } })
    if (mv) createdBankMovementIds.push(mv.id)
  })

  it('sin header fintoc-signature → pasa sin error (modo sin secret)', async () => {
    const ts = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload: {
        gymId: gymAId,
        movements: [{ id: `mv_webhook_nosig_${ts}`, amount: 7000, post_date: '2026-05-05' }],
      },
    })

    // Sin firma, sin secret configurado → pasa
    expect(res.statusCode).toBe(200)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: `mv_webhook_nosig_${ts}` } })
    if (mv) createdBankMovementIds.push(mv.id)
  })

  it('firma HMAC-SHA256 válida + gym con webhookSecret → 200', async () => {
    // Configurar webhookSecret en el gym
    const webhookSecret = 'test-fintoc-webhook-secret-123'
    await prisma.gym.update({
      where: { id: gymAId },
      data: { paymentGateways: { fintoc: { webhookSecret } } as any },
    })

    const ts = Date.now()
    const payload = {
      gymId: gymAId,
      movements: [{ id: `mv_webhook_valid_sig_${ts}`, amount: 8000, post_date: '2026-05-05' }],
    }
    const bodyStr = JSON.stringify(payload)
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex')

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': expectedSig,
      },
      payload: bodyStr,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().imported).toBe(1)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: `mv_webhook_valid_sig_${ts}` } })
    if (mv) createdBankMovementIds.push(mv.id)

    // Limpiar configuración del gym
    await prisma.gym.update({ where: { id: gymAId }, data: { paymentGateways: {} } })
  })

  it('firma HMAC-SHA256 inválida + gym con webhookSecret → 401', async () => {
    // Configurar webhookSecret en el gym
    const webhookSecret = 'test-fintoc-webhook-secret-456'
    await prisma.gym.update({
      where: { id: gymAId },
      data: { paymentGateways: { fintoc: { webhookSecret } } as any },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      headers: {
        'content-type': 'application/json',
        'fintoc-signature': 'firma_incorrecta_xyz',
      },
      payload: {
        gymId: gymAId,
        movements: [{ id: `mv_webhook_bad_sig_${Date.now()}`, amount: 8000, post_date: '2026-05-05' }],
      },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toMatch(/firma fintoc inválida/i)

    // Limpiar
    await prisma.gym.update({ where: { id: gymAId }, data: { paymentGateways: {} } })
  })

  it('idempotencia: mismo movimiento enviado dos veces por webhook → imported:1 la primera, imported:0 la segunda', async () => {
    const ts = Date.now()
    const movementId = `mv_webhook_idem_${ts}`

    const payload = {
      gymId: gymAId,
      movements: [{ id: movementId, amount: 9000, post_date: '2026-05-05' }],
    }

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload,
    })

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload,
    })

    expect(res1.statusCode).toBe(200)
    expect(res1.json().imported).toBe(1)
    expect(res1.json().skipped).toBe(0)

    expect(res2.statusCode).toBe(200)
    expect(res2.json().imported).toBe(0)
    expect(res2.json().skipped).toBe(1)

    const count = await prisma.bankMovement.count({ where: { fintocMovementId: movementId } })
    expect(count).toBe(1)

    const mv = await prisma.bankMovement.findUnique({ where: { fintocMovementId: movementId } })
    if (mv) createdBankMovementIds.push(mv.id)
  })

  it('gymId inexistente (gym no encontrado) → 400 (FintocLink no existe)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload: {
        gymId: '00000000-0000-0000-0000-000000000000',
        movements: [{ id: `mv_webhook_nogym_${Date.now()}`, amount: 1000, post_date: '2026-05-05' }],
      },
    })

    // importFintocMovements lanza "No hay link Fintoc configurado" → 400
    expect(res.statusCode).toBe(400)
  })

  it('webhook con movements vacíos → 200 (importFintocMovements con array vacío)', async () => {
    // El handler llama a handleFintocWebhook que llama a importFintocMovements con []
    // importFintocMovements necesita el FintocLink pero con [] no itera
    // OJO: importFintocMovements igual hace la verificación del link primero
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/fintoc',
      payload: {
        gymId: gymAId,
        movements: [],
      },
    })

    // Con gymAId que tiene link → 200, imported: 0, skipped: 0
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.imported).toBe(0)
    expect(body.skipped).toBe(0)
  })
})
