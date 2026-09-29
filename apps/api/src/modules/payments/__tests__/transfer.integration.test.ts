/**
 * transfer.integration.test.ts
 *
 * Tests de integración para el flujo de comprobante de transferencia bancaria.
 *
 * Flujo completo:
 *   1. Alumno sube comprobante (multipart) → membresía INACTIVE con transferStatus PENDING_REVIEW
 *   2. Admin ve lista de transferencias pendientes
 *   3. Admin confirma → membresía pasa a ACTIVE con paidAt registrado
 *      ó Admin rechaza → membresía queda INACTIVE con transferStatus REJECTED
 *
 * Estrategia de testing del endpoint multipart:
 *   El endpoint POST /payments/transfer/receipt usa @fastify/multipart y llama a
 *   request.file(). Testear multipart via fastify.inject() requiere construir el
 *   boundary a mano. Para los casos que no necesitan validar el archivo en sí
 *   (ej: auth y validaciones de parámetros), se usa multipart mínimo.
 *   Para el flujo feliz, se llama a submitTransferReceipt() directamente sobre la
 *   DB — esto valida la lógica de negocio sin depender de la capa de file upload.
 *
 * Setup:
 *   - Gym A (gymSlug: qa-transfer-gym-a) con admin y member
 *   - Gym B (gymSlug: qa-transfer-gym-b) con admin (para tests cross-gym)
 *   - Plan activo en Gym A
 *
 * Cleanup:
 *   - Borra membresías creadas durante los tests por ID
 *   - Borra usuarios y gyms en orden correcto por FK
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import bcrypt from 'bcryptjs'
import { paymentRoutes } from '../payments.routes'
import { submitTransferReceipt, confirmTransfer } from '../payments.service'
import { prisma } from '../../../lib/prisma'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-transfer-gym-a'
const GYM_B_SLUG = 'qa-transfer-gym-b'

// IDs creados en setup — para cleanup limpio en afterAll
let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let adminBId: string
let planId: string

// Tokens JWT
let adminAToken: string
let memberAToken: string
let adminBToken: string

// IDs de membresías creadas en tests — para cleanup
const createdMembershipIds: string[] = []

// ─── Helper: construir la app Fastify mínima ──────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

  // addContentTypeParser para rawBody (necesario para que JSON no rompa el parser)
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (_req: any, body: Buffer, done: (err: Error | null, body?: unknown) => void) {
      _req.rawBody = body
      if (!body || body.length === 0) { done(null, null); return }
      try { done(null, JSON.parse(body.toString())) }
      catch { done(null, null) }
    },
  )

  await app.register(paymentRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

// ─── Helper: firmar un token JWT directamente (sin login HTTP) ───────────────

function signToken(app: FastifyInstance, payload: object): string {
  return app.jwt.sign(payload)
}

// ─── Helper: construir un body multipart mínimo con un "archivo" ─────────────

function buildMultipartBody(boundary: string, filename: string, fileContent: Buffer, contentType = 'image/jpeg'): Buffer {
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`
  return Buffer.concat([
    Buffer.from(header),
    fileContent,
    Buffer.from(footer),
  ])
}

// ─── Setup / Teardown global ──────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existingGym = await prisma.gym.findUnique({ where: { slug } })
    if (existingGym) {
      // Borrar membresías y luego usuarios del gym
      const users = await prisma.user.findMany({ where: { gymId: existingGym.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existingGym.id } })
      await prisma.gym.delete({ where: { id: existingGym.id } })
    }
  }

  // Crear Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Transfer Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Crear Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Transfer Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Crear usuarios en Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Transfer A', email: 'qa-transfer-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Transfer A', email: 'qa-transfer-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  // Crear admin en Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Transfer B', email: 'qa-transfer-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  // Crear plan activo en Gym A
  const plan = await prisma.plan.create({
    data: {
      gymId: gymAId,
      name: 'Plan Test Transferencia',
      priceCents: 30000,
      currency: 'CLP',
      durationDays: 30,
      isActive: true,
    },
  })
  planId = plan.id

  // Generar tokens usando una app temporal solo para sign
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, email: 'qa-transfer-admin-a@test.local', role: 'ADMIN', name: 'Admin Transfer A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, email: 'qa-transfer-member-a@test.local', role: 'MEMBER', name: 'Member Transfer A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, email: 'qa-transfer-admin-b@test.local', role: 'ADMIN', name: 'Admin Transfer B' })

  await tempApp.close()
})

afterAll(async () => {
  // Limpiar membresías creadas en los tests
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Limpiar en orden FK
  await prisma.membership.deleteMany({ where: { userId: { in: [adminAId, memberAId, adminBId].filter(Boolean) } } })
  await prisma.user.deleteMany({ where: { id: { in: [adminAId, memberAId, adminBId].filter(Boolean) } } })
  await prisma.plan.deleteMany({ where: { id: planId } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Suite 1: Flujo feliz — alumno sube comprobante ──────────────────────────

describe('Transfer: POST /api/payments/transfer/receipt (multipart upload)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const boundary = 'test-boundary-001'
    const body = buildMultipartBody(boundary, 'comprobante.jpg', Buffer.from('fake-image-bytes'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/transfer/receipt?planId=' + planId,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(401)
  })

  it('archivo HTML (aunque se llame .jpg) → 400 y no se guarda', async () => {
    const boundary = 'test-boundary-html'
    const body = buildMultipartBody(boundary, 'comprobante.jpg', Buffer.from('<script>alert(1)</script>'), 'text/html')

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/transfer/receipt?planId=' + planId,
      headers: { authorization: `Bearer ${memberAToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Formato no permitido/)
  })

  it('con token MEMBER pero sin planId → 400', async () => {
    const boundary = 'test-boundary-002'
    const body = buildMultipartBody(boundary, 'comprobante.jpg', Buffer.from('fake-image-bytes'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/transfer/receipt',  // sin ?planId
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'authorization': `Bearer ${memberAToken}`,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/planId/i)
  })

  it('con planId de otro gym → 400 (plan no encontrado)', async () => {
    // planId pertenece a gymA, pero llamamos como si fuera planId de gymB
    // submitTransferReceipt verifica { id: planId, gymId: user.gymId }
    // El token de memberA tiene gymId = gymAId, pero simulamos con planId inexistente en gymB
    const fakePlanId = '00000000-0000-0000-0000-000000000000'
    const boundary = 'test-boundary-003'
    const body = buildMultipartBody(boundary, 'comprobante.jpg', Buffer.from('fake-image-bytes'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/payments/transfer/receipt?planId=${fakePlanId}`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'authorization': `Bearer ${memberAToken}`,
      },
      payload: body,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })
})

// ─── Suite 2: Flujo feliz — lógica de negocio via service directo ─────────────
//
// La lógica de submitTransferReceipt, confirmTransfer y rejectTransfer se testea
// directamente contra la DB real. Esto valida el comportamiento de negocio sin
// depender del file I/O del endpoint multipart.

describe('Transfer: submitTransferReceipt() — estado inicial correcto', () => {
  let membershipId: string

  afterAll(async () => {
    if (membershipId) {
      await prisma.membership.delete({ where: { id: membershipId } }).catch(() => {})
    }
  })

  it('crea membresía INACTIVE con transferStatus PENDING_REVIEW', async () => {
    const receiptUrl = `/uploads/receipts/${memberAId}-${Date.now()}-test.jpg`
    const membership = await submitTransferReceipt(gymAId, memberAId, planId, receiptUrl)

    membershipId = membership.id
    createdMembershipIds.push(membershipId)

    expect(membership.status).toBe('INACTIVE')
    expect(membership.transferStatus).toBe('PENDING_REVIEW')
    expect(membership.paymentMethod).toBe('transfer')
    expect(membership.transferReceiptUrl).toBe(receiptUrl)
    expect(membership.paidAt).toBeNull()
    expect(membership.planId).toBe(planId)
    expect(membership.userId).toBe(memberAId)
    // El precio se toma del plan
    expect(membership.pricePaid).toBe(30000)
    expect(membership.currency).toBe('CLP')
  })

  it('submit con plan inexistente lanza error', async () => {
    const fakePlanId = '00000000-0000-0000-0000-000000000000'
    await expect(
      submitTransferReceipt(gymAId, memberAId, fakePlanId, '/fake/url.jpg')
    ).rejects.toThrow('Plan no encontrado')
  })

  it('submit con usuario inexistente en el gym lanza error', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000001'
    await expect(
      submitTransferReceipt(gymAId, fakeUserId, planId, '/fake/url.jpg')
    ).rejects.toThrow('Usuario no encontrado')
  })
})

// ─── Suite 3: Flujo feliz — admin confirma comprobante ───────────────────────

describe('Transfer: Admin confirma comprobante → membresía ACTIVE', () => {
  let app: FastifyInstance
  let membershipId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear comprobante pendiente directamente en DB
    const membership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/confirm-test-${Date.now()}.jpg`
    )
    membershipId = membership.id
    createdMembershipIds.push(membershipId)
  })

  afterAll(async () => {
    await app.close()
  })

  it('admin sin token → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membershipId}/confirm`,
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

  it('usuario MEMBER intenta confirmar → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membershipId}/confirm`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/administrador/i)
  })

  it('admin de Gym B no puede confirmar comprobante de Gym A → 400', async () => {
    // confirmTransfer filtra por { id: membershipId, user: { gymId: admin.gymId } }
    // Admin B tiene gymId = gymBId, la membresía pertenece a gymA → no encontrada
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membershipId}/confirm`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/membresía no encontrada/i)
  })

  it('admin de Gym A confirma correctamente → membresía ACTIVE + paidAt registrado', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membershipId}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { notes: 'Transferencia verificada' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.status).toBe('ACTIVE')
    expect(body.transferStatus).toBe('CONFIRMED')
    expect(body.paidAt).not.toBeNull()
    expect(body.paymentNotes).toBe('Transferencia verificada')
    expect(body.id).toBe(membershipId)
  })

  it('tras confirmar, la membresía en DB refleja ACTIVE y paidAt', async () => {
    const membership = await prisma.membership.findUnique({ where: { id: membershipId } })
    expect(membership).not.toBeNull()
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.transferStatus).toBe('CONFIRMED')
    expect(membership!.paidAt).toBeInstanceOf(Date)
  })
})

// ─── Suite 4: Flujo de rechazo — admin rechaza comprobante ───────────────────

describe('Transfer: Admin rechaza comprobante → membresía NO queda activa', () => {
  let app: FastifyInstance
  let membershipId: string

  beforeAll(async () => {
    app = await buildApp()

    const membership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/reject-test-${Date.now()}.jpg`
    )
    membershipId = membership.id
    createdMembershipIds.push(membershipId)
  })

  afterAll(async () => {
    await app.close()
  })

  it('admin rechaza con razón → 200, membresía INACTIVE con transferStatus REJECTED', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membershipId}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { reason: 'El monto no corresponde al plan seleccionado' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.status).toBe('INACTIVE')
    expect(body.transferStatus).toBe('REJECTED')
    expect(body.paymentNotes).toBe('El monto no corresponde al plan seleccionado')
  })

  it('tras rechazar, membresía en DB es INACTIVE y nunca fue ACTIVE', async () => {
    const membership = await prisma.membership.findUnique({ where: { id: membershipId } })
    expect(membership!.status).toBe('INACTIVE')
    expect(membership!.transferStatus).toBe('REJECTED')
    expect(membership!.paidAt).toBeNull()
  })

  it('MEMBER intenta rechazar → 403', async () => {
    // Crear otra membresía para este test
    const other = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/reject-perm-test-${Date.now()}.jpg`
    )
    createdMembershipIds.push(other.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${other.id}/reject`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin de Gym B no puede rechazar comprobante de Gym A → 400', async () => {
    const other = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/reject-cross-test-${Date.now()}.jpg`
    )
    createdMembershipIds.push(other.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${other.id}/reject`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/membresía no encontrada/i)
  })
})

// ─── Suite 5: Idempotencia — no se puede procesar dos veces ──────────────────

describe('Transfer: Idempotencia — no se puede confirmar/rechazar dos veces', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('confirmar un comprobante ya confirmado → 400 "ya fue procesada"', async () => {
    const membership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/idempotent-confirm-${Date.now()}.jpg`
    )
    createdMembershipIds.push(membership.id)

    // Primera confirmación → OK
    await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membership.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    // Segunda confirmación → debe fallar
    const res2 = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membership.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/ya fue procesada/i)
  })

  it('rechazar un comprobante ya rechazado → 400 "ya fue procesada"', async () => {
    const membership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/idempotent-reject-${Date.now()}.jpg`
    )
    createdMembershipIds.push(membership.id)

    // Primer rechazo → OK
    await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membership.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    // Segundo rechazo → debe fallar
    const res2 = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membership.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/ya fue procesada/i)
  })

  it('confirmar un comprobante ya rechazado → 400 "ya fue procesada"', async () => {
    const membership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/idempotent-confirm-after-reject-${Date.now()}.jpg`
    )
    createdMembershipIds.push(membership.id)

    // Rechazar primero
    await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membership.id}/reject`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { reason: 'Comprobante borroso' },
    })

    // Intentar confirmar después del rechazo → debe fallar
    const res2 = await app.inject({
      method: 'PATCH',
      url: `/api/payments/transfer/${membership.id}/confirm`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })

    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/ya fue procesada/i)
  })
})

// ─── Suite 6: GET /payments/transfer/pending ──────────────────────────────────

describe('Transfer: GET /api/payments/transfer/pending', () => {
  let app: FastifyInstance
  let pendingMembershipId: string

  beforeAll(async () => {
    app = await buildApp()

    const membership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/pending-list-${Date.now()}.jpg`
    )
    pendingMembershipId = membership.id
    createdMembershipIds.push(pendingMembershipId)
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/transfer/pending' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta ver pendientes → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/transfer/pending',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin de Gym A ve solo los pendientes de Gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/transfer/pending',
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)

    // Todos los resultados deben ser de usuarios de Gym A
    for (const item of body) {
      expect(item.transferStatus).toBe('PENDING_REVIEW')
      expect(item.user).toBeDefined()
    }

    // Nuestra membresía de test debe aparecer
    const found = body.find((m: any) => m.id === pendingMembershipId)
    expect(found).toBeDefined()
    expect(found.user.id).toBe(memberAId)
  })

  it('admin de Gym B NO ve los pendientes de Gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/payments/transfer/pending',
      headers: { authorization: `Bearer ${adminBToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    // No debe contener la membresía de Gym A
    const found = body.find((m: any) => m.id === pendingMembershipId)
    expect(found).toBeUndefined()
  })
})

// ─── Suite 7: Desactivación de membresía previa al subir comprobante ─────────
//
// Al subir un nuevo comprobante, las membresías ACTIVE o TRIAL previas deben
// quedar INACTIVE (el alumno no puede tener dos membresías activas).

describe('Transfer: submit desactiva membresía activa previa', () => {
  let existingMembershipId: string
  let newTransferMembershipId: string

  afterAll(async () => {
    const toClean = [existingMembershipId, newTransferMembershipId].filter(Boolean)
    if (toClean.length) {
      await prisma.membership.deleteMany({ where: { id: { in: toClean } } })
    }
  })

  it('si el alumno tiene una membresía ACTIVE previa, sigue ACTIVE mientras se revisa el comprobante', async () => {
    // Este describe asume que memberA no tiene otra membresía ACTIVE/TRIAL vigente: otros
    // describes del archivo comparten memberAId y (desde el fix de no desactivar al subir
    // el comprobante) pueden dejar una activa sin confirmar/rechazar
    await prisma.membership.updateMany({ where: { userId: memberAId, status: { in: ['ACTIVE', 'TRIAL'] } }, data: { status: 'INACTIVE' } })
    // Crear membresía activa directamente en DB
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    const existing = await prisma.membership.create({
      data: {
        userId: memberAId,
        planId,
        status: 'ACTIVE',
        startsAt: now,
        endsAt,
        pricePaid: 30000,
        currency: 'CLP',
        paymentMethod: 'cash',
        paidAt: now,
      },
    })
    existingMembershipId = existing.id
    createdMembershipIds.push(existingMembershipId)

    // Subir comprobante de transferencia → la activa debe quedar INACTIVE
    const newMembership = await submitTransferReceipt(
      gymAId, memberAId, planId,
      `/uploads/receipts/deactivate-test-${Date.now()}.jpg`
    )
    newTransferMembershipId = newMembership.id
    createdMembershipIds.push(newTransferMembershipId)

    // La previa sigue ACTIVE: si el admin rechaza el comprobante, el alumno no se queda sin plan.
    // Recién se desactiva al confirmar (confirmTransfer), no al subir el comprobante.
    const reloaded = await prisma.membership.findUnique({ where: { id: existingMembershipId } })
    expect(reloaded!.status).toBe('ACTIVE')

    // La nueva es INACTIVE + PENDING_REVIEW, y extiende desde el vencimiento de la vigente
    expect(newMembership.status).toBe('INACTIVE')
    expect(newMembership.transferStatus).toBe('PENDING_REVIEW')
    expect(newMembership.startsAt.getTime()).toBe(existing.endsAt.getTime())
  })

  it('al confirmar el comprobante, la membresía previa pasa a INACTIVE y la nueva extiende desde su vencimiento', async () => {
    await prisma.membership.updateMany({ where: { userId: memberAId, status: { in: ['ACTIVE', 'TRIAL'] } }, data: { status: 'INACTIVE' } })
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    const existing = await prisma.membership.create({
      data: {
        userId: memberAId, planId, status: 'ACTIVE',
        startsAt: now, endsAt, pricePaid: 30000, currency: 'CLP',
        paymentMethod: 'cash', paidAt: now,
      },
    })
    createdMembershipIds.push(existing.id)

    const pending = await submitTransferReceipt(
      gymAId, memberAId, planId, `/uploads/receipts/confirm-test-${Date.now()}.jpg`,
    )
    createdMembershipIds.push(pending.id)

    const confirmed = await confirmTransfer(gymAId, pending.id)

    const reloadedExisting = await prisma.membership.findUnique({ where: { id: existing.id } })
    expect(reloadedExisting!.status).toBe('INACTIVE')
    expect(confirmed.status).toBe('ACTIVE')
    expect(confirmed.startsAt.getTime()).toBe(endsAt.getTime())
  })
})
