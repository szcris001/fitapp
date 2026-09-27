/**
 * refresh.integration.test.ts
 *
 * Tests de integración para los endpoints de refresh token:
 *   POST /api/auth/refresh  — rota el refresh token y devuelve nuevo access + refresh token
 *   POST /api/auth/logout   — revoca el refresh token (idempotente, requiere JWT)
 *
 * También verifica que POST /api/auth/login devuelva refreshToken en la respuesta
 * (campo nuevo introducido junto con la tabla RefreshToken).
 *
 * Usa fastify.inject() — sin levantar puerto real.
 * Usa la DB real (fitapp_dev) — sin mocks de Prisma.
 * Limpia sus propios datos en afterAll (RefreshTokens se limpian en cascada con User).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { authRoutes } from '../auth.routes'
import { createRefreshToken } from '../auth.service'
import { prisma } from '../../../lib/prisma'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const TEST_GYM_SLUG = 'qa-refresh-test-gym'
const TEST_GYM_NAME = 'QA Refresh Test Gym'
const TEST_USER_EMAIL = 'qa-refresh-user@auth-test.local'
const TEST_USER2_EMAIL = 'qa-refresh-user2@auth-test.local'
const TEST_PASSWORD = 'password123'
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'

let gymId: string
let userId: string
let userId2: string

// ─── Helper: construir la app Fastify mínima ─────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET })

  // Replica el hook mínimo de index.ts: verifica JWT si hay Authorization header
  app.addHook('preHandler', async (request) => {
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

// ─── Helper: hash SHA-256 (debe coincidir con el de auth.service.ts) ─────────

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Gym idempotente
  const existingGym = await prisma.gym.findUnique({ where: { slug: TEST_GYM_SLUG } })
  let gym = existingGym
  if (!gym) {
    gym = await prisma.gym.create({
      data: { name: TEST_GYM_NAME, slug: TEST_GYM_SLUG, status: 'ACTIVE' },
    })
  }
  gymId = gym.id

  // Limpiar residuos de runs anteriores
  await prisma.user.deleteMany({
    where: { gymId, email: { in: [TEST_USER_EMAIL, TEST_USER2_EMAIL] } },
  })

  const user1 = await prisma.user.create({
    data: { gymId, name: 'QA Refresh User', email: TEST_USER_EMAIL, passwordHash, role: 'MEMBER' },
  })
  userId = user1.id

  const user2 = await prisma.user.create({
    data: { gymId, name: 'QA Refresh User2', email: TEST_USER2_EMAIL, passwordHash, role: 'MEMBER' },
  })
  userId2 = user2.id
})

afterAll(async () => {
  // Los RefreshTokens se eliminan en cascada al borrar el User (onDelete: Cascade)
  await prisma.user.deleteMany({ where: { id: { in: [userId, userId2].filter(Boolean) } } })
  await prisma.gym.deleteMany({ where: { id: gymId } })
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloque 1: login ahora devuelve refreshToken
// ─────────────────────────────────────────────────────────────────────────────

describe('Refresh Token — POST /api/auth/login devuelve refreshToken', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  // Caso 1
  it('login con credenciales válidas → respuesta incluye refreshToken (string no vacío)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBeDefined()
    expect(body.refreshToken).toBeDefined()
    expect(typeof body.refreshToken).toBe('string')
    expect(body.refreshToken.length).toBeGreaterThan(10)
    // refreshToken es distinto del access token
    expect(body.refreshToken).not.toBe(body.token)
  })

  // Caso 2
  it('access token devuelto por login tiene campo exp (tiene expiración)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })

    expect(res.statusCode).toBe(200)
    const { token } = res.json()
    const decoded = app.jwt.decode(token) as any
    expect(decoded.exp).toBeDefined()
    expect(typeof decoded.exp).toBe('number')
    // exp debe estar en el futuro
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  // Caso 3
  it('cada login genera un refreshToken diferente', async () => {
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })

    expect(login1.json().refreshToken).not.toBe(login2.json().refreshToken)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloque 2: POST /api/auth/refresh — rotación del token
// ─────────────────────────────────────────────────────────────────────────────

describe('Refresh Token — POST /api/auth/refresh (rotación)', () => {
  let app: FastifyInstance
  let validRefreshToken: string

  beforeAll(async () => {
    app = await buildApp()

    // Obtener un refresh token válido haciendo login real
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    validRefreshToken = loginRes.json().refreshToken
  })

  afterAll(async () => { await app.close() })

  // Caso 4
  it('refresh con token válido → 200 con nuevo token y nuevo refreshToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: validRefreshToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBeDefined()
    expect(body.refreshToken).toBeDefined()
    expect(typeof body.token).toBe('string')
    expect(typeof body.refreshToken).toBe('string')
    // El nuevo refresh token es distinto del anterior
    expect(body.refreshToken).not.toBe(validRefreshToken)
  })

  // Caso 5
  it('nuevo access token emitido por refresh tiene payload correcto (userId, gymId, role)', async () => {
    // Hacer un login fresco para tener un token limpio
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const freshRefresh = loginRes.json().refreshToken

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: freshRefresh },
    })

    expect(res.statusCode).toBe(200)
    const { token } = res.json()
    const decoded = app.jwt.decode(token) as any
    expect(decoded.userId).toBe(userId)
    expect(decoded.gymId).toBe(gymId)
    expect(decoded.role).toBe('MEMBER')
    expect(decoded.exp).toBeDefined()
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  // Caso 6
  it('POST /api/auth/refresh no requiere header Authorization', async () => {
    // Sin ningún header de auth — debe funcionar igual
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const freshRefresh = loginRes.json().refreshToken

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: freshRefresh },
      // sin headers: {} — ningún Authorization
    })

    expect(res.statusCode).toBe(200)
  })

  // Caso 7
  it('refresh con token ya revocado (usado una vez) → 401', async () => {
    // Hacer login para obtener refresh token fresco
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const onceToken = loginRes.json().refreshToken

    // Primer uso — rota y revoca onceToken
    const firstRefresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: onceToken },
    })
    expect(firstRefresh.statusCode).toBe(200)

    // Segundo uso del mismo token (ya revocado) → 401
    const secondRefresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: onceToken },
    })
    expect(secondRefresh.statusCode).toBe(401)
    expect(secondRefresh.json().error).toBeDefined()
  })

  // Caso 8
  it('refresh con token inexistente (UUID inventado) → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: crypto.randomUUID() },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBeDefined()
  })

  // Caso 9
  it('refresh con token expirado (expiresAt en el pasado) → 401', async () => {
    // Insertar directamente en la DB un refresh token ya expirado
    const raw = crypto.randomUUID()
    const tokenHash = hashToken(raw)
    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() - 1000), // expirado hace 1 segundo
      },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: raw },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toMatch(/expir/i)

    // Cleanup
    await prisma.refreshToken.deleteMany({ where: { tokenHash } })
  })

  // Caso 10
  it('body sin campo refreshToken → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBeDefined()
  })

  // Caso 11
  it('body con refreshToken string vacío → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: '' },
    })

    expect(res.statusCode).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloque 3: rotación encadenada — el token nuevo funciona, el anterior no
// ─────────────────────────────────────────────────────────────────────────────

describe('Refresh Token — Rotación encadenada', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  // Caso 12
  it('usar el refreshToken rotado (el nuevo) → funciona correctamente', async () => {
    // Login → refresh1
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const refresh1 = loginRes.json().refreshToken

    // Primer refresh: consume refresh1, devuelve refresh2
    const firstRotation = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refresh1 },
    })
    expect(firstRotation.statusCode).toBe(200)
    const refresh2 = firstRotation.json().refreshToken

    // Segundo refresh: usa refresh2 (el rotado) → debe funcionar
    const secondRotation = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refresh2 },
    })
    expect(secondRotation.statusCode).toBe(200)
    expect(secondRotation.json().token).toBeDefined()
    expect(secondRotation.json().refreshToken).toBeDefined()
  })

  // Caso 13
  it('usar el refreshToken anterior tras rotarlo → 401 (fue revocado)', async () => {
    // Login → refresh1
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const refresh1 = loginRes.json().refreshToken

    // Rotar: refresh1 queda revocado, nace refresh2
    const rotation = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refresh1 },
    })
    expect(rotation.statusCode).toBe(200)

    // Intentar usar refresh1 otra vez → 401
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refresh1 },
    })
    expect(reuse.statusCode).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloque 4: POST /api/auth/logout — revocación
// ─────────────────────────────────────────────────────────────────────────────

describe('Refresh Token — POST /api/auth/logout (revocación)', () => {
  let app: FastifyInstance
  let userToken: string
  let user2Token: string

  beforeAll(async () => {
    app = await buildApp()

    // Obtener token del usuario principal
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    userToken = login1.json().token

    // Obtener token del usuario secundario
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER2_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    user2Token = login2.json().token
  })

  afterAll(async () => { await app.close() })

  // Caso 14
  it('logout sin JWT → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refreshToken: crypto.randomUUID() },
    })

    expect(res.statusCode).toBe(401)
  })

  // Caso 15
  it('logout con JWT válido y refreshToken válido → 200 y token queda revocado', async () => {
    // Login para obtener un refresh token fresco
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const { refreshToken } = loginRes.json()

    // Logout: revocar el refresh token
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { refreshToken },
    })
    expect(logoutRes.statusCode).toBe(200)
    expect(logoutRes.json().message).toBeDefined()

    // Verificar que el token quedó revocado: intentar refresh → 401
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    })
    expect(refreshRes.statusCode).toBe(401)
  })

  // Caso 16
  it('logout idempotente — segunda llamada con mismo token → 200 (no error)', async () => {
    // Login para obtener un refresh token fresco
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const { refreshToken } = loginRes.json()

    // Primera llamada de logout
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { refreshToken },
    })
    expect(first.statusCode).toBe(200)

    // Segunda llamada con el mismo token (ya revocado) → no error, idempotente
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { refreshToken },
    })
    expect(second.statusCode).toBe(200)
  })

  // Caso 17
  it('logout con refreshToken de otro usuario → no-op silencioso (200, el token ajeno sigue activo)', async () => {
    // Usuario2 hace login y obtiene su refresh token
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER2_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    const { refreshToken: user2RefreshToken } = login2.json()

    // Usuario1 intenta revocar el token de Usuario2 — debe ser no-op
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { refreshToken: user2RefreshToken },
    })
    expect(logoutRes.statusCode).toBe(200) // no error, pero tampoco revocó nada

    // El token de usuario2 sigue válido
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: user2RefreshToken },
    })
    expect(refreshRes.statusCode).toBe(200)
  })

  // Caso 18
  it('logout con refreshToken inexistente (UUID inventado) → no-op silencioso (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { refreshToken: crypto.randomUUID() },
    })

    expect(res.statusCode).toBe(200)
  })

  // Caso 19
  it('logout sin body refreshToken → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })

  // Caso 20
  it('logout con JWT expirado → 401', async () => {
    const expiredToken = app.jwt.sign(
      { userId, gymId, email: TEST_USER_EMAIL, role: 'MEMBER' },
      { expiresIn: -1 },
    )

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${expiredToken}` },
      payload: { refreshToken: crypto.randomUUID() },
    })

    expect(res.statusCode).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloque 5: flujo completo end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe('Refresh Token — Flujo completo E2E', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  // Caso 21
  it('login → refresh → usar nuevo access token → logout → refresh falla', async () => {
    // 1. Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_USER_EMAIL, password: TEST_PASSWORD, gymSlug: TEST_GYM_SLUG },
    })
    expect(loginRes.statusCode).toBe(200)
    const { token: accessToken1, refreshToken: refreshToken1 } = loginRes.json()
    expect(accessToken1).toBeDefined()
    expect(refreshToken1).toBeDefined()

    // 2. Refresh: obtener nuevo par de tokens
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refreshToken1 },
    })
    expect(refreshRes.statusCode).toBe(200)
    const { token: accessToken2, refreshToken: refreshToken2 } = refreshRes.json()
    expect(accessToken2).toBeDefined()
    expect(refreshToken2).toBeDefined()
    expect(refreshToken2).not.toBe(refreshToken1)

    // 3. El nuevo access token funciona para /auth/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: `Bearer ${accessToken2}` },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().email).toBe(TEST_USER_EMAIL)

    // 4. Logout con el nuevo refresh token
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${accessToken2}` },
      payload: { refreshToken: refreshToken2 },
    })
    expect(logoutRes.statusCode).toBe(200)

    // 5. Intentar refresh con el token revocado → 401
    const postLogoutRefresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refreshToken2 },
    })
    expect(postLogoutRefresh.statusCode).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloque: refresh mantiene la sede activa tras /gyms/switch-sede
// ─────────────────────────────────────────────────────────────────────────────

describe('Refresh Token — sede activa (gymId en el body)', () => {
  const ADMIN_EMAIL = 'qa-refresh-admin@auth-test.local'
  const SEDE_SLUGS = ['qa-refresh-sede-owned', 'qa-refresh-sede-foreign', 'qa-refresh-sede-suspended']
  let app: FastifyInstance
  let adminId: string
  let ownedSedeId: string
  let foreignSedeId: string
  let suspendedSedeId: string

  const refresh = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/auth/refresh', payload })

  beforeAll(async () => {
    app = await buildApp()
    await prisma.gym.deleteMany({ where: { slug: { in: SEDE_SLUGS } } })
    await prisma.user.deleteMany({ where: { gymId, email: ADMIN_EMAIL } })

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    adminId = (await prisma.user.create({
      data: { gymId, name: 'QA Refresh Admin', email: ADMIN_EMAIL, passwordHash, role: 'ADMIN' },
    })).id
    ownedSedeId = (await prisma.gym.create({
      data: { name: 'QA Sede Owned', slug: SEDE_SLUGS[0], status: 'ACTIVE', ownerEmail: ADMIN_EMAIL },
    })).id
    foreignSedeId = (await prisma.gym.create({
      data: { name: 'QA Sede Foreign', slug: SEDE_SLUGS[1], status: 'ACTIVE', ownerEmail: 'otro@auth-test.local' },
    })).id
    suspendedSedeId = (await prisma.gym.create({
      data: { name: 'QA Sede Suspended', slug: SEDE_SLUGS[2], status: 'SUSPENDED', ownerEmail: ADMIN_EMAIL },
    })).id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: adminId } })
    await prisma.gym.deleteMany({ where: { slug: { in: SEDE_SLUGS } } })
    await app.close()
  })

  it('sin gymId → token con el gym propio del usuario', async () => {
    const res = await refresh({ refreshToken: await createRefreshToken(adminId) })
    expect(res.statusCode).toBe(200)
    const decoded = app.jwt.decode(res.json().token) as any
    expect(decoded.gymId).toBe(gymId)
    expect(decoded.role).toBe('ADMIN')
  })

  it('gymId de una sede propia → token con esa sede', async () => {
    const res = await refresh({ refreshToken: await createRefreshToken(adminId), gymId: ownedSedeId })
    expect(res.statusCode).toBe(200)
    const decoded = app.jwt.decode(res.json().token) as any
    expect(decoded.gymId).toBe(ownedSedeId)
    expect(decoded.userId).toBe(adminId)
  })

  it('gymId de una sede ajena → 401', async () => {
    const res = await refresh({ refreshToken: await createRefreshToken(adminId), gymId: foreignSedeId })
    expect(res.statusCode).toBe(401)
  })

  it('gymId de una sede propia suspendida → 401', async () => {
    const res = await refresh({ refreshToken: await createRefreshToken(adminId), gymId: suspendedSedeId })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER no puede usar gymId para cambiar de gym → 401', async () => {
    const res = await refresh({ refreshToken: await createRefreshToken(userId), gymId: ownedSedeId })
    expect(res.statusCode).toBe(401)
  })
})
