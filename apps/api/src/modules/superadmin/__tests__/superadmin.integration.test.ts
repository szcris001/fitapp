/**
 * superadmin.integration.test.ts
 *
 * Tests de integración para el módulo superadmin.
 * Cubre: gyms CRUD, stats, control de acceso, fitapp-plans, gym-subscriptions, config.
 * Usa fastify.inject() — sin levantar puerto real.
 * Usa DB real (fitapp_dev) — sin mocks de Prisma.
 *
 * Casos cubiertos:
 *   1. Control de acceso requireSuperAdmin (sin token, ADMIN, MEMBER, SUPER_ADMIN)
 *   2. GET /superadmin/gyms — lista y campos
 *   3. GET /superadmin/stats — claves del response
 *   4. POST /superadmin/gyms — validación, slug duplicado, éxito, cleanup
 *   5. PATCH /superadmin/gyms/:id/status — gym inexistente, status inválido, éxito
 *   6. DELETE /superadmin/gyms/:id — gym inexistente, éxito (soft delete) + history
 *   7. FitApp Plans CRUD — GET, POST, PATCH, DELETE
 *   8. Gym Subscriptions — GET list, POST crear suscripción
 *   9. Platform Config — GET y PATCH
 *
 * Setup:
 *   - Un SUPER_ADMIN sintético (JWT firmado, sin usuario real en DB)
 *   - Un Gym A de control con ADMIN real para tests de acceso denegado
 *   - FitAppPlan de prueba para tests de suscripción
 *
 * Cleanup:
 *   - Todos los gyms, usuarios y planes creados se eliminan en afterAll por ID
 */

// ─── Mock de sendWelcomeEmail (debe ir antes de cualquier import que lo use) ───
vi.mock('../../../lib/email', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ previewUrl: 'https://ethereal.email/test' }),
  sendBulkToGyms:   vi.fn().mockResolvedValue({ sent: 0, failed: 0, errors: [] }),
}))

// ─── Mock de payments para evitar llamadas a Stripe en tests de superadmin ────
vi.mock('../../payments/payments.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../payments/payments.service')>()
  return {
    ...original,
    createGymSubscriptionCheckout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
    getGymSubscriptionStatus: vi.fn().mockResolvedValue({ status: 'TRIAL', plan: null, sub: null }),
  }
})

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { superAdminRoutes } from '../superadmin.routes'
import { fitAppPlansRoutes } from '../fitapp-plans.routes'
import { gymSubscriptionsRoutes } from '../gym-subscriptions.routes'
import { platformConfigRoutes } from '../config.routes'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

// Slugs de fixtures (prefijo qa-sa para aislamiento)
const CTRL_GYM_SLUG  = 'qa-sa-ctrl-gym'
const NEW_GYM_SLUG   = 'qa-sa-new-gym'
const NEW_GYM_SLUG_2 = 'qa-sa-new-gym-2'  // para test de slug duplicado intentando crear uno igual

// IDs de entidades creadas en setup — para cleanup limpio en afterAll
let ctrlGymId:   string
let ctrlAdminId: string
let ctrlMemberId: string

// IDs de entidades creadas durante los tests
const createdGymIds:    string[] = []
const createdUserIds:   string[] = []
const createdPlanIds:   string[] = []

// Tokens JWT
let superAdminToken: string
let adminToken:      string
let memberToken:     string

// ─── Helper: construir la app Fastify con los módulos de superadmin ───────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })

  // Registrar los 4 sub-módulos del superadmin
  await app.register(superAdminRoutes,    { prefix: '/api' })
  await app.register(fitAppPlansRoutes,   { prefix: '/api' })
  await app.register(gymSubscriptionsRoutes, { prefix: '/api' })
  await app.register(platformConfigRoutes,   { prefix: '/api' })

  await app.ready()
  return app
}

// ─── Helpers para limpiar residuos de runs previos ────────────────────────────

