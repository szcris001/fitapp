/**
 * plans.integration.test.ts
 *
 * Tests de integración para plans.service.ts y plans.routes.ts.
 * Cubre: listPlans, createPlan, updatePlan, deactivatePlan, assignMembership,
 * renewMembership — usando la DB real y fastify.inject().
 *
 * NO cubre activateMembership (ya cubierta en activateMembership.integration.test.ts).
 *
 * Fixtures:
 *   - Gym A (qa-plans-gym-a): admin + member + plan activo
 *   - Gym B (qa-plans-gym-b): admin (para tests cross-gym / tenancy)
 *
 * Comportamiento documentado del código real:
 *   - listPlans: solo devuelve planes con isActive=true del gymId del token
 *   - createPlan: no hay constraint unique por nombre — dos planes con mismo nombre
 *     son posibles (el servicio no los impide)
 *   - deactivatePlan: marca isActive=false, NO borra el registro.
 *     Planes con membresías activas se pueden "eliminar" (solo se desactivan).
 *   - assignMembership: desactiva TODAS las membresías ACTIVE/TRIAL del usuario antes de
 *     crear la nueva. Con plan isTrial=true el status pasa a TRIAL y pricePaid=0.
 *   - renewMembership: usa el plan de la última membresía (por createdAt desc). Siempre
 *     crea con status=ACTIVE, startsAt=now, endsAt=now+durationDays.
 *   - updatePlan de plan de otro gym → lanza "Plan no encontrado" → route devuelve 400.
 *   - deactivatePlan de plan de otro gym → lanza "Plan no encontrado" → route devuelve 404.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { planRoutes } from '../plans.routes'
import { prisma } from '../../../lib/prisma'
import { startOfGymDay } from '../../../lib/gym-day'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-plans-gym-a'
const GYM_B_SLUG = 'qa-plans-gym-b'

let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let adminBId: string
let planId: string        // plan activo en Gym A
let trialPlanId: string   // plan trial en Gym A

let adminAToken: string
let memberAToken: string
let adminBToken: string

// IDs creados durante los tests — para cleanup limpio
const createdPlanIds: string[] = []
const createdMembershipIds: string[] = []

// ─── Helper: app Fastify mínima ───────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })

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

  await app.register(planRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

// ─── Setup / Teardown global ──────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existingGym = await prisma.gym.findUnique({ where: { slug } })
    if (existingGym) {
      const users = await prisma.user.findMany({ where: { gymId: existingGym.id }, select: { id: true } })
      if (users.length) {
        await prisma.membership.deleteMany({ where: { userId: { in: users.map(u => u.id) } } })
        await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existingGym.id } })
      await prisma.gym.delete({ where: { id: existingGym.id } })
    }
  }

  // Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Plans Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Plans Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Usuarios Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Plans A', email: 'qa-plans-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Plans A', email: 'qa-plans-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  // Admin Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Plans B', email: 'qa-plans-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  // Plan activo en Gym A (será el plan base para la mayoría de tests)
  const plan = await prisma.plan.create({
    data: { gymId: gymAId, name: 'Plan Mensual QA', priceCents: 50000, currency: 'CLP', durationDays: 30, isActive: true },
  })
  planId = plan.id

  // Plan trial en Gym A
  const trialPlan = await prisma.plan.create({
    data: { gymId: gymAId, name: 'Plan Trial QA', priceCents: 0, currency: 'CLP', durationDays: 7, isActive: true, isTrial: true },
  })
  trialPlanId = trialPlan.id

  // Tokens
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, role: 'ADMIN', name: 'Admin Plans A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, role: 'MEMBER', name: 'Member Plans A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, role: 'ADMIN', name: 'Admin Plans B' })

  await tempApp.close()
})

afterAll(async () => {
  // Limpiar membresías creadas en tests
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  // Limpiar planes extra creados en tests
  if (createdPlanIds.length) {
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
  }
  // Limpiar usuarios y gyms en orden FK
  await prisma.membership.deleteMany({ where: { userId: { in: [adminAId, memberAId, adminBId].filter(Boolean) } } })
  await prisma.user.deleteMany({ where: { id: { in: [adminAId, memberAId, adminBId].filter(Boolean) } } })
  await prisma.plan.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Suite 1: GET /api/plans ──────────────────────────────────────────────────

describe('Plans: GET /api/plans — listar planes', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/plans' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER puede listar (authenticate, no requireAdmin) → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('solo devuelve planes activos del gym del token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Todos deben pertenecer a gymA y estar activos
    for (const plan of body) {
      expect(plan.gymId).toBe(gymAId)
      expect(plan.isActive).toBe(true)
    }

    // El plan base debe aparecer
    const found = body.find((p: any) => p.id === planId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Plan Mensual QA')
  })

  it('admin de Gym B no ve planes de Gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Ningún plan de gymA debe aparecer
    const leak = body.find((p: any) => p.gymId === gymAId)
    expect(leak).toBeUndefined()
  })

  it('planes inactivos NO aparecen en la lista', async () => {
    // Crear y luego desactivar un plan
    const tempPlan = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan Inactivo QA', priceCents: 10000, currency: 'CLP', durationDays: 15, isActive: false },
    })
    createdPlanIds.push(tempPlan.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    const body = res.json()
    const found = body.find((p: any) => p.id === tempPlan.id)
    expect(found).toBeUndefined()
  })
})

// ─── Suite 2: POST /api/plans — crear plan ────────────────────────────────────

describe('Plans: POST /api/plans — crear plan', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      payload: { name: 'Nuevo Plan', priceCents: 20000, durationDays: 30 },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta crear → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { name: 'Plan de Member', priceCents: 20000, durationDays: 30 },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/administrador/i)
  })

  it('body inválido (falta name) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { priceCents: 20000, durationDays: 30 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body inválido (name muy corto, < 2 chars) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'X', priceCents: 20000, durationDays: 30 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body inválido (priceCents negativo) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Inválido', priceCents: -100, durationDays: 30 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body inválido (priceCents fuera del rango de Int4) → 400, no 500 de Postgres', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Precio Enorme', priceCents: 2_147_483_648 }, // > Int4 max (2147483647)
    })
    expect(res.statusCode).toBe(400)
  })

  it('body inválido (maxClasses negativo o cero) → 400', async () => {
    for (const maxClasses of [-5, 0]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: { authorization: `Bearer ${adminAToken}` },
        payload: { name: 'Plan MaxClasses Inválido', priceCents: 10000, maxClasses },
      })
      expect(res.statusCode).toBe(400)
    }
  })

  it('body inválido (currency fuera de la lista soportada) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Moneda Inválida', priceCents: 10000, currency: 'XXXX' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('isTrial:true con priceCents>0 → el servidor fuerza priceCents=0 (no solo el cliente)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Trial Con Precio', priceCents: 9999, isTrial: true },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().priceCents).toBe(0)
    expect(res.json().isTrial).toBe(true)
    createdPlanIds.push(res.json().id)
  })

  it('durationDays enviado se ignora → el plan siempre dura 30 días', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Trimestral QA', priceCents: 10000, durationDays: 90 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().durationDays).toBe(30)
    createdPlanIds.push(res.json().id)

    const upd = await app.inject({
      method: 'PUT',
      url: `/api/plans/${res.json().id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { durationDays: 365 },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().durationDays).toBe(30)
  })

  it('admin crea plan válido → 201 con gymId del token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Nuevo QA', priceCents: 25000, currency: 'CLP', durationDays: 30 },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.gymId).toBe(gymAId)
    expect(body.name).toBe('Plan Nuevo QA')
    expect(body.priceCents).toBe(25000)
    expect(body.durationDays).toBe(30)
    expect(body.isActive).toBe(true)

    createdPlanIds.push(body.id)
  })

  it('currency por defecto es CLP si no se especifica', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Sin Currency', priceCents: 10000, durationDays: 14 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().currency).toBe('CLP')

    createdPlanIds.push(res.json().id)
  })

  it('isTrial se persiste correctamente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Trial Nuevo', priceCents: 0, durationDays: 7, isTrial: true },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.isTrial).toBe(true)

    createdPlanIds.push(body.id)
  })

  it('maxClasses se persiste si se envía', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Con Límite', priceCents: 30000, durationDays: 30, maxClasses: 12 },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.maxClasses).toBe(12)

    createdPlanIds.push(body.id)
  })

  it('gymId en el body NO sobreescribe el gymId del token (tenancy)', async () => {
    // Intentar crear un plan en gymB usando el token de adminA
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Intrusión', priceCents: 10000, durationDays: 30, gymId: gymBId },
    })
    // Puede ser 201 o 400 (el body gymId es ignorado por Zod — no está en schema)
    // Lo importante: si se crea, debe pertenecer a gymAId, no gymBId
    if (res.statusCode === 201) {
      const body = res.json()
      expect(body.gymId).toBe(gymAId)
      createdPlanIds.push(body.id)
    } else {
      // El schema Zod puede rechazarlo si tiene strict mode — también es correcto
      expect([400, 422]).toContain(res.statusCode)
    }
  })
})

// ─── Suite 3: PUT /api/plans/:id — actualizar plan ────────────────────────────

describe('Plans: PUT /api/plans/:id — actualizar plan', () => {
  let app: FastifyInstance
  let targetPlanId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear plan propio para esta suite (evita contaminar planId global)
    const p = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan Actualizable QA', priceCents: 40000, currency: 'CLP', durationDays: 30, isActive: true },
    })
    targetPlanId = p.id
    createdPlanIds.push(targetPlanId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      payload: { name: 'Nuevo Nombre' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta actualizar → 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { name: 'Cambio No Autorizado' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('body inválido (name < 2 chars) → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'X' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('actualizar nombre → 200 con nuevo nombre', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Plan Actualizado QA' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Plan Actualizado QA')
    expect(body.id).toBe(targetPlanId)
    // Los otros campos no cambian
    expect(body.priceCents).toBe(40000)
  })

  it('actualizar priceCents → 200 con nuevo precio', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { priceCents: 55000 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().priceCents).toBe(55000)
  })

  it('actualizar maxClasses a null → se permite (nullable)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { maxClasses: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().maxClasses).toBeNull()
  })

  it('admin de Gym B no puede actualizar plan de Gym A → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${targetPlanId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { name: 'Intrusión Cross-Gym' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('plan inexistente → 400', async () => {
    const fakePlanId = '00000000-0000-0000-0000-000000000000'
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${fakePlanId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Actualización Fantasma' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })
})

// ─── Suite 4: DELETE /api/plans/:id — desactivar plan ────────────────────────

describe('Plans: DELETE /api/plans/:id — desactivar plan', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/plans/${planId}` })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta eliminar → 403', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${planId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('plan inexistente → 404', async () => {
    const fakePlanId = '00000000-0000-0000-0000-000000000000'
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${fakePlanId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('admin de Gym B no puede desactivar plan de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${planId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('admin desactiva plan exitosamente → 200, plan queda isActive=false', async () => {
    // Crear un plan específico para esta operación destructiva
    const p = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan A Desactivar', priceCents: 20000, currency: 'CLP', durationDays: 30, isActive: true },
    })
    createdPlanIds.push(p.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${p.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().message).toMatch(/desactivado/i)

    // Verificar en DB que quedó isActive=false (no borrado)
    const inDb = await prisma.plan.findUnique({ where: { id: p.id } })
    expect(inDb).not.toBeNull()
    expect(inDb!.isActive).toBe(false)
  })

  it('plan desactivado no aparece en GET /plans', async () => {
    // Crear y desactivar
    const p = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan A Desactivar Y Verificar', priceCents: 15000, currency: 'CLP', durationDays: 14, isActive: true },
    })
    createdPlanIds.push(p.id)

    await app.inject({
      method: 'DELETE',
      url: `/api/plans/${p.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    const body = listRes.json()
    const found = body.find((x: any) => x.id === p.id)
    expect(found).toBeUndefined()
  })

  it('plan con membresías activas puede desactivarse (no hay bloqueo)', async () => {
    // El código real de deactivatePlan no verifica si hay membresías — solo marca isActive=false.
    // Este test documenta ese comportamiento intencionalmente.
    const p = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan Con Membresia Activa', priceCents: 30000, currency: 'CLP', durationDays: 30, isActive: true },
    })
    createdPlanIds.push(p.id)

    // Crear membresía activa referenciando ese plan
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const m = await prisma.membership.create({
      data: { userId: memberAId, planId: p.id, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 30000, currency: 'CLP' },
    })
    createdMembershipIds.push(m.id)

    // Desactivar el plan — no debe lanzar error
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${p.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)

    // El plan está desactivado, la membresía sigue ACTIVE
    const inDb = await prisma.plan.findUnique({ where: { id: p.id } })
    expect(inDb!.isActive).toBe(false)
    const mInDb = await prisma.membership.findUnique({ where: { id: m.id } })
    expect(mInDb!.status).toBe('ACTIVE')
  })

  it('plan desactivado SÍ aparece en GET /plans?includeInactive=true', async () => {
    const p = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan A Pausado Visible', priceCents: 10000, currency: 'CLP', durationDays: 30, isActive: false },
    })
    createdPlanIds.push(p.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/plans?includeInactive=true',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const found = res.json().find((x: any) => x.id === p.id)
    expect(found).toBeDefined()
    expect(found.isActive).toBe(false)
  })

  it('PUT /plans/:id {isActive:true} reactiva un plan pausado → vuelve a aparecer en GET /plans', async () => {
    const p = await prisma.plan.create({
      data: { gymId: gymAId, name: 'Plan A Para Reactivar', priceCents: 10000, currency: 'CLP', durationDays: 30, isActive: false },
    })
    createdPlanIds.push(p.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${p.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { isActive: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().isActive).toBe(true)

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(listRes.json().find((x: any) => x.id === p.id)).toBeDefined()
  })
})

// ─── Suite 5: POST /api/memberships — assignMembership ────────────────────────

describe('Plans: POST /api/memberships — assignMembership', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      payload: { userId: memberAId, planId, startsAt: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta asignar → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { userId: memberAId, planId, startsAt: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(403)
  })

  it('body inválido (falta startsAt) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body inválido (userId no es UUID) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: 'not-a-uuid', planId, startsAt: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(400)
  })

  it('usuario inexistente en el gym → 400 "usuario no encontrado"', async () => {
    // UUID v4 válido pero que no existe en la DB
    const fakeUserId = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789'
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: fakeUserId, planId, startsAt: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })

  it('plan inexistente → 400 "plan no encontrado"', async () => {
    // UUID v4 válido pero que no existe en la DB
    const fakePlanId = 'b2c3d4e5-f6a7-4890-bcde-f01234567890'
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId: fakePlanId, startsAt: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('asigna membresía correctamente → 201 con status ACTIVE y endsAt calculado', async () => {
    const startsAt = new Date('2026-06-01T00:00:00.000Z')
    const expectedEndsAt = new Date('2026-07-01T00:00:00.000Z') // +30 días

    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId, startsAt: startsAt.toISOString(), status: 'ACTIVE' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.userId).toBe(memberAId)
    expect(body.planId).toBe(planId)
    expect(body.status).toBe('ACTIVE')
    expect(body.pricePaid).toBe(50000)
    expect(body.currency).toBe('CLP')
    // endsAt debe ser startsAt + 30 días
    const endsAt = new Date(body.endsAt)
    expect(endsAt.toISOString()).toBe(expectedEndsAt.toISOString())
    // include plan y user
    expect(body.plan).toBeDefined()
    expect(body.plan.name).toBe('Plan Mensual QA')
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe('qa-plans-member-a@test.local')

    createdMembershipIds.push(body.id)
  })

  it('plan isTrial → status TRIAL y pricePaid=0 (independiente del campo status enviado)', async () => {
    const startsAt = new Date()

    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId: trialPlanId, startsAt: startsAt.toISOString(), status: 'ACTIVE' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    // Plan isTrial=true → status forzado a TRIAL, pricePaid=0
    expect(body.status).toBe('TRIAL')
    expect(body.pricePaid).toBe(0)
    // endsAt = startsAt + 30 días — assignMembership fuerza siempre 30 días,
    // sin importar el durationDays del plan (decisión 2026-06-13, ver STATE.md)
    const endsAt = new Date(body.endsAt)
    const start = new Date(body.startsAt)
    const diffDays = Math.round((endsAt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)

    createdMembershipIds.push(body.id)
  })

  it('startsAt como fecha sola ("YYYY-MM-DD", como manda el form web) ancla al día calendario de Chile, no UTC', async () => {
    // new Date("2026-10-02") se interpreta como medianoche UTC; sumarle 30*24h con
    // endsAt.setDate() (zona del proceso) da medianoche UTC del 1 de noviembre, que en
    // Chile (UTC-3) cae la noche del 31 de octubre — la membresía "vence" un día antes
    // de lo esperado (QA H01, qa/reports/2026-10-02-1106/alumnos.md).
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId, startsAt: '2026-10-02', status: 'ACTIVE' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    createdMembershipIds.push(body.id)

    expect(body.startsAt).toBe(startOfGymDay('2026-10-02', 'America/Santiago').toISOString())
    expect(body.endsAt).toBe(startOfGymDay('2026-11-01', 'America/Santiago').toISOString())
  })

  it('membresía previa ACTIVE queda INACTIVE al asignar una nueva', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    // Crear membresía activa existente
    const existing = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(existing.id)

    // Asignar nueva membresía
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId, startsAt: now.toISOString() },
    })
    expect(res.statusCode).toBe(201)
    const newM = res.json()
    createdMembershipIds.push(newM.id)

    // La membresía anterior debe estar INACTIVE
    const reloaded = await prisma.membership.findUnique({ where: { id: existing.id } })
    expect(reloaded!.status).toBe('INACTIVE')

    // La nueva está ACTIVE
    expect(newM.status).toBe('ACTIVE')
  })

  it('membresía previa TRIAL también queda INACTIVE (updateMany cubre ACTIVE y TRIAL)', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 7)

    // Crear membresía TRIAL existente
    const existing = await prisma.membership.create({
      data: { userId: memberAId, planId: trialPlanId, status: 'TRIAL', startsAt: now, endsAt, pricePaid: 0, currency: 'CLP' },
    })
    createdMembershipIds.push(existing.id)

    // Asignar plan pagado (no trial)
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { userId: memberAId, planId, startsAt: now.toISOString() },
    })
    expect(res.statusCode).toBe(201)
    createdMembershipIds.push(res.json().id)

    const reloaded = await prisma.membership.findUnique({ where: { id: existing.id } })
    expect(reloaded!.status).toBe('INACTIVE')
  })

  it('admin de Gym B no puede asignar membresía a usuario de Gym A', async () => {
    // memberAId pertenece a gymA. adminBToken tiene gymId=gymBId.
    // El servicio busca user con { id: memberAId, gymId: gymBId } → no encontrado
    const res = await app.inject({
      method: 'POST',
      url: '/api/memberships',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { userId: memberAId, planId, startsAt: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })
})

// ─── Suite 6: POST /api/memberships/:userId/renew — renewMembership ───────────

describe('Plans: POST /api/memberships/:userId/renew — renewMembership', () => {
  let app: FastifyInstance
  let membershipForRenewId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear una membresía previa para que renewMembership tenga historial
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const m = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    membershipForRenewId = m.id
    createdMembershipIds.push(membershipForRenewId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/memberships/${memberAId}/renew` })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta renovar → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/memberships/${memberAId}/renew`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('usuario inexistente en el gym → 400', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000003'
    const res = await app.inject({
      method: 'POST',
      url: `/api/memberships/${fakeUserId}/renew`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })

  it('usuario sin membresía previa → 400 "no hay membresía previa"', async () => {
    // Crear un usuario sin membresías
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const freshUser = await prisma.user.create({
      data: { gymId: gymAId, name: 'Fresh User Renew', email: 'qa-plans-fresh-renew@test.local', passwordHash, role: 'MEMBER' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/memberships/${freshUser.id}/renew`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no hay membresía previa/i)

    // Cleanup del usuario temporal
    await prisma.user.delete({ where: { id: freshUser.id } })
  })

  it('renueva correctamente → 201, status ACTIVE, pricePaid del plan, includes plan y user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/memberships/${memberAId}/renew`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.userId).toBe(memberAId)
    expect(body.planId).toBe(planId)
    expect(body.status).toBe('ACTIVE')
    expect(body.pricePaid).toBe(50000)
    expect(body.currency).toBe('CLP')
    // endsAt = startsAt + 30 días (durationDays del plan)
    const startsAt = new Date(body.startsAt)
    const endsAt = new Date(body.endsAt)
    const diffDays = Math.round((endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)
    // includes
    expect(body.plan).toBeDefined()
    expect(body.plan.name).toBe('Plan Mensual QA')
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe('qa-plans-member-a@test.local')

    createdMembershipIds.push(body.id)
  })

  it('renovar desactiva membresías ACTIVE previas (updateMany)', async () => {
    // Asegurar que hay una membresía ACTIVE creada antes de renovar
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const active = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(active.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/memberships/${memberAId}/renew`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(201)
    createdMembershipIds.push(res.json().id)

    // La activa previa debe estar INACTIVE
    const reloaded = await prisma.membership.findUnique({ where: { id: active.id } })
    expect(reloaded!.status).toBe('INACTIVE')
  })

  it('admin de Gym B no puede renovar membresía de usuario de Gym A', async () => {
    // adminBToken tiene gymId=gymBId. El servicio busca user { id: memberAId, gymId: gymBId } → no encontrado
    const res = await app.inject({
      method: 'POST',
      url: `/api/memberships/${memberAId}/renew`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/usuario no encontrado/i)
  })
})

describe('Plans: PATCH /api/memberships/:id — updateMembership', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('activar una membresía INACTIVE desactiva otras ACTIVE/TRIAL del mismo usuario', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    // Membresía ACTIVE vigente...
    const currentlyActive = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(currentlyActive.id)

    // ...y una INACTIVE que el admin decide reactivar a mano (botón "Activar")
    const toActivate = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'INACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(toActivate.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/memberships/${toActivate.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { status: 'ACTIVE' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ACTIVE')

    const reloadedActive = await prisma.membership.findUnique({ where: { id: currentlyActive.id } })
    expect(reloadedActive!.status).toBe('INACTIVE')

    // Solo una ACTIVE/TRIAL debe quedar para este usuario
    const stillActive = await prisma.membership.count({ where: { userId: memberAId, status: { in: ['ACTIVE', 'TRIAL'] } } })
    expect(stillActive).toBe(1)
  })

  it('extender días (sin status explícito) también desactiva otras ACTIVE/TRIAL', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    const otherActive = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(otherActive.id)

    const toExtend = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'INACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(toExtend.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/memberships/${toExtend.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { extendDays: 10 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ACTIVE')

    const reloadedOther = await prisma.membership.findUnique({ where: { id: otherActive.id } })
    expect(reloadedOther!.status).toBe('INACTIVE')
  })

  it('poner INACTIVE no toca otras membresías del usuario', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)

    const active = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'ACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(active.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/memberships/${active.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { status: 'INACTIVE' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('INACTIVE')
  })

  it('membresía de otro gym → 400 "no encontrada"', async () => {
    const now = new Date()
    const endsAt = new Date(now)
    endsAt.setDate(endsAt.getDate() + 30)
    const m = await prisma.membership.create({
      data: { userId: memberAId, planId, status: 'INACTIVE', startsAt: now, endsAt, pricePaid: 50000, currency: 'CLP' },
    })
    createdMembershipIds.push(m.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/memberships/${m.id}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { status: 'ACTIVE' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no encontrada/i)
  })
})
