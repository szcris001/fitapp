/**
 * analytics.integration.test.ts
 *
 * Tests de integración para el módulo analytics:
 *   - RM records (crear, listar propios, historial por movimiento, evolución del gym)
 *   - GymnasticProgress (crear, listar propios, listar por userId)
 *   - Permisos: MEMBER solo ve sus propios datos, COACH/ADMIN puede ver otros usuarios
 *   - Aislamiento cross-gym: admin Gym B no puede ver datos de usuarios Gym A
 *
 * Lo que el código REALMENTE hace:
 *   - GET /rms/me          → solo devuelve RMs del userId del token (authenticate)
 *   - POST /rms/me         → crea RM para userId del token; valida que user.gymId coincida
 *   - GET /rms/user/:userId → requireCoachOrAdmin; valida que userId pertenezca al gymId del
 *                            requester; devuelve 404 si el usuario no existe en el gym ✓
 *   - GET /rms/gym-evolution → requireCoachOrAdmin; filtra por gymId del token ✓
 *   - GET /gymnastic-progress/me         → authenticate; filtra por userId del token ✓
 *   - POST /gymnastic-progress/me        → authenticate; valida user.gymId del token ✓
 *   - GET /gymnastic-progress/user/:userId → requireCoachOrAdmin; valida que userId pertenezca
 *                                           al gymId del requester; 404 si no está en el gym ✓
 *
 * Fixtures:
 *   - Gym A (qa-analytics-gym-a): adminA + memberA + memberA2
 *   - Gym B (qa-analytics-gym-b): adminB + memberB
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { rmRoutes } from '../rm.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-analytics-gym-a'
const GYM_B_SLUG = 'qa-analytics-gym-b'

let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let memberA2Id: string
let adminBId: string
let memberBId: string

let adminAToken: string
let memberAToken: string
let memberA2Token: string
let adminBToken: string
let memberBToken: string

// IDs de registros creados en tests — para cleanup
const createdRmIds: string[] = []
const createdGymnasticIds: string[] = []

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

  await app.register(rmRoutes, { prefix: '/api' })
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
        await prisma.gymnasticProgress.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.rmRecord.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
      }
      await prisma.gym.delete({ where: { id: existingGym.id } })
    }
  }

  // Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Analytics Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Analytics Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Usuarios Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Analytics A', email: 'qa-analytics-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Analytics A', email: 'qa-analytics-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  const memberA2 = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Analytics A2', email: 'qa-analytics-member-a2@test.local', passwordHash, role: 'MEMBER' },
  })
  memberA2Id = memberA2.id

  // Usuarios Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Analytics B', email: 'qa-analytics-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  const memberB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Member Analytics B', email: 'qa-analytics-member-b@test.local', passwordHash, role: 'MEMBER' },
  })
  memberBId = memberB.id

  // Tokens JWT
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken  = tempApp.jwt.sign({ userId: adminAId,  gymId: gymAId, role: 'ADMIN',  name: 'Admin Analytics A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, role: 'MEMBER', name: 'Member Analytics A' })
  memberA2Token = tempApp.jwt.sign({ userId: memberA2Id, gymId: gymAId, role: 'MEMBER', name: 'Member Analytics A2' })
  adminBToken  = tempApp.jwt.sign({ userId: adminBId,  gymId: gymBId, role: 'ADMIN',  name: 'Admin Analytics B' })
  memberBToken = tempApp.jwt.sign({ userId: memberBId, gymId: gymBId, role: 'MEMBER', name: 'Member Analytics B' })

  await tempApp.close()
})

afterAll(async () => {
  // Limpiar registros creados en tests (por si los afterEach no alcanzaron)
  if (createdRmIds.length) {
    await prisma.rmRecord.deleteMany({ where: { id: { in: createdRmIds } } })
  }
  if (createdGymnasticIds.length) {
    await prisma.gymnasticProgress.deleteMany({ where: { id: { in: createdGymnasticIds } } })
  }

  const allUserIds = [adminAId, memberAId, memberA2Id, adminBId, memberBId].filter(Boolean)
  await prisma.gymnasticProgress.deleteMany({ where: { userId: { in: allUserIds } } })
  await prisma.rmRecord.deleteMany({ where: { userId: { in: allUserIds } } })
  await prisma.membership.deleteMany({ where: { userId: { in: allUserIds } } })
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─── Suite 1: POST /api/rms/me — crear RM ────────────────────────────────────

describe('Analytics RM: POST /api/rms/me', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ movementName: 'Back Squat', weightKg: 100 }),
    })
    expect(res.statusCode).toBe(401)
  })

  it('token MEMBER válido, body completo → 201 con RM creado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ movementName: 'Back Squat', weightKg: 100, notes: 'PR nuevo' }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.movementName).toBe('Back Squat')
    expect(body.weightKg).toBe(100)
    expect(body.userId).toBe(memberAId)
    createdRmIds.push(body.id)
  })

  it('weightKg negativo → 400 (falla validación Zod: debe ser positivo)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ movementName: 'Deadlift', weightKg: -50 }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('weightKg cero → 400 (Zod: z.number().positive() excluye 0)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ movementName: 'Deadlift', weightKg: 0 }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('movementName demasiado corto (<2 chars) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ movementName: 'A', weightKg: 80 }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('movementName ausente → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ weightKg: 80 }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('recordedAt opcional — acepta fecha ISO válida → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({
        movementName: 'Power Clean',
        weightKg: 80,
        recordedAt: '2026-01-15T10:00:00.000Z',
      }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(new Date(body.recordedAt).toISOString()).toBe('2026-01-15T10:00:00.000Z')
    createdRmIds.push(body.id)
  })

  it('token ADMIN puede registrar su propio RM → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rms/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminAToken}` },
      payload: JSON.stringify({ movementName: 'Snatch', weightKg: 90 }),
    })
    expect(res.statusCode).toBe(201)
    createdRmIds.push(res.json().id)
  })
})

// ─── Suite 2: GET /api/rms/me — listar RMs propios ───────────────────────────

describe('Analytics RM: GET /api/rms/me', () => {
  let app: FastifyInstance
  let rmA1Id: string
  let rmA2Id: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear RMs para memberA (dos registros del mismo movimiento + uno de otro)
    const rm1 = await prisma.rmRecord.create({
      data: { userId: memberAId, movementName: 'Clean & Jerk', weightKg: 90, recordedAt: new Date('2026-02-01') },
    })
    const rm2 = await prisma.rmRecord.create({
      data: { userId: memberAId, movementName: 'Clean & Jerk', weightKg: 95, recordedAt: new Date('2026-03-01') },
    })
    const rm3 = await prisma.rmRecord.create({
      data: { userId: memberAId, movementName: 'Overhead Squat', weightKg: 70, recordedAt: new Date('2026-03-15') },
    })
    rmA1Id = rm1.id
    rmA2Id = rm2.id
    createdRmIds.push(rm1.id, rm2.id, rm3.id)

    // Crear RM para memberB (distinto gym) — no debe aparecer en el resultado de memberA
    const rmB = await prisma.rmRecord.create({
      data: { userId: memberBId, movementName: 'Clean & Jerk', weightKg: 110 },
    })
    createdRmIds.push(rmB.id)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rms/me' })
    expect(res.statusCode).toBe(401)
  })

  it('memberA solo ve sus propios RMs — no los de memberB ni memberA2', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/me',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Solo movimientos de memberA
    const movNames = body.map((m: any) => m.movementName)
    expect(movNames).toContain('Clean & Jerk')
    expect(movNames).toContain('Overhead Squat')

    // Ningún registro de memberB (weightKg 110 es el del gym B)
    const allWeights = body.flatMap((m: any) => m.history.map((h: any) => h.weightKg))
    expect(allWeights).not.toContain(110)
  })

  it('respuesta agrupa por movimiento con currentRm = el más reciente (desc)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/me',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    const cj = body.find((m: any) => m.movementName === 'Clean & Jerk')
    expect(cj).toBeDefined()
    // El más reciente es 95 kg (2026-03-01 > 2026-02-01)
    expect(cj.currentRm).toBe(95)
  })

  it('respuesta incluye campo improvement (diferencia entre primer y último registro)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/me',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    const body = res.json()
    const cj = body.find((m: any) => m.movementName === 'Clean & Jerk')
    // improvement = currentRm - oldest = 95 - 90 = 5
    expect(cj.improvement).toBe(5)
  })

  it('un movimiento con un solo registro tiene improvement = 0', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/me',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    const body = res.json()
    const ohs = body.find((m: any) => m.movementName === 'Overhead Squat')
    expect(ohs.improvement).toBe(0)
  })

  it('memberA2 sin RMs → devuelve array vacío', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/me',
      headers: { authorization: `Bearer ${memberA2Token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

// ─── Suite 3: GET /api/rms/user/:userId — admin/coach ve RMs de otro usuario ─

describe('Analytics RM: GET /api/rms/user/:userId', () => {
  let app: FastifyInstance
  let rmForMemberAId: string

  beforeAll(async () => {
    app = await buildApp()
    const rm = await prisma.rmRecord.create({
      data: { userId: memberAId, movementName: 'Front Squat', weightKg: 85 },
    })
    rmForMemberAId = rm.id
    createdRmIds.push(rm.id)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/rms/user/${memberAId}` })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta ver RMs de otro usuario → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rms/user/${memberA2Id}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN de Gym A puede ver RMs de memberA (mismo gym) → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rms/user/${memberAId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const fs = body.find((m: any) => m.movementName === 'Front Squat')
    expect(fs).toBeDefined()
  })

  it('ADMIN de Gym B intenta ver RMs de memberA (cross-gym) → 404 (no revela que el usuario existe)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rms/user/${memberAId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Suite 4: GET /api/rms/gym-evolution — evolución del gym ─────────────────

describe('Analytics RM: GET /api/rms/gym-evolution', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    // RMs para gym A
    const rm1 = await prisma.rmRecord.create({
      data: { userId: memberAId, movementName: 'Thruster', weightKg: 60 },
    })
    const rm2 = await prisma.rmRecord.create({
      data: { userId: adminAId, movementName: 'Thruster', weightKg: 70 },
    })
    createdRmIds.push(rm1.id, rm2.id)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rms/gym-evolution' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/gym-evolution',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN Gym A → 200, solo ve movimientos de usuarios de su gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/gym-evolution',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const thruster = body.find((m: any) => m.movementName === 'Thruster')
    expect(thruster).toBeDefined()
    // avgKg de Thruster para gym A: (60 + 70) / 2 = 65
    expect(thruster.avgKg).toBe(65)
    expect(thruster.maxKg).toBe(70)
    expect(thruster.totalRecords).toBeGreaterThanOrEqual(2)

    // Ningún userId del gym B en los registros de Thruster
    const userIds = thruster.records.map((r: any) => r.userId)
    expect(userIds).not.toContain(memberBId)
  })

  it('ADMIN Gym B → 200, no ve los Thrusters de gym A (aislamiento por gymId correcto)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/gym-evolution',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // gym B no tiene RMs de Thruster — puede que aparezca vacío o no aparezca
    const thruster = body.find((m: any) => m.movementName === 'Thruster')
    if (thruster) {
      // Si hay algún Thruster, ninguno debe ser de gym A
      const userIds = thruster.records.map((r: any) => r.userId)
      expect(userIds).not.toContain(memberAId)
      expect(userIds).not.toContain(adminAId)
    }
    // Si no hay Thruster en gym B: comportamiento correcto
  })
})

// ─── Suite 5: POST /api/gymnastic-progress/me — registrar progreso ────────────

describe('Analytics GymnasticProgress: POST /api/gymnastic-progress/me', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ skillName: 'Pull Up', milestone: 'Primer strict' }),
    })
    expect(res.statusCode).toBe(401)
  })

  it('body completo → 201 con registro creado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({
        skillName: 'Pull Up',
        milestone: 'Primer strict',
        notes: 'Primer intento sin banda',
      }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.skillName).toBe('Pull Up')
    expect(body.milestone).toBe('Primer strict')
    expect(body.userId).toBe(memberAId)
    createdGymnasticIds.push(body.id)
  })

  it('skillName demasiado corto → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ skillName: 'P', milestone: 'Primer strict' }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('milestone demasiado corto → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ skillName: 'Muscle Up', milestone: 'X' }),
    })
    expect(res.statusCode).toBe(400)
  })

  it('achievedAt opcional — acepta fecha ISO → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({
        skillName: 'Handstand Walk',
        milestone: '10 metros',
        achievedAt: '2026-04-01T12:00:00.000Z',
      }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(new Date(body.achievedAt).toISOString()).toBe('2026-04-01T12:00:00.000Z')
    createdGymnasticIds.push(body.id)
  })

  it('múltiples registros del mismo skill son posibles (historial de progresión)', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ skillName: 'Ring Muscle Up', milestone: 'Primer rep asistido' }),
    })
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/gymnastic-progress/me',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${memberAToken}` },
      payload: JSON.stringify({ skillName: 'Ring Muscle Up', milestone: 'Primer rep unassisted' }),
    })
    expect(res1.statusCode).toBe(201)
    expect(res2.statusCode).toBe(201)
    createdGymnasticIds.push(res1.json().id, res2.json().id)
  })
})

// ─── Suite 6: GET /api/gymnastic-progress/me — listar progreso propio ────────

describe('Analytics GymnasticProgress: GET /api/gymnastic-progress/me', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()

    // Crear progresos para memberA2 (distinto del memberA que tiene sus propios)
    const gp1 = await prisma.gymnasticProgress.create({
      data: { userId: memberA2Id, skillName: 'Double Under', milestone: '50 seguidos', achievedAt: new Date('2026-03-10') },
    })
    const gp2 = await prisma.gymnasticProgress.create({
      data: { userId: memberA2Id, skillName: 'Double Under', milestone: '100 seguidos', achievedAt: new Date('2026-04-10') },
    })
    createdGymnasticIds.push(gp1.id, gp2.id)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gymnastic-progress/me' })
    expect(res.statusCode).toBe(401)
  })

  it('memberA2 ve sus propios progresos agrupados por skill', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/gymnastic-progress/me',
      headers: { authorization: `Bearer ${memberA2Token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const du = body.find((s: any) => s.skillName === 'Double Under')
    expect(du).toBeDefined()
    expect(du.milestonesAchieved).toBe(2)
    // latestMilestone = el más reciente (desc por achievedAt)
    expect(du.latestMilestone).toBe('100 seguidos')
  })

  it('memberA2 no ve los progresos de memberA', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/gymnastic-progress/me',
      headers: { authorization: `Bearer ${memberA2Token}` },
    })
    const body = res.json()
    // Pull Up y Handstand Walk son de memberA, no deben aparecer aquí
    const skillNames = body.map((s: any) => s.skillName)
    expect(skillNames).not.toContain('Pull Up')
    expect(skillNames).not.toContain('Handstand Walk')
  })

  it('usuario sin progresos → array vacío', async () => {
    // memberB no tiene progresos registrados
    const res = await app.inject({
      method: 'GET',
      url: '/api/gymnastic-progress/me',
      headers: { authorization: `Bearer ${memberBToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

// ─── Suite 7: GET /api/gymnastic-progress/user/:userId ────────────────────────

describe('Analytics GymnasticProgress: GET /api/gymnastic-progress/user/:userId', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/gymnastic-progress/user/${memberAId}` })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gymnastic-progress/user/${memberA2Id}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN Gym A puede ver progresos de memberA → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gymnastic-progress/user/${memberAId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // memberA tiene Pull Up y Ring Muscle Up al menos
    const skillNames = body.map((s: any) => s.skillName)
    expect(skillNames).toContain('Pull Up')
  })

  it('ADMIN Gym B intenta ver progresos de memberA (cross-gym) → 404 (no revela que el usuario existe)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gymnastic-progress/user/${memberAId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Suite 8: aislamiento self — MEMBER no puede acceder endpoints CoachOrAdmin ─

describe('Analytics: MEMBER no puede acceder endpoints de solo COACH/ADMIN', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('MEMBER → GET /rms/gym-evolution → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rms/gym-evolution',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('MEMBER → GET /rms/user/:userId → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rms/user/${memberAId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('MEMBER → GET /gymnastic-progress/user/:userId → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gymnastic-progress/user/${memberA2Id}`,
      headers: { authorization: `Bearer ${memberBToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
