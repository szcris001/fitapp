/**
 * wod.integration.test.ts
 *
 * Tests de integración para el módulo WOD (planificación de entrenamientos).
 *
 * Cubre los endpoints de wod.routes.ts contra una DB real:
 *   POST   /wods                        — crear WOD
 *   GET    /wods/class/:classId         — WOD del día para una clase
 *   GET    /wods/class/:classId/my-loads — cargas personalizadas del usuario
 *   GET    /wods                        — listar WODs con filtro de fechas
 *   PUT    /wods/:id                    — actualizar WOD (bloques, movimientos)
 *   DELETE /wods/:id                    — eliminar WOD
 *
 * NO cubre calculateLoad (ya cubierto en calculateLoad.test.ts).
 *
 * Estrategia de datos:
 *   - Gym A: admin, coach, member + classType + clase + WODs
 *   - Gym B: admin (para tests de aislamiento cross-gym)
 *   - Cleanup: borra en orden de FK al terminar
 *
 * Convención de slugs de gym: 'qa-wod-gym-a' y 'qa-wod-gym-b'
 * (únicos en esta suite para no colisionar con otras suites que corren en paralelo)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../lib/prisma'
import { wodRoutes } from '../wod.routes'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'
const GYM_A_SLUG = 'qa-wod-gym-a'
const GYM_B_SLUG = 'qa-wod-gym-b'

// ─── IDs de fixtures (se asignan en beforeAll) ───────────────────────────────

let gymAId: string
let gymBId: string
let adminAId: string
let coachAId: string
let memberAId: string
let adminBId: string
let classTypeAId: string
let classTypeBId: string
let coachAToken: string
let adminAToken: string
let memberAToken: string
let adminBToken: string

// Clase del día de hoy en Gym A (para tests de getWodByClass)
let classAId: string

// IDs de WODs creados en tests — para cleanup
const createdWodIds: string[] = []

// ─── Helper: construir app Fastify mínima ────────────────────────────────────

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

  await app.register(wodRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

// ─── Helper: fecha de hoy a medianoche UTC ────────────────────────────────────

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateString(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Bloques de ejemplo ───────────────────────────────────────────────────────

function sampleBlocks(suffix = '') {
  return [
    {
      title: `Calentamiento${suffix}`,
      timecap: '10min',
      movements: [
        {
          movementName: `Air Squat${suffix}`,
          repScheme: '3x10',
          weightRxM: null,
          weightRxF: null,
        },
      ],
    },
    {
      title: `WOD${suffix}`,
      timecap: 'AMRAP 20',
      movements: [
        {
          movementName: `Back Squat${suffix}`,
          repScheme: '5-5-5',
          weightRxM: 80,
          weightRxF: 55,
          weightScaleM: 60,
          weightScaleF: 40,
          weightRookieM: 40,
          weightRookieF: 30,
        },
        {
          movementName: `Pull Up${suffix}`,
          repScheme: '3x5',
          weightRxM: null,
          weightRxF: null,
        },
      ],
    },
  ]
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Limpiar residuos de runs anteriores
  for (const slug of [GYM_A_SLUG, GYM_B_SLUG]) {
    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) {
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      const userIds = users.map(u => u.id)
      // Orden FK: primero dependientes de User y Class, luego clases, classTypes, gym
      if (userIds.length) {
        await prisma.rmRecord.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
      }
      // Borrar WODs (cascade borra blocks y movements)
      await prisma.wod.deleteMany({ where: { gymId: existing.id } })
      // Borrar clases ANTES que usuarios (por Class_coachId_fkey)
      await prisma.class.deleteMany({ where: { gymId: existing.id } })
      // Ahora sí borrar usuarios
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { gymId: existing.id } })
      }
      await prisma.classType.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Crear Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Wod Gym A', slug: GYM_A_SLUG, status: 'ACTIVE', weightRounding: 2.5 },
  })
  gymAId = gymA.id

  // Crear Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Wod Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Usuarios en Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Wod A', email: 'qa-wod-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const coachA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Coach Wod A', email: 'qa-wod-coach-a@test.local', passwordHash, role: 'COACH' },
  })
  coachAId = coachA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Wod A', email: 'qa-wod-member-a@test.local', passwordHash, role: 'MEMBER', gender: 'M' },
  })
  memberAId = memberA.id

  // Admin en Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Wod B', email: 'qa-wod-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  // ClassType en Gym A
  const classTypeA = await prisma.classType.create({
    data: { gymId: gymAId, name: 'CrossFit QA', color: '#000000' },
  })
  classTypeAId = classTypeA.id

  // ClassType en Gym B
  const classTypeB = await prisma.classType.create({
    data: { gymId: gymBId, name: 'CrossFit QA B', color: '#111111' },
  })
  classTypeBId = classTypeB.id

  // Clase de hoy en Gym A (para tests de getWodByClass)
  const now = new Date()
  const startsAt = new Date(now)
  startsAt.setHours(9, 0, 0, 0)
  const endsAt = new Date(now)
  endsAt.setHours(10, 0, 0, 0)

  const classA = await prisma.class.create({
    data: {
      gymId: gymAId,
      classTypeId: classTypeAId,
      coachId: coachAId,
      startsAt,
      endsAt,
      capacity: 20,
    },
  })
  classAId = classA.id

  // Tokens JWT
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, email: 'qa-wod-admin-a@test.local', role: 'ADMIN', name: 'Admin Wod A' })
  coachAToken = tempApp.jwt.sign({ userId: coachAId, gymId: gymAId, email: 'qa-wod-coach-a@test.local', role: 'COACH', name: 'Coach Wod A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, email: 'qa-wod-member-a@test.local', role: 'MEMBER', name: 'Member Wod A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, email: 'qa-wod-admin-b@test.local', role: 'ADMIN', name: 'Admin Wod B' })

  await tempApp.close()
})

// ─── Teardown global ──────────────────────────────────────────────────────────

afterAll(async () => {
  const gymIds = [gymAId, gymBId].filter(Boolean)
  const userIds = [adminAId, coachAId, memberAId, adminBId].filter(Boolean)

  // Orden FK correcto:
  // 1. Dependientes de User (no de Class)
  await prisma.rmRecord.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
  // 2. WODs (cascade borra blocks y movements)
  await prisma.wod.deleteMany({ where: { gymId: { in: gymIds } } })
  // 3. Clases ANTES que usuarios (Class_coachId_fkey)
  await prisma.class.deleteMany({ where: { gymId: { in: gymIds } } })
  // 4. Usuarios
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  // 5. ClassTypes
  await prisma.classType.deleteMany({ where: { gymId: { in: gymIds } } })
  // 6. Gyms
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
  await prisma.$disconnect()
})

// =============================================================================
// Suite 1: POST /wods — Crear WOD
// =============================================================================

describe('WOD: POST /api/wods — crear WOD', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      payload: { classTypeId: classTypeAId, title: 'Test', date: todayDateString(), blocks: [] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta crear → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { classTypeId: classTypeAId, title: 'Test', date: todayDateString(), blocks: [] },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBeDefined()
  })

  it('classTypeId de otro gym → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { classTypeId: classTypeBId, title: 'Test', date: todayDateString(), blocks: [] },
    })
    // classTypeBId pertenece a gymB, adminA tiene gymAId → no encontrado
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/Tipo de clase no encontrado/i)
  })

  it('COACH crea WOD válido con bloques y movimientos → 201', async () => {
    const date = dateString(5) // 5 días en el futuro para no colisionar
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: {
        classTypeId: classTypeAId,
        title: 'WOD de prueba coach',
        date,
        blocks: sampleBlocks(),
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.gymId).toBe(gymAId)
    expect(body.classTypeId).toBe(classTypeAId)
    expect(body.title).toBe('WOD de prueba coach')
    // Estructura jerárquica: blocks y movements presentes
    expect(Array.isArray(body.blocks)).toBe(true)
    expect(body.blocks).toHaveLength(2)
    expect(body.blocks[0].title).toBe('Calentamiento')
    expect(body.blocks[0].timecap).toBe('10min')
    expect(body.blocks[0].movements).toHaveLength(1)
    expect(body.blocks[0].movements[0].movementName).toBe('Air Squat')
    expect(body.blocks[1].title).toBe('WOD')
    expect(body.blocks[1].movements).toHaveLength(2)
    expect(body.blocks[1].movements[0].movementName).toBe('Back Squat')
    expect(body.blocks[1].movements[0].weightRxM).toBe(80)
    expect(body.blocks[1].movements[0].weightRxF).toBe(55)

    createdWodIds.push(body.id)
  })

  it('ADMIN crea WOD válido → 201 con gymId del token', async () => {
    const date = dateString(6)
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: classTypeAId,
        title: 'WOD admin',
        date,
        blocks: [],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.gymId).toBe(gymAId) // gymId del JWT, no del body
    expect(body.blocks).toHaveLength(0)

    createdWodIds.push(body.id)
  })

  it('crear WOD sin bloques → 201 con blocks vacío', async () => {
    const date = dateString(7)
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { classTypeId: classTypeAId, title: 'Sin bloques', date, blocks: [] },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().blocks).toHaveLength(0)

    createdWodIds.push(res.json().id)
  })

  it('crear WOD duplicado (mismo classTypeId + fecha) → 400', async () => {
    // Primero crear uno
    const date = dateString(8)
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { classTypeId: classTypeAId, title: 'Primero', date, blocks: [] },
    })
    expect(res1.statusCode).toBe(201)
    createdWodIds.push(res1.json().id)

    // Intentar crear otro para el mismo día y classType
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { classTypeId: classTypeAId, title: 'Duplicado', date, blocks: [] },
    })
    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/Ya existe una planificación/i)
  })
})

// =============================================================================
// Suite 2: GET /wods/class/:classId — WOD del día para una clase
// =============================================================================

describe('WOD: GET /api/wods/class/:classId — WOD por clase', () => {
  let app: FastifyInstance
  let wodId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear un WOD para hoy (mismo día que classA)
    const wod = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD del día para clase',
        date: new Date(), // hoy
        blocks: {
          create: [
            {
              title: 'Bloque principal',
              timecap: '15min',
              order: 0,
              movements: {
                create: [
                  {
                    order: 0,
                    movementName: 'Deadlift',
                    repScheme: '5x3',
                    weightRxM: 120,
                    weightRxF: 80,
                  },
                ],
              },
            },
          ],
        },
      },
    })
    wodId = wod.id
    createdWodIds.push(wodId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classAId}`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('classId inexistente → 404', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000001'
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${fakeId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/Clase no encontrada/i)
  })

  it('classId de otro gym → 404 (aislamiento)', async () => {
    // adminB tiene gymId=gymBId, classAId pertenece a gymA
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classAId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('clase válida del día → devuelve array con el WOD', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classAId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    // Debe incluir el WOD que creamos para hoy
    const found = body.find((w: any) => w.id === wodId)
    expect(found).toBeDefined()
    expect(found.gymId).toBe(gymAId)
    expect(found.classTypeId).toBe(classTypeAId)
    expect(found.title).toBe('WOD del día para clase')
    expect(found.blocks).toHaveLength(1)
    expect(found.blocks[0].movements).toHaveLength(1)
    expect(found.blocks[0].movements[0].movementName).toBe('Deadlift')
  })

  it('clase sin WOD en ese día → devuelve array vacío', async () => {
    // Crear una clase en una fecha donde no hay WOD
    const futureStart = new Date()
    futureStart.setDate(futureStart.getDate() + 30)
    futureStart.setHours(11, 0, 0, 0)
    const futureEnd = new Date(futureStart.getTime() + 3600_000)

    const futureClass = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        coachId: coachAId,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 10,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${futureClass.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)

    // Cleanup
    await prisma.class.delete({ where: { id: futureClass.id } })
  })
})

// =============================================================================
// Suite 3: GET /wods/class/:classId/my-loads — Cargas personalizadas
// =============================================================================

describe('WOD: GET /api/wods/class/:classId/my-loads — cargas del usuario', () => {
  let app: FastifyInstance
  let wodWithLoadsId: string
  let rmRecordId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear WOD para hoy (puede coexistir con el de Suite 2 — same gymId+classTypeId+date
    // pero el código usa findFirst, así que puede haber conflicto. Usamos uno nuevo distinto.
    // Para evitar conflicto de duplicado con suite 2, borramos el que creamos ahí y creamos uno nuevo.)
    // En realidad la suite 2 ya creó el WOD para hoy. my-loads usa findFirst, devuelve ese.
    // Solo necesitamos un RM record para el movimiento.
    // Verificar si ya existe un wod para hoy con este classType
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86_400_000)

    const existingWod = await prisma.wod.findFirst({
      where: { gymId: gymAId, classTypeId: classTypeAId, date: { gte: today, lt: tomorrow } },
      include: { blocks: { include: { movements: true } } },
    })

    if (existingWod) {
      wodWithLoadsId = existingWod.id
    } else {
      // Crear WOD para hoy si no existe
      const wod = await prisma.wod.create({
        data: {
          gymId: gymAId,
          classTypeId: classTypeAId,
          title: 'WOD cargas',
          date: new Date(),
          blocks: {
            create: [
              {
                title: 'WOD',
                order: 0,
                movements: {
                  create: [
                    { order: 0, movementName: 'Deadlift', repScheme: '5x3', weightRxM: 120, weightRxF: 80 },
                  ],
                },
              },
            ],
          },
        },
      })
      wodWithLoadsId = wod.id
      createdWodIds.push(wod.id)
    }

    // Crear RM record para el member con Deadlift
    const rm = await prisma.rmRecord.create({
      data: {
        userId: memberAId,
        movementName: 'Deadlift',
        weightKg: 100,
        recordedAt: new Date(),
      },
    })
    rmRecordId = rm.id
  })

  afterAll(async () => {
    if (rmRecordId) await prisma.rmRecord.delete({ where: { id: rmRecordId } }).catch(() => {})
    await app.close()
  })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classAId}/my-loads`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('classId de otro gym → devuelve array vacío (protección)', async () => {
    // adminB intenta ver loads de una clase de gymA → cls not found → []
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classAId}/my-loads`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
  })

  it('clase válida con WOD y RM → devuelve movimientos con rmKg', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classAId}/my-loads`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    // Debe incluir el movimiento Deadlift con el RM
    const deadlift = body.find((m: any) => m.movementName === 'Deadlift')
    expect(deadlift).toBeDefined()
    expect(deadlift.rmKg).toBe(100)
  })

  it('clase sin WOD → devuelve array vacío', async () => {
    // Crear clase en fecha sin WOD
    const futureStart = new Date()
    futureStart.setDate(futureStart.getDate() + 45)
    futureStart.setHours(9, 0, 0, 0)
    const futureEnd = new Date(futureStart.getTime() + 3600_000)

    const futureClass = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        coachId: coachAId,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 10,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${futureClass.id}/my-loads`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)

    await prisma.class.delete({ where: { id: futureClass.id } })
  })
})

// =============================================================================
// Suite 4: GET /wods — Listar WODs con filtro de fechas
// =============================================================================

describe('WOD: GET /api/wods — listar WODs', () => {
  let app: FastifyInstance
  let wodPastId: string
  let wodFutureId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear WOD en fecha pasada
    const past = new Date()
    past.setDate(past.getDate() - 10)
    past.setHours(0, 0, 0, 0)

    const wodPast = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD pasado',
        date: past,
        blocks: { create: [] },
      },
    })
    wodPastId = wodPast.id
    createdWodIds.push(wodPastId)

    // Crear WOD en fecha futura
    const future = new Date()
    future.setDate(future.getDate() + 20)
    future.setHours(0, 0, 0, 0)

    const wodFuture = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD futuro',
        date: future,
        blocks: { create: [] },
      },
    })
    wodFutureId = wodFuture.id
    createdWodIds.push(wodFutureId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wods' })
    expect(res.statusCode).toBe(401)
  })

  it('sin filtros → devuelve todos los WODs del gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    const ids = body.map((w: any) => w.id)
    expect(ids).toContain(wodPastId)
    expect(ids).toContain(wodFutureId)
  })

  it('filtro from → excluye WODs anteriores a la fecha', async () => {
    const from = dateString(0) // hoy
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods?from=${from}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const ids = body.map((w: any) => w.id)
    // El WOD pasado (-10 días) NO debe aparecer
    expect(ids).not.toContain(wodPastId)
    // El WOD futuro (+20 días) sí debe aparecer
    expect(ids).toContain(wodFutureId)
  })

  it('filtro to → excluye WODs posteriores a la fecha', async () => {
    const to = dateString(0) // hoy
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods?to=${to}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const ids = body.map((w: any) => w.id)
    // El WOD pasado (-10 días) sí debe aparecer
    expect(ids).toContain(wodPastId)
    // El WOD futuro (+20 días) NO debe aparecer
    expect(ids).not.toContain(wodFutureId)
  })

  it('admin de Gym B no ve WODs de Gym A (aislamiento)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const ids = body.map((w: any) => w.id)
    expect(ids).not.toContain(wodPastId)
    expect(ids).not.toContain(wodFutureId)
  })

  it('WODs listados incluyen el classType (id, name, color)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/wods?from=${dateString(15)}&to=${dateString(25)}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const wod = body.find((w: any) => w.id === wodFutureId)
    expect(wod).toBeDefined()
    expect(wod.classType).toBeDefined()
    expect(wod.classType.id).toBe(classTypeAId)
    expect(wod.classType.name).toBe('CrossFit QA')
  })

  it('WODs listados ordenados por fecha ascendente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    for (let i = 1; i < body.length; i++) {
      expect(new Date(body[i].date).getTime()).toBeGreaterThanOrEqual(new Date(body[i - 1].date).getTime())
    }
  })
})

// =============================================================================
// Suite 5: PUT /wods/:id — Actualizar WOD
// =============================================================================

describe('WOD: PUT /api/wods/:id — actualizar WOD', () => {
  let app: FastifyInstance
  let wodToUpdateId: string

  beforeAll(async () => {
    app = await buildApp()

    const date = new Date()
    date.setDate(date.getDate() + 50)

    const wod = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD original',
        date,
        blocks: {
          create: [
            {
              title: 'Bloque original',
              order: 0,
              movements: {
                create: [{ order: 0, movementName: 'Squat', repScheme: '3x10' }],
              },
            },
          ],
        },
      },
    })
    wodToUpdateId = wod.id
    createdWodIds.push(wodToUpdateId)
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodToUpdateId}`,
      payload: { title: 'Nuevo', date: dateString(50), blocks: [] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta actualizar → 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodToUpdateId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { title: 'Hack', date: dateString(50), blocks: [] },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBeDefined()
  })

  it('WOD inexistente → 404', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000002'
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${fakeId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { title: 'No existe', date: dateString(50), blocks: [] },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/WOD no encontrado/i)
  })

  it('admin de Gym B no puede actualizar WOD de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodToUpdateId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { title: 'Cross', date: dateString(50), blocks: [] },
    })
    expect(res.statusCode).toBe(404)
  })

  it('COACH actualiza WOD → 200, título y bloques actualizados', async () => {
    const newDate = dateString(51)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodToUpdateId}`,
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: {
        title: 'WOD actualizado',
        date: newDate,
        blocks: sampleBlocks(' v2'),
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(wodToUpdateId)
    expect(body.title).toBe('WOD actualizado')
    expect(body.gymId).toBe(gymAId)
    // Bloques reemplazados
    expect(body.blocks).toHaveLength(2)
    expect(body.blocks[0].title).toBe('Calentamiento v2')
    expect(body.blocks[1].title).toBe('WOD v2')
    expect(body.blocks[1].movements).toHaveLength(2)
    expect(body.blocks[1].movements[0].movementName).toBe('Back Squat v2')
  })

  it('actualizar con bloques vacíos → los bloques previos desaparecen', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodToUpdateId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { title: 'Sin bloques', date: dateString(51), blocks: [] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().blocks).toHaveLength(0)
  })

  it('los bloques previos no persisten tras actualización (replace, no merge)', async () => {
    // Tras actualizar a "Sin bloques", verificar en DB que no quedan bloques huérfanos
    const blocks = await prisma.wodBlock.findMany({ where: { wodId: wodToUpdateId } })
    expect(blocks).toHaveLength(0)
  })
})

// =============================================================================
// Suite 6: DELETE /wods/:id — Eliminar WOD
// =============================================================================

describe('WOD: DELETE /api/wods/:id — eliminar WOD', () => {
  let app: FastifyInstance
  let wodToDeleteId: string

  beforeAll(async () => {
    app = await buildApp()

    const date = new Date()
    date.setDate(date.getDate() + 60)

    const wod = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD a eliminar',
        date,
        blocks: {
          create: [
            {
              title: 'Bloque',
              order: 0,
              movements: {
                create: [{ order: 0, movementName: 'Box Jump', repScheme: '3x10' }],
              },
            },
          ],
        },
      },
    })
    wodToDeleteId = wod.id
    // No lo añadimos a createdWodIds porque lo vamos a borrar en el test
  })

  afterAll(async () => { await app.close() })

  it('sin token → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wodToDeleteId}`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER intenta eliminar → 403', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wodToDeleteId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBeDefined()
  })

  it('WOD inexistente → 404', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000003'
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${fakeId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/WOD no encontrado/i)
  })

  it('admin de Gym B no puede eliminar WOD de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wodToDeleteId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('COACH elimina WOD → 200 con ok:true', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wodToDeleteId}`,
      headers: { authorization: `Bearer ${coachAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('WOD eliminado ya no existe en DB', async () => {
    const wod = await prisma.wod.findUnique({ where: { id: wodToDeleteId } })
    expect(wod).toBeNull()
  })

  it('eliminar WOD elimina sus bloques y movimientos (cascade)', async () => {
    // Crear WOD con bloque para verificar cascade
    const date = new Date()
    date.setDate(date.getDate() + 65)

    const wod = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD cascade',
        date,
        blocks: {
          create: [
            {
              title: 'Bloque cascade',
              order: 0,
              movements: {
                create: [{ order: 0, movementName: 'Burpee', repScheme: '10x10' }],
              },
            },
          ],
        },
      },
      include: { blocks: { include: { movements: true } } },
    })

    const blockId = wod.blocks[0].id
    const movementId = wod.blocks[0].movements[0].id

    // Eliminar vía endpoint
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wod.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)

    // Verificar que el bloque y movimiento también fueron eliminados
    const block = await prisma.wodBlock.findUnique({ where: { id: blockId } })
    const movement = await prisma.wodMovement.findUnique({ where: { id: movementId } })
    expect(block).toBeNull()
    expect(movement).toBeNull()
  })
})

// =============================================================================
// Suite 7: Aislamiento cross-gym completo
// =============================================================================

describe('WOD: Aislamiento cross-gym', () => {
  let app: FastifyInstance
  let wodGymAId: string
  let wodGymBId: string

  beforeAll(async () => {
    app = await buildApp()

    // Crear WOD en Gym A
    const dateA = new Date()
    dateA.setDate(dateA.getDate() + 70)
    const wodA = await prisma.wod.create({
      data: {
        gymId: gymAId,
        classTypeId: classTypeAId,
        title: 'WOD Gym A secreto',
        date: dateA,
        blocks: { create: [] },
      },
    })
    wodGymAId = wodA.id
    createdWodIds.push(wodGymAId)

    // Crear WOD en Gym B
    const dateB = new Date()
    dateB.setDate(dateB.getDate() + 70)
    const wodB = await prisma.wod.create({
      data: {
        gymId: gymBId,
        classTypeId: classTypeBId,
        title: 'WOD Gym B secreto',
        date: dateB,
        blocks: { create: [] },
      },
    })
    wodGymBId = wodB.id
    createdWodIds.push(wodGymBId)
  })

  afterAll(async () => { await app.close() })

  it('Admin A lista WODs → no ve WODs de Gym B', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    const ids = res.json().map((w: any) => w.id)
    expect(ids).toContain(wodGymAId)
    expect(ids).not.toContain(wodGymBId)
  })

  it('Admin B lista WODs → no ve WODs de Gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    const ids = res.json().map((w: any) => w.id)
    expect(ids).toContain(wodGymBId)
    expect(ids).not.toContain(wodGymAId)
  })

  it('Admin B no puede actualizar WOD de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodGymAId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { title: 'Hack cross', date: dateString(70), blocks: [] },
    })
    expect(res.statusCode).toBe(404)
  })

  it('Admin B no puede eliminar WOD de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wodGymAId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('Admin B no puede crear WOD con classType de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {
        classTypeId: classTypeAId, // classType de gymA
        title: 'Intento cross',
        date: dateString(70),
        blocks: [],
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/Tipo de clase no encontrado/i)
  })
})

// =============================================================================
// Suite 8: Estructura jerárquica WodBlocks + WodMovements
// =============================================================================

describe('WOD: Estructura jerárquica blocks y movements', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('WOD creado con múltiples bloques mantiene orden correcto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: classTypeAId,
        title: 'WOD orden bloques',
        date: dateString(80),
        blocks: [
          { title: 'Bloque 0', timecap: '5min', movements: [{ movementName: 'M0', repScheme: '1x1' }] },
          { title: 'Bloque 1', timecap: '10min', movements: [{ movementName: 'M1', repScheme: '2x2' }, { movementName: 'M2', repScheme: '3x3' }] },
          { title: 'Bloque 2', timecap: null, movements: [] },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    createdWodIds.push(body.id)

    expect(body.blocks).toHaveLength(3)
    expect(body.blocks[0].order).toBe(0)
    expect(body.blocks[0].title).toBe('Bloque 0')
    expect(body.blocks[0].movements).toHaveLength(1)
    expect(body.blocks[0].movements[0].order).toBe(0)
    expect(body.blocks[0].movements[0].movementName).toBe('M0')

    expect(body.blocks[1].order).toBe(1)
    expect(body.blocks[1].movements).toHaveLength(2)
    expect(body.blocks[1].movements[0].order).toBe(0)
    expect(body.blocks[1].movements[0].movementName).toBe('M1')
    expect(body.blocks[1].movements[1].order).toBe(1)
    expect(body.blocks[1].movements[1].movementName).toBe('M2')

    expect(body.blocks[2].order).toBe(2)
    expect(body.blocks[2].movements).toHaveLength(0)
  })

  it('WOD con campos weight completos los persiste correctamente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: classTypeAId,
        title: 'WOD pesos completos',
        date: dateString(81),
        blocks: [
          {
            title: 'Main',
            movements: [
              {
                movementName: 'Clean',
                repScheme: '5x1',
                weightRxM: 100,
                weightRxF: 70,
                weightScaleM: 75,
                weightScaleF: 50,
                weightRookieM: 50,
                weightRookieF: 35,
                notes: 'Full squat',
                scaledMovement: 'Power Clean',
              },
            ],
          },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    createdWodIds.push(body.id)

    const m = body.blocks[0].movements[0]
    expect(m.movementName).toBe('Clean')
    expect(m.weightRxM).toBe(100)
    expect(m.weightRxF).toBe(70)
    expect(m.weightScaleM).toBe(75)
    expect(m.weightScaleF).toBe(50)
    expect(m.weightRookieM).toBe(50)
    expect(m.weightRookieF).toBe(35)
    expect(m.notes).toBe('Full squat')
    expect(m.scaledMovement).toBe('Power Clean')
  })

  it('WOD con timecap nulo en bloque → lo persiste como null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wods',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: classTypeAId,
        title: 'WOD timecap null',
        date: dateString(82),
        blocks: [
          { title: 'Sin timecap', timecap: null, movements: [{ movementName: 'Row', repScheme: '500m' }] },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    createdWodIds.push(body.id)
    expect(body.blocks[0].timecap).toBeNull()
  })
})

// ─── Suite: Resultados — el userId sale del JWT (claim `userId`, no `id`) ────

describe('WOD: resultados usan el userId del JWT', () => {
  let app: FastifyInstance
  let wodId: string

  beforeAll(async () => {
    app = await buildApp()
    const wod = await prisma.wod.create({
      data: { gymId: gymAId, classTypeId: classTypeAId, title: 'WOD resultados', date: new Date() },
    })
    wodId = wod.id
    createdWodIds.push(wodId)
  })

  afterAll(async () => {
    await prisma.wodResult.deleteMany({ where: { wodId } })
    await app.close()
  })

  it('POST /wods/:id/results/me → 201 y guarda el resultado del miembro', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/wods/${wodId}/results/me`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { score: 120, rx: true },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.userId).toBe(memberAId)
    expect(body.recordedBy).toBe(memberAId)
  })

  it('GET /wods/:id/results/me → devuelve el resultado propio', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/wods/${wodId}/results/me`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().userId).toBe(memberAId)
  })

  it('POST /wods/:id/results (coach) → recordedBy es el coach', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/wods/${wodId}/results`,
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: { userId: memberAId, score: 150, rx: false },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().recordedBy).toBe(coachAId)
  })
})

// ─── Suite: el WOD se empareja con la clase por día local del gym ─────────────

describe('WOD: emparejamiento por día local del gym (America/Santiago)', () => {
  let app: FastifyInstance
  let lateClassId: string

  beforeAll(async () => {
    app = await buildApp()
    // Clase a las 22:00 del 2026-11-10 en Santiago (UTC-3) = 01:00 UTC del 11-nov
    const cls = await prisma.class.create({
      data: {
        gymId: gymAId, classTypeId: classTypeAId, coachId: coachAId,
        startsAt: new Date('2026-11-11T01:00:00Z'), endsAt: new Date('2026-11-11T02:00:00Z'),
        capacity: 10, frequency: 'ONCE',
      },
    })
    lateClassId = cls.id
  })

  afterAll(async () => {
    await prisma.class.deleteMany({ where: { id: lateClassId } })
    await app.close()
  })

  it('WOD creado con fecha solo-día (mobile) aparece en la clase de las 22:00 de ese día', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/wods',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: { classTypeId: classTypeAId, title: 'WOD nocturno', date: '2026-11-10', blocks: [] },
    })
    expect(create.statusCode).toBe(201)
    createdWodIds.push(create.json().id)
    // Se guarda como el inicio del día local: 00:00 en Santiago = 03:00 UTC
    expect(new Date(create.json().date).toISOString()).toBe('2026-11-10T03:00:00.000Z')

    const res = await app.inject({
      method: 'GET', url: `/api/wods/class/${lateClassId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().map((w: any) => w.title)).toContain('WOD nocturno')
  })

  it('el mismo día enviado como timestamp (web) cuenta como duplicado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/wods',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: { classTypeId: classTypeAId, title: 'Duplicado', date: '2026-11-11T01:00:00.000Z', blocks: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Ya existe una planificación/)
  })

  it('GET /wods?from=&to= usa días locales', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/wods?from=2026-11-10&to=2026-11-10',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.json().map((w: any) => w.title)).toContain('WOD nocturno')
  })
})

// ─── Suite: my-loads — % del RM y peso prescrito por género ───────────────────

describe('WOD: GET /api/wods/class/:classId/my-loads — calculado y recomendado', () => {
  let app: FastifyInstance
  let loadsClassId: string
  const rmIds: string[] = []

  beforeAll(async () => {
    app = await buildApp()
    const cls = await prisma.class.create({
      data: {
        gymId: gymAId, classTypeId: classTypeAId, coachId: coachAId,
        startsAt: new Date('2026-12-01T13:00:00Z'), endsAt: new Date('2026-12-01T14:00:00Z'),
        capacity: 10, frequency: 'ONCE',
      },
    })
    loadsClassId = cls.id
    const wod = await prisma.wod.create({
      data: {
        gymId: gymAId, classTypeId: classTypeAId, title: 'WOD cargas por género',
        date: new Date('2026-12-01T03:00:00Z'), // inicio del 01-dic en Santiago
        blocks: { create: [{ title: 'Fuerza', order: 0, movements: { create: [
          { movementName: 'Squat', percentage: 50, order: 0 },
          { movementName: 'Thruster', weightRxM: 43, weightRxF: 29, order: 1 },
        ] } }] },
      },
    })
    createdWodIds.push(wod.id)
    // "Front Squat" contiene "squat" pero no es el mismo movimiento: debe ganar "Squat"
    for (const [movementName, weightKg] of [['Front Squat', 60], ['Squat', 100]] as const) {
      rmIds.push((await prisma.rmRecord.create({ data: { userId: memberAId, movementName, weightKg } })).id)
    }
    await prisma.user.update({ where: { id: memberAId }, data: { gender: 'F' } })
  })

  afterAll(async () => {
    await prisma.user.update({ where: { id: memberAId }, data: { gender: null } })
    await prisma.rmRecord.deleteMany({ where: { id: { in: rmIds } } })
    await prisma.class.deleteMany({ where: { id: loadsClassId } })
    await app.close()
  })

  it('usa el RM de nombre exacto y, sin %, el peso prescrito para su género', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/wods/class/${loadsClassId}/my-loads`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const byName = Object.fromEntries(res.json().map((m: any) => [m.movementName, m]))
    expect(byName.Squat).toMatchObject({ rmKg: 100, calculatedKg: 50, recommendedKg: 50 })
    expect(byName.Thruster).toMatchObject({ calculatedKg: null, recommendedKg: 30 }) // 29 redondeado a 2.5
  })
})
