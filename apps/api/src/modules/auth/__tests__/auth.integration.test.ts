/**
 * auth.integration.test.ts
 *
 * Tests de integración para el módulo de autenticación.
 * Usa fastify.inject() — sin levantar puerto real.
 * Usa la DB real (fitapp_dev) — sin mocks de Prisma.
 * Limpia sus propios datos con IDs conocidos al finalizar.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { authRoutes } from '../auth.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const TEST_GYM_SLUG = 'qa-auth-test-gym'
const TEST_GYM_NAME = 'QA Auth Test Gym'
const TEST_ADMIN_EMAIL = 'qa-admin@auth-test.local'
const TEST_MEMBER_EMAIL = 'qa-member@auth-test.local'
const TEST_SUPERADMIN_EMAIL = 'qa-superadmin@auth-test.local'
const TEST_PASSWORD = 'password123'
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'

// IDs creados durante setup — usados para cleanup limpio en afterAll
let gymId: string
let adminUserId: string
let memberUserId: string
let superAdminUserId: string

// ─── Helper: construir la app Fastify mínima para auth ───────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // JWT — mismo secret que la app real
  await app.register(jwt, { secret: JWT_SECRET })

  // Hook de preHandler que replica el de index.ts (verifica gym activo)
  // Para estos tests lo dejamos simplificado: solo verificamos JWT cuando hay token
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/') || !request.headers.authorization) return
    try {
      await request.jwtVerify()
    } catch {
      // Las rutas individuales manejan el 401
    }
  })

  await app.register(authRoutes, { prefix: '/api' })

  await app.ready()
  return app
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Crear gym de test (idempotente: si ya existe por crash anterior, lo reutiliza)
  const existingGym = await prisma.gym.findUnique({ where: { slug: TEST_GYM_SLUG } })

  let gym = existingGym
  if (!gym) {
    gym = await prisma.gym.create({
      data: {
        name: TEST_GYM_NAME,
        slug: TEST_GYM_SLUG,
        status: 'ACTIVE',
      },
    })
  }
  gymId = gym.id

  // Limpiar usuarios residuales de runs anteriores (solo los de este gym)
  await prisma.user.deleteMany({
    where: {
      gymId,
      email: { in: [TEST_ADMIN_EMAIL, TEST_MEMBER_EMAIL] },
    },
  })

  // Crear ADMIN en el gym de test
  const admin = await prisma.user.create({
    data: {
      gymId,
      name: 'QA Admin',
      email: TEST_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminUserId = admin.id

  // Crear MEMBER en el gym de test
  const member = await prisma.user.create({
    data: {
      gymId,
      name: 'QA Member',
      email: TEST_MEMBER_EMAIL,
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberUserId = member.id

  // Limpiar superadmin residual
  await prisma.user.deleteMany({
    where: {
      email: TEST_SUPERADMIN_EMAIL,
      role: 'SUPER_ADMIN',
      gymId: null,
    },
  })

  // Crear SUPER_ADMIN (sin gymId, así es como funciona el login path de superadmin)
  const superAdmin = await prisma.user.create({
    data: {
      gymId: null,
      name: 'QA SuperAdmin',
      email: TEST_SUPERADMIN_EMAIL,
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  })
  superAdminUserId = superAdmin.id
})

afterAll(async () => {
  // Limpieza quirúrgica — solo borramos lo que creamos
  await prisma.user.deleteMany({
    where: { id: { in: [adminUserId, memberUserId, superAdminUserId].filter(Boolean) } },
  })
  await prisma.gym.deleteMany({
    where: { id: gymId },
  })
  await prisma.$disconnect()
})

// ─── Suite principal ───────────────────────────────────────────────────────────

describe('Auth Integration — POST /api/auth/login', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Caso 1: credenciales válidas de usuario de gym ──────────────────────────
  it('login con credenciales válidas de ADMIN → 200 + token JWT + payload correcto', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_ADMIN_EMAIL,
        password: TEST_PASSWORD,
        gymSlug: TEST_GYM_SLUG,
      },
    })

    expect(response.statusCode).toBe(200)

    const body = response.json()
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
    expect(body.token.split('.')).toHaveLength(3) // es un JWT válido (3 partes)

    // Verificar payload del JWT
    const decoded = app.jwt.decode(body.token) as any
    expect(decoded.email).toBe(TEST_ADMIN_EMAIL)
    expect(decoded.role).toBe('ADMIN')
    expect(decoded.gymId).toBe(gymId)
    expect(decoded.userId).toBeDefined()

    // Verificar objeto user en la respuesta
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe(TEST_ADMIN_EMAIL)
    expect(body.user.role).toBe('ADMIN')
    // El hash de contraseña NUNCA debe estar en la respuesta
    expect(body.user.passwordHash).toBeUndefined()
  })

  // ── Caso 2: password incorrecto ──────────────────────────────────────────────
  it('login con password incorrecto → 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_ADMIN_EMAIL,
        password: 'contraseña_incorrecta',
        gymSlug: TEST_GYM_SLUG,
      },
    })

    expect(response.statusCode).toBe(401)
    const body = response.json()
    expect(body.error).toBeDefined()
    // El mensaje no debe revelar si el email existe (evitar enumeración)
    expect(body.error).toMatch(/inválid/i)
  })

  // ── Caso 3: email inexistente en el gym ─────────────────────────────────────
  it('login con email inexistente en el gym → 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'no-existe@never.com',
        password: TEST_PASSWORD,
        gymSlug: TEST_GYM_SLUG,
      },
    })

    expect(response.statusCode).toBe(401)
    const body = response.json()
    expect(body.error).toBeDefined()
  })

  // ── Caso 4: body malformado (sin email) ─────────────────────────────────────
  it('login sin campo email → 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        password: TEST_PASSWORD,
        gymSlug: TEST_GYM_SLUG,
      },
    })

    expect(response.statusCode).toBe(400)
  })

  // ── Caso 5: body malformado (sin password) ───────────────────────────────────
  it('login sin campo password → 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_ADMIN_EMAIL,
        gymSlug: TEST_GYM_SLUG,
      },
    })

    expect(response.statusCode).toBe(400)
  })

  // ── Caso 6: gymSlug inexistente ─────────────────────────────────────────────
  it('login con gymSlug que no existe → 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_ADMIN_EMAIL,
        password: TEST_PASSWORD,
        gymSlug: 'gym-que-no-existe-nunca',
      },
    })

    expect(response.statusCode).toBe(401)
    const body = response.json()
    expect(body.error).toMatch(/gimnasio no encontrado/i)
  })

  // ── Caso 7: login superadmin (sin gymSlug) ───────────────────────────────────
  it('login de SUPER_ADMIN sin gymSlug → 200 + token con role SUPER_ADMIN', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_SUPERADMIN_EMAIL,
        password: TEST_PASSWORD,
        // sin gymSlug — path de superadmin
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.token).toBeDefined()

    const decoded = app.jwt.decode(body.token) as any
    expect(decoded.role).toBe('SUPER_ADMIN')
    expect(decoded.gymId).toBeNull()
  })

  // ── Caso 8: credenciales de gym usadas en path superadmin (sin gymSlug) ──────
  it('usuario de gym intenta login sin gymSlug (path superadmin) → 401', async () => {
    // Un ADMIN de gym NO es SUPER_ADMIN, por lo que el path sin gymSlug debe fallar
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_ADMIN_EMAIL,
        password: TEST_PASSWORD,
        // sin gymSlug — solo busca SUPER_ADMIN en la DB
      },
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('Auth Integration — GET /api/auth/me (ruta protegida)', () => {
  let app: FastifyInstance
  let memberToken: string
  let adminToken: string

  beforeAll(async () => {
    app = await buildApp()

    // Obtener tokens válidos haciendo login real
    const memberLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_MEMBER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    memberToken = memberLogin.json().token

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_ADMIN_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    adminToken = adminLogin.json().token
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Caso 9: ruta protegida sin token ─────────────────────────────────────────
  it('GET /api/auth/me sin token → 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(401)
    const body = response.json()
    expect(body.error).toBeDefined()
  })

  // ── Caso 10: ruta protegida con token de MEMBER → 200 ───────────────────────
  it('GET /api/auth/me con token MEMBER válido → 200 + datos del usuario', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${memberToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.email).toBe(TEST_MEMBER_EMAIL)
    expect(body.role).toBe('MEMBER')
    expect(body.id).toBe(memberUserId)
    // passwordHash nunca en respuesta
    expect(body.passwordHash).toBeUndefined()
  })

  // ── Caso 11: ruta protegida con token de ADMIN → 200 ────────────────────────
  it('GET /api/auth/me con token ADMIN válido → 200 + datos del usuario', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.email).toBe(TEST_ADMIN_EMAIL)
    expect(body.role).toBe('ADMIN')
  })

  // ── Caso 12: token inválido (string basura) ──────────────────────────────────
  it('GET /api/auth/me con token inválido (basura) → 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: 'Bearer esto.no.es.un.jwt.valido' },
    })

    expect(response.statusCode).toBe(401)
  })

  // ── Caso 13: token expirado (generado con exp en el pasado) ─────────────────
  it('GET /api/auth/me con token expirado → 401', async () => {
    // Generamos un token que expiró hace 1 segundo
    const expiredToken = app.jwt.sign(
      { userId: memberUserId, gymId, email: TEST_MEMBER_EMAIL, role: 'MEMBER' },
      { expiresIn: -1 }, // expirado en el pasado
    )

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${expiredToken}` },
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('Auth Integration — Gym SUSPENDIDO', () => {
  let app: FastifyInstance
  let suspendedGymId: string
  let suspendedUserId: string
  const SUSPENDED_GYM_SLUG = 'qa-suspended-gym'

  beforeAll(async () => {
    app = await buildApp()
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

    // Limpiar residuos de runs anteriores
    const existingSuspended = await prisma.gym.findUnique({ where: { slug: SUSPENDED_GYM_SLUG } })
    if (existingSuspended) {
      await prisma.user.deleteMany({ where: { gymId: existingSuspended.id } })
      await prisma.gym.delete({ where: { id: existingSuspended.id } })
    }

    const suspendedGym = await prisma.gym.create({
      data: {
        name: 'QA Suspended Gym',
        slug: SUSPENDED_GYM_SLUG,
        status: 'SUSPENDED',
      },
    })
    suspendedGymId = suspendedGym.id

    const suspendedUser = await prisma.user.create({
      data: {
        gymId: suspendedGymId,
        name: 'QA Suspended User',
        email: 'qa-suspended-user@auth-test.local',
        passwordHash,
        role: 'MEMBER',
      },
    })
    suspendedUserId = suspendedUser.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: suspendedUserId } })
    await prisma.gym.deleteMany({ where: { id: suspendedGymId } })
    await app.close()
  })

  // ── Caso 14: login en gym SUSPENDIDO → 401 ───────────────────────────────────
  it('login en gym con status SUSPENDED → 401 con mensaje de suspensión', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'qa-suspended-user@auth-test.local',
        password: TEST_PASSWORD,
        gymSlug: SUSPENDED_GYM_SLUG,
      },
    })

    expect(response.statusCode).toBe(401)
    const body = response.json()
    expect(body.error).toMatch(/suspendido/i)
  })
})

describe('Auth Integration — PUT /api/auth/me (actualizar perfil)', () => {
  let app: FastifyInstance
  let memberToken: string

  beforeAll(async () => {
    app = await buildApp()

    const memberLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_MEMBER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    memberToken = memberLogin.json().token
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Caso 15: actualizar nombre sin token → 401 ───────────────────────────────
  it('PUT /api/auth/me sin token → 401', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/me',
      payload: { name: 'Nuevo Nombre' },
    })

    expect(response.statusCode).toBe(401)
  })

  // ── Caso 16: actualizar nombre con token válido → 200 ────────────────────────
  it('PUT /api/auth/me con token válido — actualizar nombre → 200', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: { name: 'QA Member Actualizado' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.name).toBe('QA Member Actualizado')

    // Restaurar el nombre original para no romper otros tests
    await app.inject({
      method: 'PUT',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: { name: 'QA Member' },
    })
  })

  // ── Caso 17: cambiar password con contraseña actual incorrecta → 400 ─────────
  it('PUT /api/auth/me — cambiar password con contraseña actual incorrecta → 400', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: {
        currentPassword: 'contraseña_incorrecta',
        newPassword: 'nuevaPassword456',
      },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toMatch(/contraseña actual incorrecta/i)
  })

  // ── Caso 18: newPassword sin currentPassword → 400 ───────────────────────────
  it('PUT /api/auth/me — newPassword sin currentPassword → 400', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: { newPassword: 'nuevaPassword456' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toMatch(/contraseña actual/i)
  })
})