async function cleanupGymBySlugs(slugs: string[]) {
  for (const slug of slugs) {
    const gym = await prisma.gym.findFirst({ where: { slug } })
    if (!gym) continue
    // Orden: booking → membership → user → plan → gymSubscription → gym
    const userIds = (await prisma.user.findMany({ where: { gymId: gym.id }, select: { id: true } })).map(u => u.id)
    if (userIds.length) {
      await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.user.deleteMany({ where: { gymId: gym.id } })
    }
    await prisma.plan.deleteMany({ where: { gymId: gym.id } })
    await prisma.gymSubscription.deleteMany({ where: { gymId: gym.id } })
    await prisma.gym.delete({ where: { id: gym.id } })
  }
}

// ─── Setup / Teardown global ──────────────────────────────────────────────────

beforeAll(async () => {
  // Limpiar residuos de runs anteriores
  await cleanupGymBySlugs([CTRL_GYM_SLUG, NEW_GYM_SLUG, NEW_GYM_SLUG_2])

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Gym de control para tests de acceso denegado
  const ctrlGym = await prisma.gym.create({
    data: { name: 'QA SA Control Gym', slug: CTRL_GYM_SLUG, status: 'ACTIVE' },
  })
  ctrlGymId = ctrlGym.id

  const ctrlAdmin = await prisma.user.create({
    data: { gymId: ctrlGymId, name: 'QA SA Admin', email: 'qa-sa-admin@test.local', passwordHash, role: 'ADMIN' },
  })
  ctrlAdminId = ctrlAdmin.id

  const ctrlMember = await prisma.user.create({
    data: { gymId: ctrlGymId, name: 'QA SA Member', email: 'qa-sa-member@test.local', passwordHash, role: 'MEMBER' },
  })
  ctrlMemberId = ctrlMember.id

  // Generar tokens con una app temporal
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  // SUPER_ADMIN: gymId null, no tiene usuario real en DB (solo necesitamos el JWT)
  superAdminToken = tempApp.jwt.sign({
    userId: '00000000-0000-0000-0000-000000000001',
    gymId: null,
    email: 'superadmin@fitapp.internal',
    role: 'SUPER_ADMIN',
    name: 'Super Admin QA',
  })

  adminToken = tempApp.jwt.sign({
    userId: ctrlAdminId,
    gymId: ctrlGymId,
    email: 'qa-sa-admin@test.local',
    role: 'ADMIN',
    name: 'QA SA Admin',
  })

  memberToken = tempApp.jwt.sign({
    userId: ctrlMemberId,
    gymId: ctrlGymId,
    email: 'qa-sa-member@test.local',
    role: 'MEMBER',
    name: 'QA SA Member',
  })

  await tempApp.close()
})

