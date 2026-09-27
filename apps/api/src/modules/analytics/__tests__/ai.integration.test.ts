/**
 * ai.integration.test.ts
 *
 * Tests de integración para el módulo de IA de retención:
 *   - GET /ai/retention-alerts — lógica pura de DB (sin mock de Anthropic)
 *   - GET /ai/insights          — consulta DB + llama Anthropic (con mock)
 *   - GET /ai/athlete-projection/:userId — consulta DB + llama Anthropic (con mock)
 *
 * Fixtures:
 *   - Gym A (qa-ai-gym-a): adminA + memberAtRisk + memberExpiring + memberInactive
 *   - Gym B (qa-ai-gym-b): adminB + memberB
 *
 * Gotcha crítico: ai.service.ts instancia `new Anthropic()` en el top-level del módulo.
 * Esto requiere vi.hoisted() para que el mock del constructor esté listo antes de que
 * el módulo sea importado por Vitest (mismo patrón que expo-server-sdk en push.ts).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'

// ─── Mock de Anthropic con vi.hoisted() ──────────────────────────────────────
// Obligatorio porque ai.service.ts hace `const anthropic = new Anthropic(...)` en
// el top-level. vi.hoisted() garantiza que mockMessagesCreate esté inicializado
// ANTES de que vi.mock() (que se eleva) ejecute el factory.
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockMessagesCreate }
    },
  }
})

// Importar después del mock
import { aiRoutes } from '../ai.routes'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-ai-gym-a'
const GYM_B_SLUG = 'qa-ai-gym-b'

let gymAId: string
let gymBId: string
let adminAId: string
let memberAtRiskId: string
let memberExpiringId: string
let memberInactiveId: string
let adminBId: string
let memberBId: string

let adminAToken: string
let memberAtRiskToken: string
let adminBToken: string

// IDs de registros de DB creados en tests de insight/projection — para cleanup
const createdRmIds: string[] = []
const createdMembershipIds: string[] = []

// IDs de clases y classTypes creados para setup de bookings
const createdClassIds: string[] = []
const createdClassTypeIds: string[] = []

// ─── Helper: respuesta Anthropic por defecto ──────────────────────────────────

function defaultInsightsResponse() {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          insights: [
            { title: 'Test insight', description: 'Descripción test', priority: 'high' },
          ],
          summary: 'Resumen de prueba',
        }),
      },
    ],
  }
}

function defaultProjectionResponse() {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          projections: [
            { movement: 'Back Squat', currentKg: 100, projectedKg: 110, weeksToGoal: 8, confidence: 'medium' },
          ],
          nextMilestones: [
            { skill: 'Muscle Up', nextMilestone: 'Primer rep strict', estimatedWeeks: 4 },
          ],
          coachTip: 'Mantén la consistencia en el entrenamiento y prioriza el descanso.',
        }),
      },
    ],
  }
}

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

  await app.register(aiRoutes, { prefix: '/api' })
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
      const userIds = users.map(u => u.id)
      if (userIds.length) {
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.rmRecord.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.gymnasticProgress.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.user.deleteMany({ where: { gymId: existingGym.id } })
      }
      const classes = await prisma.class.findMany({ where: { gymId: existingGym.id }, select: { id: true } })
      if (classes.length) {
        await prisma.class.deleteMany({ where: { gymId: existingGym.id } })
      }
      await prisma.classType.deleteMany({ where: { gymId: existingGym.id } })
      await prisma.gym.delete({ where: { id: existingGym.id } })
    }
  }

  // Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA AI Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA AI Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Admin Gym A
  const adminA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Admin AI A',
      email: 'qa-ai-admin-a@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Miembro en riesgo (ACTIVE, sin bookings en los últimos 7 días)
  const memberAtRisk = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member At Risk',
      email: 'qa-ai-member-atrisk@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberAtRiskId = memberAtRisk.id

  // Crear membresía ACTIVE para memberAtRisk (vence en 60 días — no aparece en expiringSoon)
  const msAtRisk = await prisma.membership.create({
    data: {
      userId: memberAtRiskId,
      planId: await getOrCreatePlan(gymAId),
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      pricePaid: 50000,
    },
  })
  createdMembershipIds.push(msAtRisk.id)
  // No se crean bookings para este miembro — cumple condición atRisk

  // Miembro con membresía que vence en 3 días
  const memberExpiring = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member Expiring',
      email: 'qa-ai-member-expiring@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberExpiringId = memberExpiring.id

  const endsAt3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const msExpiring = await prisma.membership.create({
    data: {
      userId: memberExpiringId,
      planId: await getOrCreatePlan(gymAId),
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: endsAt3Days,
      pricePaid: 50000,
    },
  })
  createdMembershipIds.push(msExpiring.id)

  // Miembro inactivo (sin membresía ACTIVE, updatedAt reciente por Prisma @updatedAt)
  const memberInactive = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'Member Inactive',
      email: 'qa-ai-member-inactive@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberInactiveId = memberInactive.id
  // No se crea membresía — cumple condición inactive (ninguna ACTIVE, updatedAt gte 14d ago)

  // Admin Gym B
  const adminB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Admin AI B',
      email: 'qa-ai-admin-b@test.local',
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminBId = adminB.id

  // Miembro Gym B con membresía ACTIVE y sin bookings (para test multi-tenancy)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'Member AI B',
      email: 'qa-ai-member-b@test.local',
      passwordHash,
      role: 'MEMBER',
    },
  })
  memberBId = memberB.id

  const msBGym = await prisma.membership.create({
    data: {
      userId: memberBId,
      planId: await getOrCreatePlan(gymBId),
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      pricePaid: 50000,
    },
  })
  createdMembershipIds.push(msBGym.id)

  // Tokens JWT
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, role: 'ADMIN', name: 'Admin AI A' })
  memberAtRiskToken = tempApp.jwt.sign({ userId: memberAtRiskId, gymId: gymAId, role: 'MEMBER', name: 'Member At Risk' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, role: 'ADMIN', name: 'Admin AI B' })

  await tempApp.close()
})

afterAll(async () => {
  const allUserIds = [adminAId, memberAtRiskId, memberExpiringId, memberInactiveId, adminBId, memberBId].filter(Boolean)

  if (createdRmIds.length) {
    await prisma.rmRecord.deleteMany({ where: { id: { in: createdRmIds } } })
  }
  if (createdClassIds.length) {
    await prisma.booking.deleteMany({ where: { classId: { in: createdClassIds } } })
    await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } })
  }
  if (createdClassTypeIds.length) {
    await prisma.classType.deleteMany({ where: { id: { in: createdClassTypeIds } } })
  }
  if (createdMembershipIds.length) {
    await prisma.membership.deleteMany({ where: { id: { in: createdMembershipIds } } })
  }
  await prisma.gymnasticProgress.deleteMany({ where: { userId: { in: allUserIds } } })
  await prisma.rmRecord.deleteMany({ where: { userId: { in: allUserIds } } })
  await prisma.membership.deleteMany({ where: { userId: { in: allUserIds } } })
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } })

  // Limpiar planes del gym A y B (creados por getOrCreatePlan)
  await prisma.plan.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })

  await prisma.$disconnect()
})

// ─── Helper: obtener o crear plan mínimo para el gym ─────────────────────────
// Cacheamos por gymId para evitar duplicados dentro del mismo beforeAll
const planCache: Record<string, string> = {}

async function getOrCreatePlan(gymId: string): Promise<string> {
  if (planCache[gymId]) return planCache[gymId]
  const plan = await prisma.plan.create({
    data: {
      gymId,
      name: 'Plan Test AI',
      priceCents: 50000,
      durationDays: 30,
    },
  })
  planCache[gymId] = plan.id
  return plan.id
}

// ─── beforeEach / afterEach para mocks ───────────────────────────────────────

beforeEach(() => {
  mockMessagesCreate.mockClear()
  // Respuesta por defecto para getAiInsights
  mockMessagesCreate.mockResolvedValue(defaultInsightsResponse())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Suite 1: GET /api/ai/retention-alerts ───────────────────────────────────
// Tests de lógica de DB pura — sin mock de Anthropic

describe('AI: GET /api/ai/retention-alerts', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
    })
    expect(res.statusCode).toBe(401)
  })

  it('token de MEMBER → 403 (requireAdmin)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${memberAtRiskToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('gym con datos → responde con estructura { atRisk, expiringSoon, inactive }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('atRisk')
    expect(body).toHaveProperty('expiringSoon')
    expect(body).toHaveProperty('inactive')
    expect(Array.isArray(body.atRisk)).toBe(true)
    expect(Array.isArray(body.expiringSoon)).toBe(true)
    expect(Array.isArray(body.inactive)).toBe(true)
  })

  it('miembro con membresía ACTIVE y sin bookings en 7 días → aparece en atRisk', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    const found = body.atRisk.find((m: any) => m.id === memberAtRiskId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Member At Risk')
    expect(found.alert).toBe('Sin reservas en los últimos 7 días')
    expect(found.lastBooking).toBeNull()
  })

  it('membresía ACTIVE que vence en 3 días → aparece en expiringSoon con daysLeft correcto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    const found = body.expiringSoon.find((m: any) => m.userId === memberExpiringId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Member Expiring')
    // daysLeft debe ser 3 (o 4 si el test corre justo a medianoche — toleramos rango)
    expect(found.daysLeft).toBeGreaterThanOrEqual(2)
    expect(found.daysLeft).toBeLessThanOrEqual(4)
    expect(found.endsAt).toBeDefined()
  })

  it('usuario sin membresía ACTIVE y con updatedAt reciente → aparece en inactive', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    const found = body.inactive.find((m: any) => m.id === memberInactiveId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Member Inactive')
    expect(found.email).toBe('qa-ai-member-inactive@test.local')
  })

  it('multi-tenancy: atRisk solo incluye miembros del gym del token (no los de gym B)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // memberB pertenece a Gym B y tiene membresía ACTIVE sin bookings
    // NO debe aparecer en los atRisk de adminA (que pertenece a Gym A)
    const gymBMemberInAtRisk = body.atRisk.find((m: any) => m.id === memberBId)
    const gymBMemberInExpiring = body.expiringSoon.find((m: any) => m.userId === memberBId)
    const gymBMemberInInactive = body.inactive.find((m: any) => m.id === memberBId)

    expect(gymBMemberInAtRisk).toBeUndefined()
    expect(gymBMemberInExpiring).toBeUndefined()
    expect(gymBMemberInInactive).toBeUndefined()
  })

  it('admin de gym B ve sus propios datos (solo gym B)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/retention-alerts',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // adminA y sus miembros NO deben aparecer en los resultados de adminB
    const gymAMemberInAtRisk = body.atRisk.find((m: any) => m.id === memberAtRiskId)
    expect(gymAMemberInAtRisk).toBeUndefined()

    // memberB de Gym B sí puede aparecer en atRisk (tiene membresía ACTIVE sin bookings)
    const gymBMemberInAtRisk = body.atRisk.find((m: any) => m.id === memberBId)
    expect(gymBMemberInAtRisk).toBeDefined()
  })
})

// ─── Suite 2: GET /api/ai/insights ───────────────────────────────────────────
// Tests con mock de Anthropic

describe('AI: GET /api/ai/insights', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
    })
    expect(res.statusCode).toBe(401)
  })

  it('token de MEMBER → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
      headers: { authorization: `Bearer ${memberAtRiskToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('éxito → llama anthropic.messages.create con prompt que contiene datos del gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)

    // Verificar que se llamó a Anthropic exactamente una vez
    expect(mockMessagesCreate).toHaveBeenCalledOnce()

    // El prompt debe contener información numérica del gym (miembros, reservas, etc.)
    const callArgs = mockMessagesCreate.mock.calls[0][0]
    expect(callArgs).toHaveProperty('model')
    expect(callArgs).toHaveProperty('messages')
    expect(callArgs.messages[0].role).toBe('user')
    const prompt = callArgs.messages[0].content as string
    expect(prompt).toContain('Total de miembros')
    expect(prompt).toContain('Reservas últimos 30 días')
  })

  it('response incluye insights (array) y summary (string)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.insights)).toBe(true)
    expect(body.insights.length).toBeGreaterThan(0)
    expect(body.insights[0]).toHaveProperty('title')
    expect(body.insights[0]).toHaveProperty('description')
    expect(body.insights[0]).toHaveProperty('priority')
    expect(typeof body.summary).toBe('string')
    expect(body.summary.length).toBeGreaterThan(0)
  })

  it('Anthropic devuelve JSON con backticks (```json...```) → los limpia y parsea correctamente', async () => {
    const jsonPayload = JSON.stringify({
      insights: [{ title: 'Backtick test', description: 'Desc', priority: 'low' }],
      summary: 'Resumen con backticks',
    })
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + jsonPayload + '\n```' }],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Debe parsear correctamente — no debe tener campo 'raw'
    expect(body).not.toHaveProperty('raw')
    expect(Array.isArray(body.insights)).toBe(true)
    expect(body.insights[0].title).toBe('Backtick test')
    expect(body.summary).toBe('Resumen con backticks')
  })

  it('Anthropic devuelve texto no-JSON → response incluye campo raw (fallback)', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Esto no es JSON válido para nada.' }],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('raw')
    expect(body.raw).toBe('Esto no es JSON válido para nada.')
    expect(body).not.toHaveProperty('insights')
  })

  it('Anthropic devuelve content[0].type !== "text" → 500', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/insights',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(500)
    const body = res.json()
    expect(body.error).toBe('Respuesta inesperada de IA')
  })
})

// ─── Suite 3: GET /api/ai/athlete-projection/:userId ─────────────────────────
// Tests con mock de Anthropic

describe('AI: GET /api/ai/athlete-projection/:userId', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()

    // Configurar mock por defecto para proyección
    mockMessagesCreate.mockResolvedValue(defaultProjectionResponse())

    // Crear RM para memberAtRisk para enriquecer el prompt
    const rm1 = await prisma.rmRecord.create({
      data: {
        userId: memberAtRiskId,
        movementName: 'Back Squat',
        weightKg: 80,
        recordedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      },
    })
    const rm2 = await prisma.rmRecord.create({
      data: {
        userId: memberAtRiskId,
        movementName: 'Back Squat',
        weightKg: 100,
        recordedAt: new Date(),
      },
    })
    createdRmIds.push(rm1.id, rm2.id)
  })

  afterAll(async () => { await app.close() })

  beforeEach(() => {
    // Resetear al mock de proyección antes de cada test
    mockMessagesCreate.mockClear()
    mockMessagesCreate.mockResolvedValue(defaultProjectionResponse())
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberAtRiskId}`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('userId de otro gym → 404 "Usuario no encontrado"', async () => {
    // adminA intenta pedir proyección de memberBId (gym B)
    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberBId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(body.error).toBe('Usuario no encontrado')
    // No debe haberse llamado a Anthropic
    expect(mockMessagesCreate).not.toHaveBeenCalled()
  })

  it('admin consulta proyección de un miembro de su gym → 200 con athlete + projections + coachTip', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberAtRiskId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('athlete')
    expect(body.athlete).toBe('Member At Risk')
    expect(body).toHaveProperty('projections')
    expect(Array.isArray(body.projections)).toBe(true)
    expect(body).toHaveProperty('coachTip')
    expect(typeof body.coachTip).toBe('string')
  })

  it('miembro consulta su propia proyección (:userId = user.userId) → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberAtRiskId}`,
      headers: { authorization: `Bearer ${memberAtRiskToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.athlete).toBe('Member At Risk')
  })

  it('miembro intenta ver proyección de otro userId → 403 (fix de seguridad)', async () => {
    // Antes el service ignoraba el :userId del path para roles no-ADMIN y siempre
    // usaba user.userId — ahora se deniega explícitamente si no coinciden.
    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/cualquier-cosa`,
      headers: { authorization: `Bearer ${memberAtRiskToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('atleta con RMs registrados → el prompt enviado a Anthropic contiene el nombre del movimiento y los kg', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberAtRiskId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(mockMessagesCreate).toHaveBeenCalledOnce()

    const callArgs = mockMessagesCreate.mock.calls[0][0]
    const prompt = callArgs.messages[0].content as string

    // El prompt debe incluir el nombre del movimiento y los valores de kg
    expect(prompt).toContain('Back Squat')
    expect(prompt).toContain('80')  // initial kg
    expect(prompt).toContain('100') // current kg
    // Y debe incluir el nombre del atleta
    expect(prompt).toContain('Member At Risk')
  })

  it('Anthropic devuelve texto no-JSON → response incluye { athlete, raw }', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'No puedo generar la proyección en este momento.' }],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberAtRiskId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('athlete')
    expect(body.athlete).toBe('Member At Risk')
    expect(body).toHaveProperty('raw')
    expect(body.raw).toBe('No puedo generar la proyección en este momento.')
    expect(body).not.toHaveProperty('projections')
  })

  it('JSON con backticks en proyección → limpia y parsea correctamente', async () => {
    const jsonPayload = JSON.stringify({
      projections: [{ movement: 'Snatch', currentKg: 70, projectedKg: 80, weeksToGoal: 6, confidence: 'high' }],
      nextMilestones: [],
      coachTip: 'Tip de prueba.',
    })
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + jsonPayload + '\n```' }],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/athlete-projection/${memberAtRiskId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).not.toHaveProperty('raw')
    expect(body.projections[0].movement).toBe('Snatch')
    expect(body.coachTip).toBe('Tip de prueba.')
  })
})