afterAll(async () => {
  // Limpiar gyms creados durante los tests (incluyendo sus suscripciones y usuarios)
  for (const gymId of createdGymIds) {
    try {
      const userIds = (await prisma.user.findMany({ where: { gymId }, select: { id: true } })).map(u => u.id)
      if (userIds.length) {
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.user.deleteMany({ where: { gymId } })
      }
      await prisma.plan.deleteMany({ where: { gymId } })
      await prisma.gymSubscription.deleteMany({ where: { gymId } })
      await prisma.gym.delete({ where: { id: gymId } }).catch(() => {/* ya eliminado */})
    } catch { /* ignorar errores de cleanup */ }
  }

  // Limpiar usuarios extra creados
  if (createdUserIds.length) {
    await prisma.booking.deleteMany({ where: { userId: { in: createdUserIds } } })
    await prisma.membership.deleteMany({ where: { userId: { in: createdUserIds } } })
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  }

  // Limpiar planes de FitApp creados en tests
  if (createdPlanIds.length) {
    await prisma.gymSubscription.deleteMany({ where: { planId: { in: createdPlanIds } } })
    await prisma.fitAppPlan.deleteMany({ where: { id: { in: createdPlanIds } } })
  }

  // Limpiar gym de control
  const fixtureUserIds = [ctrlAdminId, ctrlMemberId].filter(Boolean)
  if (fixtureUserIds.length) {
    await prisma.booking.deleteMany({ where: { userId: { in: fixtureUserIds } } })
    await prisma.membership.deleteMany({ where: { userId: { in: fixtureUserIds } } })
    await prisma.user.deleteMany({ where: { id: { in: fixtureUserIds } } })
  }
  if (ctrlGymId) {
    await prisma.gymSubscription.deleteMany({ where: { gymId: ctrlGymId } })
    await prisma.gym.delete({ where: { id: ctrlGymId } }).catch(() => {})
  }

  await prisma.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Control de acceso — requireSuperAdmin
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: control de acceso requireSuperAdmin', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('sin token → 401 en GET /superadmin/gyms', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/superadmin/gyms' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toHaveProperty('error')
  })

  it('token de ADMIN (rol de gym) → 403 en GET /superadmin/gyms', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/super administrador/i)
  })

  it('token de MEMBER → 403 en GET /superadmin/gyms', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${memberToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/super administrador/i)
  })

  it('token de SUPER_ADMIN → 200 en GET /superadmin/gyms', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: GET /superadmin/gyms — lista y campos
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: GET /api/superadmin/gyms', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('respuesta es un array con gyms del sistema', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    // El gym de control debe aparecer
    const found = body.find((g: any) => g.id === ctrlGymId)
    expect(found).toBeDefined()
  })

  it('cada gym incluye campos id, name, slug, status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const gyms = res.json()
    expect(gyms.length).toBeGreaterThan(0)

    const ctrlGym = gyms.find((g: any) => g.id === ctrlGymId)
    expect(ctrlGym).toBeDefined()
    expect(ctrlGym).toHaveProperty('id')
    expect(ctrlGym).toHaveProperty('name')
    expect(ctrlGym).toHaveProperty('slug', CTRL_GYM_SLUG)
    expect(ctrlGym).toHaveProperty('status', 'ACTIVE')
    // Incluye _count con users y classes
    expect(ctrlGym).toHaveProperty('_count')
    expect(ctrlGym._count).toHaveProperty('users')
    expect(ctrlGym._count).toHaveProperty('classes')
  })

  it('gyms con deletedAt != null NO aparecen en la lista activa', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const gyms = res.json()
    // Ningún gym listado debe tener deletedAt (soft-deleted)
    for (const g of gyms) {
      expect(g.deletedAt).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: GET /superadmin/stats
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: GET /api/superadmin/stats', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('devuelve objeto con claves de stats del sistema', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/stats',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('totalGyms')
    expect(body).toHaveProperty('activeGyms')
    expect(body).toHaveProperty('suspendedGyms')
    expect(body).toHaveProperty('totalUsers')
    expect(body).toHaveProperty('totalMembers')
    expect(body).toHaveProperty('deletedGyms')

    // Todos los valores son números no negativos
    expect(typeof body.totalGyms).toBe('number')
    expect(body.totalGyms).toBeGreaterThanOrEqual(0)
    expect(body.activeGyms).toBeGreaterThanOrEqual(0)
    expect(body.suspendedGyms).toBeGreaterThanOrEqual(0)
  })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/superadmin/stats' })
    expect(res.statusCode).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: POST /superadmin/gyms
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: POST /api/superadmin/gyms', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('sin body → 400 Zod (campos requeridos faltantes)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error')
  })

  it('slug inválido (con mayúsculas) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymName: 'Test Gym',
        gymSlug: 'INVALID-SLUG',
        adminName: 'Admin Test',
        adminEmail: 'admin@test.local',
        adminPassword: 'pass123',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('adminPassword muy corta (menos de 6 caracteres) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymName: 'Test Gym',
        gymSlug: 'qa-sa-short-pass',
        adminName: 'Admin Test',
        adminEmail: 'admin-short@test.local',
        adminPassword: '123',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('slug duplicado (gym activo con mismo slug) → 409', async () => {
    // El gym de control ya usa CTRL_GYM_SLUG
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymName: 'Gym Duplicado',
        gymSlug: CTRL_GYM_SLUG,
        adminName: 'Admin Dup',
        adminEmail: 'admin-dup@test.local',
        adminPassword: 'password123',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/slug/i)
  })

  it('crea gym correctamente → 201 con gym.id, gym.slug, admin.email', async () => {
    const { sendWelcomeEmail } = await import('../../../lib/email')
    const mockEmail = vi.mocked(sendWelcomeEmail)
    mockEmail.mockClear()

    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymName: 'QA SA New Gym',
        gymSlug: NEW_GYM_SLUG,
        adminName: 'Admin New Gym',
        adminEmail: 'qa-sa-new-gym-admin@test.local',
        adminPassword: 'password123',
        subscriptionPlan: 'trial',
        trialDays: 30,
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()

    expect(body).toHaveProperty('gym')
    expect(body).toHaveProperty('admin')
    expect(body.gym.id).toBeDefined()
    expect(body.gym.slug).toBe(NEW_GYM_SLUG)
    expect(body.admin.email).toBe('qa-sa-new-gym-admin@test.local')
    // Con trialDays > 0 el servicio pasa el gym a TRIAL después de crearlo (y de la
    // suscripción) — la respuesta debe reflejar ese estado, no el ACTIVE con el que
    // se creó originalmente (QA H04, qa/reports/2026-10-02-1106/superadmin.md)
    expect(body.gym.status).toBe('TRIAL')
    expect((await prisma.gym.findUnique({ where: { id: body.gym.id } }))!.status).toBe('TRIAL')

    // Guardar para cleanup
    createdGymIds.push(body.gym.id)

    // sendWelcomeEmail fue llamado una vez
    expect(mockEmail).toHaveBeenCalledOnce()
    expect(mockEmail).toHaveBeenCalledWith(expect.objectContaining({
      adminEmail: 'qa-sa-new-gym-admin@test.local',
      gymSlug: NEW_GYM_SLUG,
    }))
  })

  it('el gym recién creado aparece en GET /superadmin/gyms', async () => {
    // Encontrar el gym por slug
    const gymInDb = await prisma.gym.findFirst({ where: { slug: NEW_GYM_SLUG } })
    expect(gymInDb).not.toBeNull()

    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const gyms = res.json()
    const found = gyms.find((g: any) => g.slug === NEW_GYM_SLUG)
    expect(found).toBeDefined()
    expect(found.name).toBe('QA SA New Gym')
  })

  it('respuesta incluye emailPreviewUrl del mock de sendWelcomeEmail', async () => {
    // Crear un segundo gym para verificar emailPreviewUrl
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymName: 'QA SA New Gym 2',
        gymSlug: NEW_GYM_SLUG_2,
        adminName: 'Admin New Gym 2',
        adminEmail: 'qa-sa-new-gym-2-admin@test.local',
        adminPassword: 'password123',
        subscriptionPlan: 'trial',
        trialDays: 30,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    createdGymIds.push(body.gym.id)

    // El mock devuelve { previewUrl: 'https://ethereal.email/test' }
    expect(body.emailPreviewUrl).toBe('https://ethereal.email/test')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: PATCH /superadmin/gyms/:id/status
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: PATCH /api/superadmin/gyms/:id/status', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('gym inexistente → 400 (Prisma lanza error de registro no encontrado)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/superadmin/gyms/00000000-0000-0000-0000-000000000000/status',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { status: 'SUSPENDED' },
    })
    // Prisma lanza P2025 (record not found) → prismaErrorMessage lo captura → 400
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error')
  })

  it('status inválido → 400 con mensaje descriptivo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/superadmin/gyms/${ctrlGymId}/status`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { status: 'INVALIDO' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/estado inválido/i)
  })

  it('cambia status ACTIVE → SUSPENDED correctamente', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/superadmin/gyms/${ctrlGymId}/status`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { status: 'SUSPENDED' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('SUSPENDED')

    // Restaurar a ACTIVE para no afectar otros tests
    await app.inject({
      method: 'PATCH',
      url: `/api/superadmin/gyms/${ctrlGymId}/status`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { status: 'ACTIVE' },
    })
  })

  it('cambia status a TRIAL → 200', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/superadmin/gyms/${ctrlGymId}/status`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { status: 'TRIAL' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('TRIAL')

    // Restaurar
    await app.inject({
      method: 'PATCH',
      url: `/api/superadmin/gyms/${ctrlGymId}/status`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { status: 'ACTIVE' },
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: DELETE /superadmin/gyms/:id (soft delete) + history
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: DELETE /api/superadmin/gyms/:id (soft delete)', () => {
  let app: FastifyInstance
  let targetGymId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear un gym dedicado para el test de delete (evitar usar el ctrl gym)
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const gym = await prisma.gym.create({
      data: { name: 'QA SA Delete Target', slug: 'qa-sa-delete-target', status: 'ACTIVE' },
    })
    targetGymId = gym.id
    createdGymIds.push(targetGymId)

    // Usuario admin del gym para cleanup
    const user = await prisma.user.create({
      data: { gymId: targetGymId, name: 'Delete Admin', email: 'qa-sa-delete-admin@test.local', passwordHash, role: 'ADMIN' },
    })
    createdUserIds.push(user.id)
  })

  afterAll(async () => { await app.close() })

  it('gym inexistente → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/superadmin/gyms/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })

  it('soft delete exitoso → gym aparece con deletedAt en history', async () => {
    // Eliminar el gym
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/superadmin/gyms/${targetGymId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(deleteRes.statusCode).toBe(200)
    const deleted = deleteRes.json()
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.status).toBe('SUSPENDED')

    // Verificar que ya NO aparece en la lista activa
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(listRes.statusCode).toBe(200)
    const active = listRes.json()
    const found = active.find((g: any) => g.id === targetGymId)
    expect(found).toBeUndefined()

    // Verificar que aparece en history
    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms/history',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(historyRes.statusCode).toBe(200)
    const history = historyRes.json()
    const inHistory = history.find((g: any) => g.id === targetGymId)
    expect(inHistory).toBeDefined()
    expect(inHistory.deletedAt).not.toBeNull()
  })

  it('intentar eliminar un gym ya eliminado → 400', async () => {
    // targetGymId ya fue soft-deleted en el test anterior
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/superadmin/gyms/${targetGymId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/ya está eliminado/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6b: DELETE /superadmin/gyms/:id/permanent (cascade delete completo)
//
// Verifica que borrar permanentemente un gym (tras el soft delete) atraviesa
// varios niveles de FKs vía `onDelete: Cascade`: Gym → User/Plan/ClassType →
// Class/Membership → Booking. Antes del cambio de schema, `prisma.gym.delete`
// fallaba siempre con 400 ("existe una referencia relacionada") en cuanto el
// gym tenía al menos un User (vía Plan/ClassType, que eran RESTRICT).
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: DELETE /api/superadmin/gyms/:id/permanent (cascade delete)', () => {
  let app: FastifyInstance
  let gymId: string
  let adminId: string
  let coachId: string
  let memberId: string
  let planId: string
  let classTypeId: string
  let classId: string
  let membershipId: string
  let bookingId: string

  beforeAll(async () => {
    app = await buildApp()

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

    const gym = await prisma.gym.create({
      data: { name: 'QA SA Cascade Target', slug: 'qa-sa-cascade-target', status: 'ACTIVE' },
    })
    gymId = gym.id

    const admin = await prisma.user.create({
      data: { gymId, name: 'Cascade Admin', email: 'qa-sa-cascade-admin@test.local', passwordHash, role: 'ADMIN' },
    })
    adminId = admin.id

    const coach = await prisma.user.create({
      data: { gymId, name: 'Cascade Coach', email: 'qa-sa-cascade-coach@test.local', passwordHash, role: 'COACH' },
    })
    coachId = coach.id

    const member = await prisma.user.create({
      data: { gymId, name: 'Cascade Member', email: 'qa-sa-cascade-member@test.local', passwordHash, role: 'MEMBER' },
    })
    memberId = member.id

    const plan = await prisma.plan.create({
      data: { gymId, name: 'Plan Cascade', priceCents: 10000 },
    })
    planId = plan.id

    const classType = await prisma.classType.create({
      data: { gymId, name: 'CrossFit Cascade', discipline: 'CROSSFIT' },
    })
    classTypeId = classType.id

    const startsAt = new Date()
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)
    const klass = await prisma.class.create({
      data: { gymId, classTypeId, coachId, startsAt, endsAt, capacity: 10 },
    })
    classId = klass.id

    const membershipEndsAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const membership = await prisma.membership.create({
      data: { userId: memberId, planId, status: 'ACTIVE', startsAt, endsAt: membershipEndsAt, pricePaid: 10000 },
    })
    membershipId = membership.id

    const booking = await prisma.booking.create({
      data: { userId: memberId, classId, status: 'CONFIRMED' },
    })
    bookingId = booking.id
  })

  afterAll(async () => {
    await app.close()
    // No cleanup manual: si el test de cascade delete pasó, ya no queda nada
    // que limpiar. Si falló antes de llegar al delete, se limpia por las dudas.
    await prisma.booking.deleteMany({ where: { id: bookingId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { id: membershipId } }).catch(() => {})
    await prisma.class.deleteMany({ where: { id: classId } }).catch(() => {})
    await prisma.classType.deleteMany({ where: { id: classTypeId } }).catch(() => {})
    await prisma.plan.deleteMany({ where: { id: planId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: [adminId, coachId, memberId] } } }).catch(() => {})
    await prisma.gym.deleteMany({ where: { id: gymId } }).catch(() => {})
  })

  it('permanent delete sin soft-delete previo → 400', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/superadmin/gyms/${gymId}/permanent`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/historial/i)
  })

  it('soft-delete + permanent delete → 200 y borra Gym, User, Plan, ClassType, Class, Membership y Booking', async () => {
    // Paso 1: soft delete (precondición del endpoint permanent)
    const softRes = await app.inject({
      method: 'DELETE',
      url: `/api/superadmin/gyms/${gymId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(softRes.statusCode).toBe(200)
    expect(softRes.json().deletedAt).not.toBeNull()

    // Paso 2: permanent delete
    const hardRes = await app.inject({
      method: 'DELETE',
      url: `/api/superadmin/gyms/${gymId}/permanent`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(hardRes.statusCode).toBe(200)
    expect(hardRes.json()).toEqual({ ok: true })

    // El gym y TODA su data relacionada deben haber desaparecido de la DB real
    expect(await prisma.gym.findUnique({ where: { id: gymId } })).toBeNull()
    expect(await prisma.user.findUnique({ where: { id: adminId } })).toBeNull()
    expect(await prisma.user.findUnique({ where: { id: coachId } })).toBeNull()
    expect(await prisma.user.findUnique({ where: { id: memberId } })).toBeNull()
    expect(await prisma.plan.findUnique({ where: { id: planId } })).toBeNull()
    expect(await prisma.classType.findUnique({ where: { id: classTypeId } })).toBeNull()
    expect(await prisma.class.findUnique({ where: { id: classId } })).toBeNull()
    expect(await prisma.membership.findUnique({ where: { id: membershipId } })).toBeNull()
    expect(await prisma.booking.findUnique({ where: { id: bookingId } })).toBeNull()
  })

  it('gym inexistente → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/superadmin/gyms/00000000-0000-0000-0000-000000000000/permanent',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: GET /superadmin/gyms/:id — detalle individual
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: GET /api/superadmin/gyms/:id', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('devuelve detalle del gym con users (ADMIN) y _count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/superadmin/gyms/${ctrlGymId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(ctrlGymId)
    expect(body.slug).toBe(CTRL_GYM_SLUG)
    expect(Array.isArray(body.users)).toBe(true)
    // El usuario admin del ctrl gym debe aparecer
    const admin = body.users.find((u: any) => u.id === ctrlAdminId)
    expect(admin).toBeDefined()
    expect(admin).toHaveProperty('email', 'qa-sa-admin@test.local')
    // El passwordHash NO debe exponerse
    expect(admin.passwordHash).toBeUndefined()
    expect(body._count).toHaveProperty('users')
    expect(body._count).toHaveProperty('classes')
  })

  it('gym inexistente → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gyms/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: FitApp Plans CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: FitApp Plans CRUD', () => {
  let app: FastifyInstance
  let testPlanId: string

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('GET /superadmin/fitapp-plans → lista planes (incluyendo los del sistema)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/fitapp-plans',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const plans = res.json()
    expect(Array.isArray(plans)).toBe(true)
    // Cada plan tiene las propiedades clave
    for (const plan of plans) {
      expect(plan).toHaveProperty('id')
      expect(plan).toHaveProperty('name')
      expect(plan).toHaveProperty('slug')
      expect(plan).toHaveProperty('priceCLP')
      expect(plan).toHaveProperty('durationDays')
    }
  })

  it('POST /superadmin/fitapp-plans → crea plan con name, priceCLP, durationDays', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/fitapp-plans',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'QA Test Plan',
        priceCLP: 49900,
        priceUSD: 49,
        durationDays: 30,
        features: ['Feature A', 'Feature B'],
        isFree: false,
        color: 'green',
      },
    })
    expect(res.statusCode).toBe(201)
    const plan = res.json()
    expect(plan).toHaveProperty('id')
    expect(plan.name).toBe('QA Test Plan')
    expect(plan.priceCLP).toBe(49900)
    expect(plan.durationDays).toBe(30)
    // El slug se genera automáticamente como `plan_${Date.now()}`
    expect(plan.slug).toMatch(/^plan_\d+$/)

    testPlanId = plan.id
    createdPlanIds.push(testPlanId)
  })

  it('POST /superadmin/fitapp-plans — priceCLP faltante → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/fitapp-plans',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Sin precio' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error')
  })

  it('PATCH /superadmin/fitapp-plans/:id → actualiza nombre y precio del plan', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/superadmin/fitapp-plans/${testPlanId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'QA Test Plan Actualizado',
        priceCLP: 59900,
      },
    })
    expect(res.statusCode).toBe(200)
    const plan = res.json()
    expect(plan.name).toBe('QA Test Plan Actualizado')
    expect(plan.priceCLP).toBe(59900)
    expect(plan.id).toBe(testPlanId)
  })

  it('DELETE /superadmin/fitapp-plans/:id → elimina plan sin suscripciones activas', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/superadmin/fitapp-plans/${testPlanId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // Verificar que ya no existe en la lista
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/superadmin/fitapp-plans',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    const plans = listRes.json()
    const found = plans.find((p: any) => p.id === testPlanId)
    expect(found).toBeUndefined()

    // Ya eliminado — remover de la lista de cleanup para evitar error en afterAll
    const idx = createdPlanIds.indexOf(testPlanId)
    if (idx !== -1) createdPlanIds.splice(idx, 1)
  })

  it('DELETE /superadmin/fitapp-plans/:id — plan inexistente → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/superadmin/fitapp-plans/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9: Gym Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: Gym Subscriptions', () => {
  let app: FastifyInstance
  let trialPlanId: string

  beforeAll(async () => {
    app = await buildApp()

    // Buscar el plan 'trial' del sistema (creado por ensureFitAppPlans en startup)
    // Si no existe, crearlo nosotros para el test
    const existing = await prisma.fitAppPlan.findFirst({ where: { slug: 'trial' } })
    if (existing) {
      trialPlanId = existing.id
    } else {
      const plan = await prisma.fitAppPlan.create({
        data: {
          name: 'Trial QA',
          slug: `trial-qa-${Date.now()}`,
          priceCLP: 0,
          priceUSD: 0,
          durationDays: 30,
          isFree: true,
          features: [],
        },
      })
      trialPlanId = plan.id
      createdPlanIds.push(trialPlanId)
    }
  })

  afterAll(async () => { await app.close() })

  it('GET /superadmin/gym-subscriptions → lista suscripciones con gym y plan incluidos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/gym-subscriptions',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const subs = res.json()
    expect(Array.isArray(subs)).toBe(true)
    // Si hay suscripciones, cada una tiene gym y plan
    for (const sub of subs) {
      expect(sub).toHaveProperty('gymId')
      expect(sub).toHaveProperty('planId')
      expect(sub).toHaveProperty('status')
      expect(sub).toHaveProperty('gym')
      expect(sub).toHaveProperty('plan')
    }
  })

  it('POST /superadmin/gym-subscriptions → crea suscripción para el gym de control', async () => {
    // Cancelar cualquier suscripción activa previa del ctrl gym
    await prisma.gymSubscription.updateMany({
      where: { gymId: ctrlGymId, status: { in: ['ACTIVE', 'TRIAL'] } },
      data: { status: 'CANCELLED' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gym-subscriptions',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymId: ctrlGymId,
        planId: trialPlanId,
      },
    })
    expect(res.statusCode).toBe(201)
    const sub = res.json()
    expect(sub.gymId).toBe(ctrlGymId)
    expect(sub.planId).toBe(trialPlanId)
    // Plan gratuito → status TRIAL
    expect(sub.status).toBe('TRIAL')
    expect(sub).toHaveProperty('startsAt')
    expect(sub).toHaveProperty('endsAt')
    expect(sub).toHaveProperty('plan')
  })

  it('POST /superadmin/gym-subscriptions — planId inexistente → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gym-subscriptions',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        gymId: ctrlGymId,
        planId: '00000000-0000-0000-0000-000000000000',
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/plan no encontrado/i)
  })

  it('POST /superadmin/gym-subscriptions — body vacío → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/superadmin/gym-subscriptions',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error')
  })

  it('GET /superadmin/gym-subscriptions/:gymId → suscripción activa del gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/superadmin/gym-subscriptions/${ctrlGymId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const sub = res.json()
    // Puede ser null si no hay suscripción activa o TRIAL
    if (sub !== null) {
      expect(sub.gymId).toBe(ctrlGymId)
      expect(['ACTIVE', 'TRIAL']).toContain(sub.status)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 10: Platform Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Superadmin: Platform Config', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async ()  => { await app.close() })

  it('GET /superadmin/config → devuelve configuración con campos SMTP', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/superadmin/config',
      headers: { authorization: `Bearer ${superAdminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Siempre tiene estos campos (pueden ser null)
    expect(body).toHaveProperty('smtpHost')
    expect(body).toHaveProperty('smtpPort')
    expect(body).toHaveProperty('smtpUser')
    expect(body).toHaveProperty('smtpPass')
    expect(body).toHaveProperty('smtpFrom')
    expect(body).toHaveProperty('subExpiryReminderDays')
    // El ID es 'system'
    expect(body.id).toBe('system')
  })

  it('PATCH /superadmin/config → actualiza subExpiryReminderDays', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/superadmin/config',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { subExpiryReminderDays: 14 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.subExpiryReminderDays).toBe(14)

    // Restaurar al default
    await app.inject({
      method: 'PATCH',
      url: '/api/superadmin/config',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { subExpiryReminderDays: 7 },
    })
  })

  it('PATCH /superadmin/config — subExpiryReminderDays = 0 → 400 Zod (min 1)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/superadmin/config',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { subExpiryReminderDays: 0 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('error')
  })

  it('PATCH /superadmin/config — smtpPass = "••••••••" no sobrescribe el valor actual', async () => {
    // Primero configurar un pass real
    await app.inject({
      method: 'PATCH',
      url: '/api/superadmin/config',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { smtpPass: 'mi-pass-real' },
    })

    // Ahora enviar el valor enmascarado — no debe sobrescribir
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/superadmin/config',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { smtpHost: 'smtp.test.com', smtpPass: '••••••••' },
    })
    expect(res.statusCode).toBe(200)

    // Verificar en DB que smtpPass sigue siendo 'mi-pass-real'
    const settings = await prisma.platformSettings.findUnique({ where: { id: 'system' } })
    expect(settings?.smtpPass).toBe('mi-pass-real')

    // El response muestra el pass enmascarado
    expect(res.json().smtpPass).toBe('••••••••')

    // Cleanup — limpiar el pass
    await prisma.platformSettings.update({ where: { id: 'system' }, data: { smtpPass: null, smtpHost: null } })
  })

  it('GET /superadmin/config — sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/superadmin/config' })
    expect(res.statusCode).toBe(401)
  })
})
