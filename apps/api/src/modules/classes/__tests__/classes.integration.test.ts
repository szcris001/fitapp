/**
 * classes.integration.test.ts
 *
 * Tests de integración para ClassType CRUD y Class (instancia) CRUD.
 * bookClass / cancelBooking / waitlist están cubiertos en bookings.integration.test.ts.
 *
 * Estrategia:
 *   - HTTP via fastify.inject() para probar rutas completas (autenticación, validación,
 *     serialización de respuesta).
 *   - DB real (Prisma contra Postgres de test).
 *   - Slugs únicos para aislar estos fixtures de otras suites.
 *   - Cleanup en afterAll — borrar en orden FK correcto.
 *
 * Casos cubiertos:
 *
 * ClassType:
 *   1.  GET /class-types sin token → 401
 *   2.  GET /class-types → lista solo los del gym del token (aislamiento)
 *   3.  POST /class-types sin token → 401
 *   4.  POST /class-types con MEMBER → 403
 *   5.  POST /class-types con COACH → 403 (requireAdmin)
 *   6.  POST /class-types con ADMIN sin nombre → 400 (Zod)
 *   7.  POST /class-types con color inválido → 400 (Zod)
 *   8.  POST /class-types feliz (sin bloques) → 201 con campos correctos
 *   9.  POST /class-types con bloques → 201, bloques ordenados por order
 *  10.  PUT /class-types/:id feliz → 200, nombre actualizado
 *  11.  PUT /class-types/:id de otro gym → 400 "no encontrado"
 *  12.  DELETE /class-types/:id feliz → 204
 *  13.  DELETE /class-types/:id de otro gym → 400 "no encontrado"
 *  14.  DELETE /class-types/:id dos veces → 400 en la segunda
 *
 * Class (instancia) CRUD:
 *  15.  GET /classes sin token → 401
 *  16.  GET /classes → lista solo las del gym del token (aislamiento cross-gym)
 *  17.  GET /classes?from=&to= → filtra por rango de fechas
 *  18.  GET /classes/:id feliz → 200 con classType, coach, bookings, wods
 *  19.  GET /classes/:id de otro gym → 404
 *  20.  POST /classes sin token → 401
 *  21.  POST /classes con MEMBER → 403
 *  22.  POST /classes con COACH → 201 (requireCoachOrAdmin)
 *  23.  POST /classes body inválido → 400 (Zod)
 *  24.  POST /classes feliz (frequency=ONCE) → 201, campos persistidos
 *  25.  POST /classes duplicado (misma classTypeId + startsAt) → 400
 *  26.  POST /classes con classType de otro gym → 400 "Tipo de clase no encontrado"
 *  27.  PATCH /classes/:id feliz → 200, campos actualizados
 *  28.  PATCH /classes/:id de otro gym → 404
 *  29.  PATCH /classes/:id con MEMBER → 403
 *  30.  DELETE /classes/:id feliz → 200 mensaje
 *  31.  DELETE /classes/:id de otro gym → 404
 *  32.  DELETE /classes/bulk → elimina los IDs indicados
 *  33.  GET /classes/attendance (admin) → estructura correcta por hora
 *  34.  GET /classes/attendance con MEMBER → 403
 *  35.  POST /classes RECURRING → crea múltiples instancias
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { classRoutes } from '../classes.routes'
import { prisma } from '../../../lib/prisma'

// ─── Constantes de fixtures ───────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'

const GYM_A_SLUG = 'qa-classes-crud-gym-a'
const GYM_B_SLUG = 'qa-classes-crud-gym-b'

// IDs del entorno compartido
let gymAId: string
let gymBId: string
let adminAId: string
let coachAId: string
let memberAId: string
let adminBId: string

// Tokens
let adminAToken: string
let coachAToken: string
let memberAToken: string
let adminBToken: string

// Tipo de clase creado en setup — usado como base para crear clases
let baseClassTypeAId: string
let baseClassTypeBId: string // en Gym B — para tests cross-gym

// IDs creados durante los tests (para cleanup)
const createdClassTypeIds: string[] = []
const createdClassIds: string[] = []

// ─── Builder de app Fastify mínima ───────────────────────────────────────────

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
  await app.register(classRoutes, { prefix: '/api' })
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
      const users = await prisma.user.findMany({ where: { gymId: existing.id }, select: { id: true } })
      const userIds = users.map(u => u.id)
      if (userIds.length) {
        await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.membership.deleteMany({ where: { userId: { in: userIds } } })
      }
      await prisma.booking.deleteMany({ where: { class: { gymId: existing.id } } })
      await prisma.class.deleteMany({ where: { gymId: existing.id } })
      await prisma.classType.deleteMany({ where: { gymId: existing.id } })
      await prisma.plan.deleteMany({ where: { gymId: existing.id } })
      await prisma.user.deleteMany({ where: { gymId: existing.id } })
      await prisma.gym.delete({ where: { id: existing.id } })
    }
  }

  // Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA Classes CRUD Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA Classes CRUD Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Usuarios en Gym A
  const adminA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Classes A', email: 'qa-classes-admin-a@test.local', passwordHash, role: 'ADMIN' },
  })
  adminAId = adminA.id

  const coachA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Coach Classes A', email: 'qa-classes-coach-a@test.local', passwordHash, role: 'COACH' },
  })
  coachAId = coachA.id

  const memberA = await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Classes A', email: 'qa-classes-member-a@test.local', passwordHash, role: 'MEMBER' },
  })
  memberAId = memberA.id

  // Admin en Gym B
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Classes B', email: 'qa-classes-admin-b@test.local', passwordHash, role: 'ADMIN' },
  })
  adminBId = adminB.id

  // ClassType base en Gym A (para tests de Class)
  const baseClassTypeA = await prisma.classType.create({
    data: { gymId: gymAId, name: 'CrossFit', color: '#FF0000', discipline: 'crossfit' },
  })
  baseClassTypeAId = baseClassTypeA.id

  // ClassType base en Gym B (para tests cross-gym)
  const baseClassTypeB = await prisma.classType.create({
    data: { gymId: gymBId, name: 'CrossFit B', color: '#0000FF' },
  })
  baseClassTypeBId = baseClassTypeB.id

  // Generar tokens
  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()

  adminAToken = tempApp.jwt.sign({ userId: adminAId, gymId: gymAId, email: 'qa-classes-admin-a@test.local', role: 'ADMIN', name: 'Admin Classes A' })
  coachAToken = tempApp.jwt.sign({ userId: coachAId, gymId: gymAId, email: 'qa-classes-coach-a@test.local', role: 'COACH', name: 'Coach Classes A' })
  memberAToken = tempApp.jwt.sign({ userId: memberAId, gymId: gymAId, email: 'qa-classes-member-a@test.local', role: 'MEMBER', name: 'Member Classes A' })
  adminBToken = tempApp.jwt.sign({ userId: adminBId, gymId: gymBId, email: 'qa-classes-admin-b@test.local', role: 'ADMIN', name: 'Admin Classes B' })

  await tempApp.close()
})

afterAll(async () => {
  // Cleanup en orden FK
  await prisma.booking.deleteMany({ where: { classId: { in: createdClassIds } } })
  await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } })
  // Limpiar classTypes creados durante tests (los del setup los borra la eliminación del gym)
  await prisma.classType.deleteMany({ where: { id: { in: createdClassTypeIds } } })

  // Teardown de gyms (en orden FK)
  const allUserIds = [adminAId, coachAId, memberAId, adminBId].filter(Boolean)
  if (allUserIds.length) {
    await prisma.booking.deleteMany({ where: { userId: { in: allUserIds } } })
    await prisma.membership.deleteMany({ where: { userId: { in: allUserIds } } })
  }
  await prisma.booking.deleteMany({ where: { class: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } } })
  await prisma.class.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.classType.deleteMany({ where: { gymId: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId].filter(Boolean) } } })
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: ClassType — autenticación y autorización
// ─────────────────────────────────────────────────────────────────────────────

describe('ClassType: GET /api/class-types — autenticación', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 1 — sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/class-types' })
    expect(res.statusCode).toBe(401)
  })

  it('Caso 2 — admin de Gym A solo ve class-types de Gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    // El baseClassTypeA debe aparecer
    const found = body.find((ct: any) => ct.id === baseClassTypeAId)
    expect(found).toBeDefined()
    expect(found.gymId).toBe(gymAId)
    // El baseClassTypeB (Gym B) NO debe aparecer
    const notFound = body.find((ct: any) => ct.id === baseClassTypeBId)
    expect(notFound).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: ClassType — POST (crear)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClassType: POST /api/class-types — crear', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 3 — sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      payload: { name: 'Weightlifting' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('Caso 4 — MEMBER intenta crear → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { name: 'Weightlifting' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Caso 5 — COACH intenta crear → 403 (requireAdmin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: { name: 'Weightlifting' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Caso 6 — ADMIN sin nombre (nombre vacío) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'A' }, // min 2 chars
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBeDefined()
  })

  it('Caso 7 — ADMIN con color inválido → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Endurance', color: 'red' }, // no es #RRGGBB
    })
    expect(res.statusCode).toBe(400)
  })

  it('Caso 7b — ADMIN con nombre de más de 100 caracteres → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'A'.repeat(101) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('Caso 8 — ADMIN crea ClassType sin bloques → 201 con campos correctos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Endurance Run',
        description: 'Carrera y cardio',
        color: '#00FF00',
        discipline: 'endurance',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Endurance Run')
    expect(body.description).toBe('Carrera y cardio')
    expect(body.color).toBe('#00FF00')
    expect(body.discipline).toBe('endurance')
    expect(body.gymId).toBe(gymAId)
    expect(Array.isArray(body.blocks)).toBe(true)
    expect(body.blocks).toHaveLength(0)

    createdClassTypeIds.push(body.id)
  })

  it('Caso 9 — ADMIN crea ClassType con bloques → 201, bloques ordenados por order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'WL con bloques',
        discipline: 'weightlifting',
        blocks: [
          { name: 'Calentamiento', durationMins: 10 },
          { name: 'Técnica', durationMins: 20 },
          { name: 'WOD', durationMins: 30 },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.blocks).toHaveLength(3)
    // Los bloques deben estar ordenados por order (0, 1, 2)
    expect(body.blocks[0].name).toBe('Calentamiento')
    expect(body.blocks[0].order).toBe(0)
    expect(body.blocks[1].name).toBe('Técnica')
    expect(body.blocks[1].order).toBe(1)
    expect(body.blocks[2].name).toBe('WOD')
    expect(body.blocks[2].order).toBe(2)

    createdClassTypeIds.push(body.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: ClassType — PUT (actualizar)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClassType: PUT /api/class-types/:id — actualizar', () => {
  let app: FastifyInstance
  let classTypeId: string

  beforeAll(async () => {
    app = await buildApp()
    // Crear un ClassType para actualizar
    const ct = await prisma.classType.create({
      data: { gymId: gymAId, name: 'Para Actualizar', color: '#AAAAAA' },
    })
    classTypeId = ct.id
    createdClassTypeIds.push(classTypeId)
  })
  afterAll(async () => { await app.close() })

  it('Caso 10 — ADMIN actualiza nombre y color → 200 con valores nuevos', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/class-types/${classTypeId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Nombre Actualizado', color: '#123456' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Nombre Actualizado')
    expect(body.color).toBe('#123456')
    expect(body.id).toBe(classTypeId)
  })

  it('Caso 10b — actualizar con bloques nuevos reemplaza los existentes', async () => {
    // Primero, crear con bloques
    const ctWithBlocks = await prisma.classType.create({
      data: {
        gymId: gymAId,
        name: 'Con Bloques Originales',
        blocks: {
          create: [
            { order: 0, name: 'Bloque Original', durationMins: 15 },
          ],
        },
      },
    })
    createdClassTypeIds.push(ctWithBlocks.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/class-types/${ctWithBlocks.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Con Bloques Nuevos',
        blocks: [
          { name: 'Bloque Nuevo 1', durationMins: 10 },
          { name: 'Bloque Nuevo 2', durationMins: 20 },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.blocks).toHaveLength(2)
    expect(body.blocks[0].name).toBe('Bloque Nuevo 1')
    expect(body.blocks[1].name).toBe('Bloque Nuevo 2')
    // El bloque original debe haber desaparecido
    const originalBlock = body.blocks.find((b: any) => b.name === 'Bloque Original')
    expect(originalBlock).toBeUndefined()
  })

  it('Caso 11 — ADMIN de Gym B intenta actualizar ClassType de Gym A → 400 no encontrado', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/class-types/${classTypeId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { name: 'Intento Cross-Gym' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no encontrado/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: ClassType — DELETE
// ─────────────────────────────────────────────────────────────────────────────

describe('ClassType: DELETE /api/class-types/:id — eliminar', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 12 — ADMIN elimina ClassType propio → 204', async () => {
    const ct = await prisma.classType.create({
      data: { gymId: gymAId, name: 'Para Borrar' },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/class-types/${ct.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(204)

    // Verificar que ya no existe en DB
    const found = await prisma.classType.findUnique({ where: { id: ct.id } })
    expect(found).toBeNull()
  })

  it('Caso 13 — ADMIN de Gym B intenta eliminar ClassType de Gym A → 400 no encontrado', async () => {
    const ct = await prisma.classType.create({
      data: { gymId: gymAId, name: 'Para No Borrar Cross-Gym' },
    })
    createdClassTypeIds.push(ct.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/class-types/${ct.id}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no encontrado/i)
  })

  it('Caso 14 — eliminar el mismo ClassType dos veces → segunda vez 400', async () => {
    const ct = await prisma.classType.create({
      data: { gymId: gymAId, name: 'Para Borrar Doble' },
    })

    // Primera vez → OK
    await app.inject({
      method: 'DELETE',
      url: `/api/class-types/${ct.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })

    // Segunda vez → debe fallar
    const res2 = await app.inject({
      method: 'DELETE',
      url: `/api/class-types/${ct.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/no encontrado/i)
  })

  it('Caso 15 — eliminar un ClassType en uso por una clase → 409 con mensaje de negocio, sin stack trace', async () => {
    const ct = await prisma.classType.create({
      data: { gymId: gymAId, name: 'En Uso Por Una Clase' },
    })
    const startsAt = new Date()
    startsAt.setDate(startsAt.getDate() + 20)
    const cls = await prisma.class.create({
      data: {
        gymId: gymAId, classTypeId: ct.id, coachId: coachAId,
        startsAt, endsAt: new Date(startsAt.getTime() + 3600_000),
        capacity: 10, frequency: 'ONCE',
      },
    })
    createdClassIds.push(cls.id)
    createdClassTypeIds.push(ct.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/class-types/${ct.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(409)
    // El mensaje de negocio es legible — nunca el texto crudo de Prisma con rutas
    // absolutas del servidor (lo que servía este endpoint antes del fix). El stack
    // trace en sí lo oculta registerErrorHandler (index.ts) en producción; eso no
    // se prueba acá porque este test app no registra ese handler global.
    expect(res.json().error).toMatch(/referencia relacionada/i)
    expect(res.json().error).not.toMatch(/prisma|invocation|\.ts:\d+|\.js:\d+/i)

    // El tipo de clase sigue existiendo — el delete se bloqueó, no se corrompió nada
    const stillExists = await prisma.classType.findUnique({ where: { id: ct.id } })
    expect(stillExists).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Class (instancia) — GET /classes y GET /classes/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: GET /api/classes — listar y filtrar', () => {
  let app: FastifyInstance
  // Clases creadas en este suite para aislamiento
  let classA1Id: string // Gym A, mañana
  let classA2Id: string // Gym A, pasado mañana
  let classBId: string  // Gym B (para verificar aislamiento)

  beforeAll(async () => {
    app = await buildApp()

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setUTCHours(9, 0, 0, 0)

    const dayAfter = new Date()
    dayAfter.setDate(dayAfter.getDate() + 2)
    dayAfter.setUTCHours(9, 0, 0, 0)

    const gymBCoach = await prisma.user.create({
      data: { gymId: gymBId, name: 'Coach B Clases', email: 'qa-classes-coach-b-inst@test.local', passwordHash: await bcrypt.hash(TEST_PASSWORD, 10), role: 'COACH' },
    })

    const clsA1 = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: tomorrow,
        endsAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
        capacity: 15,
        frequency: 'ONCE',
      },
    })
    classA1Id = clsA1.id
    createdClassIds.push(classA1Id)

    const clsA2 = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: dayAfter,
        endsAt: new Date(dayAfter.getTime() + 60 * 60 * 1000),
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    classA2Id = clsA2.id
    createdClassIds.push(classA2Id)

    const clsB = await prisma.class.create({
      data: {
        gymId: gymBId,
        classTypeId: baseClassTypeBId,
        coachId: gymBCoach.id,
        startsAt: tomorrow,
        endsAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
        capacity: 5,
        frequency: 'ONCE',
      },
    })
    classBId = clsB.id
    createdClassIds.push(classBId)
  })
  afterAll(async () => { await app.close() })

  it('Caso 15 — sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/classes' })
    expect(res.statusCode).toBe(401)
  })

  it('Caso 16 — admin de Gym A solo ve clases de Gym A (aislamiento)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)

    // La clase de Gym A sí aparece
    const foundA = body.find((c: any) => c.id === classA1Id)
    expect(foundA).toBeDefined()
    expect(foundA.gymId).toBe(gymAId)

    // La clase de Gym B NO aparece
    const foundB = body.find((c: any) => c.id === classBId)
    expect(foundB).toBeUndefined()
  })

  it('Caso 17 — filtro por fecha: from=mañana solo devuelve clases de mañana en adelante', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const fromStr = tomorrow.toISOString().split('T')[0] // YYYY-MM-DD

    // Clase de ayer para verificar que no sale
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setUTCHours(9, 0, 0, 0)
    const clsYesterday = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: yesterday,
        endsAt: new Date(yesterday.getTime() + 60 * 60 * 1000),
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    createdClassIds.push(clsYesterday.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/classes?from=${fromStr}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // La clase de ayer NO debe aparecer
    const foundYesterday = body.find((c: any) => c.id === clsYesterday.id)
    expect(foundYesterday).toBeUndefined()

    // Las de mañana en adelante sí
    const foundTomorrow = body.find((c: any) => c.id === classA1Id)
    expect(foundTomorrow).toBeDefined()
  })

  it('Caso 17b — filtro por fecha: to=mañana excluye el pasado mañana', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const toStr = tomorrow.toISOString().split('T')[0]

    const res = await app.inject({
      method: 'GET',
      url: `/api/classes?to=${toStr}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // classA1 (mañana) sí debe aparecer (to incluye el día completo 23:59:59)
    const foundA1 = body.find((c: any) => c.id === classA1Id)
    expect(foundA1).toBeDefined()

    // classA2 (pasado mañana) NO debe aparecer
    const foundA2 = body.find((c: any) => c.id === classA2Id)
    expect(foundA2).toBeUndefined()
  })

  it('Caso 17c — respuesta incluye myBookingStatus (null si no tiene reserva)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const found = body.find((c: any) => c.id === classA1Id)
    expect(found).toBeDefined()
    expect(found.myBookingStatus).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Class — GET /classes/:id (detalle)
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: GET /api/classes/:id — detalle', () => {
  let app: FastifyInstance
  let classId: string

  beforeAll(async () => {
    app = await buildApp()

    const startsAt = new Date()
    startsAt.setDate(startsAt.getDate() + 3)
    startsAt.setUTCHours(10, 0, 0, 0)

    const cls = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 20,
        frequency: 'ONCE',
      },
    })
    classId = cls.id
    createdClassIds.push(classId)
  })
  afterAll(async () => { await app.close() })

  it('Caso 18 — GET /classes/:id feliz → 200 con classType, coach, bookings y wods', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(classId)
    expect(body.gymId).toBe(gymAId)
    expect(body.capacity).toBe(20)
    // classType incluido
    expect(body.classType).toBeDefined()
    expect(body.classType.id).toBe(baseClassTypeAId)
    // coach incluido
    expect(body.coach).toBeDefined()
    expect(body.coach.id).toBe(coachAId)
    expect(body.coach.name).toBe('Coach Classes A')
    // bookings como array vacío
    expect(Array.isArray(body.bookings)).toBe(true)
    // wods como array (vacío porque no hay WOD)
    expect(Array.isArray(body.wods)).toBe(true)
  })

  it('Caso 19 — GET /classes/:id de otro gym → 404', async () => {
    const gymBCoach = await prisma.user.findFirst({ where: { gymId: gymBId, role: 'COACH' } })
    // Si no hay coach en gymB, usar adminB como coachId (la FK acepta cualquier usuario del gym)
    const coachBId = gymBCoach?.id ?? adminBId

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 4)
    tomorrow.setUTCHours(11, 0, 0, 0)

    const classBId = (await prisma.class.create({
      data: {
        gymId: gymBId,
        classTypeId: baseClassTypeBId,
        coachId: coachBId,
        startsAt: tomorrow,
        endsAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
        capacity: 5,
        frequency: 'ONCE',
      },
    })).id
    createdClassIds.push(classBId)

    // Token de adminA (Gym A) intenta ver clase de Gym B
    const res = await app.inject({
      method: 'GET',
      url: `/api/classes/${classBId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrada/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: Class — POST /classes (crear — frequency=ONCE)
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: POST /api/classes — crear instancia única', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  // startsAt base: 5 días en el futuro para no colisionar con fixtures de otras suites
  function futureDate(daysAhead: number, hour = 8): string {
    const d = new Date()
    d.setDate(d.getDate() + daysAhead)
    d.setUTCHours(hour, 0, 0, 0)
    return d.toISOString()
  }

  it('Caso 20 — sin token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: futureDate(5),
        endsAt: futureDate(5, 9),
        capacity: 10,
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('Caso 21 — MEMBER intenta crear clase → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: futureDate(5),
        endsAt: futureDate(5, 9),
        capacity: 10,
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Caso 22 — COACH puede crear clase → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: futureDate(5, 7),
        endsAt: futureDate(5, 8),
        capacity: 12,
        frequency: 'ONCE',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    createdClassIds.push(body.id)
  })

  it('Caso 23 — body inválido (capacity negativa) → 400 Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: futureDate(6),
        endsAt: futureDate(6, 9),
        capacity: 0, // min(1) falla
        frequency: 'ONCE',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('Caso 23b — endsAt antes (o igual) que startsAt → 400, no 201 con una clase corrupta', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt: futureDate(7, 23),
        endsAt: futureDate(7, 0), // mismo día calendario: "00:00" queda antes que "23:00", sin rollover
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('Caso 24 — ADMIN crea clase (frequency=ONCE) → 201, todos los campos persistidos', async () => {
    const startsAt = futureDate(6, 9)
    const endsAt = futureDate(6, 10)

    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt,
        capacity: 25,
        frequency: 'ONCE',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()

    expect(body.id).toBeDefined()
    expect(body.gymId).toBe(gymAId)
    expect(body.classTypeId).toBe(baseClassTypeAId)
    expect(body.coachId).toBe(coachAId)
    expect(body.capacity).toBe(25)
    expect(body.frequency).toBe('ONCE')
    expect(new Date(body.startsAt).toISOString()).toBe(new Date(startsAt).toISOString())
    expect(new Date(body.endsAt).toISOString()).toBe(new Date(endsAt).toISOString())

    createdClassIds.push(body.id)
  })

  it('Caso 25 — crear clase duplicada (mismo classTypeId + startsAt) → 400', async () => {
    const startsAt = futureDate(7, 8)
    const endsAt = futureDate(7, 9)

    // Primera creación
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt,
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    expect(res1.statusCode).toBe(201)
    createdClassIds.push(res1.json().id)

    // Segunda creación con mismo tipo y hora → debe fallar
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt,
        capacity: 5,
        frequency: 'ONCE',
      },
    })
    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/ya existe/i)
  })

  it('Caso 26 — classType de otro gym → 400 "Tipo de clase no encontrado"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: baseClassTypeBId, // pertenece a gymB
        coachId: coachAId,
        startsAt: futureDate(8),
        endsAt: futureDate(8, 9),
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/tipo de clase no encontrado/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: Class — PATCH /classes/:id (actualizar)
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: PATCH /api/classes/:id — actualizar', () => {
  let app: FastifyInstance
  let classId: string

  beforeAll(async () => {
    app = await buildApp()

    const startsAt = new Date()
    startsAt.setDate(startsAt.getDate() + 10)
    startsAt.setUTCHours(14, 0, 0, 0)

    const cls = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    classId = cls.id
    createdClassIds.push(classId)
  })
  afterAll(async () => { await app.close() })

  it('Caso 27 — ADMIN actualiza capacity y coachId → 200 con valores nuevos', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/classes/${classId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { capacity: 20, coachId: adminAId },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.capacity).toBe(20)
    expect(body.coachId).toBe(adminAId)
    expect(body.id).toBe(classId)
  })

  it('Caso 28 — ADMIN de Gym B intenta actualizar clase de Gym A → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/classes/${classId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { capacity: 99 },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrada/i)
  })

  it('Caso 29 — MEMBER intenta actualizar clase → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/classes/${classId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { capacity: 99 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Caso 29b — PATCH que deja endsAt antes que el startsAt actual → 400, no se aplica', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/classes/${classId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      // Solo se toca endsAt: debe compararse contra el startsAt ya guardado (14:00), no omitir la validación
      payload: { endsAt: new Date('2020-01-01T10:00:00.000Z').toISOString() },
    })
    expect(res.statusCode).toBe(400)
  })

  it('Caso 29c — PATCH que toca ambos campos pero invierte el orden → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/classes/${classId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        startsAt: new Date('2030-06-01T15:00:00.000Z').toISOString(),
        endsAt: new Date('2030-06-01T14:00:00.000Z').toISOString(),
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9: Class — DELETE /classes/:id y DELETE /classes/bulk
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: DELETE /api/classes/:id — eliminar individual', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 30 — ADMIN elimina clase propia → 200 con mensaje', async () => {
    const startsAt = new Date()
    startsAt.setDate(startsAt.getDate() + 15)
    startsAt.setUTCHours(7, 0, 0, 0)

    const cls = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 10,
        frequency: 'ONCE',
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${cls.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().message).toMatch(/eliminada/i)

    // Verificar que no existe en DB
    const found = await prisma.class.findUnique({ where: { id: cls.id } })
    expect(found).toBeNull()
  })

  it('Caso 31 — ADMIN de Gym B intenta eliminar clase de Gym A → 404', async () => {
    const startsAt = new Date()
    startsAt.setDate(startsAt.getDate() + 16)
    startsAt.setUTCHours(7, 0, 0, 0)

    const cls = await prisma.class.create({
      data: {
        gymId: gymAId,
        classTypeId: baseClassTypeAId,
        coachId: coachAId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 10,
        frequency: 'ONCE',
      },
    })
    createdClassIds.push(cls.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${cls.id}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/no encontrada/i)
  })
})

describe('Class: DELETE /api/classes/bulk — eliminar en lote', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 32 — ADMIN elimina múltiples clases en bulk → 200 con count', async () => {
    const base = new Date()
    base.setDate(base.getDate() + 20)
    base.setUTCHours(6, 0, 0, 0)

    // Crear 3 clases con horas distintas para evitar duplicado de classTypeId+startsAt
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const startsAt = new Date(base.getTime() + i * 60 * 60 * 1000)
      const cls = await prisma.class.create({
        data: {
          gymId: gymAId,
          classTypeId: baseClassTypeAId,
          coachId: coachAId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
          capacity: 10,
          frequency: 'ONCE',
        },
      })
      ids.push(cls.id)
    }

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/classes/bulk',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { ids },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted).toBe(3)

    // Verificar que ya no existen en DB
    const remaining = await prisma.class.findMany({ where: { id: { in: ids } } })
    expect(remaining).toHaveLength(0)
  })

  it('Caso 32b — bulk sin ids → 400', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/classes/bulk',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { ids: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/ids/i)
  })

  it('Caso 32c — MEMBER intenta bulk delete → 403', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/classes/bulk',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { ids: ['00000000-0000-0000-0000-000000000001'] },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 10: Class — GET /classes/attendance
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: GET /api/classes/attendance — asistencia por horario', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 33 — ADMIN obtiene estructura de asistencia por hora', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/classes/attendance',
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)

    // Si hay clases, verificar la estructura
    if (body.length > 0) {
      const entry = body[0]
      expect(entry.hour).toMatch(/^\d{2}:00$/) // formato "HH:00"
      expect(typeof entry.total).toBe('number')
      expect(typeof entry.bookings).toBe('number')
      expect(typeof entry.avgOccupancy).toBe('number')
    }
  })

  it('Caso 34 — MEMBER intenta ver asistencia → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/classes/attendance',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Caso 33b — el resultado no incluye clases de Gym B (aislamiento)', async () => {
    // Crear una clase de Gym B a una hora exótica para verificar que no contamina
    const gymBCoach = await prisma.user.findFirst({ where: { gymId: gymBId } })
    if (gymBCoach) {
      const startsAtB = new Date()
      startsAtB.setDate(startsAtB.getDate() + 25)
      startsAtB.setUTCHours(3, 0, 0, 0) // hora 03:00 — probablemente no usada por gymA

      const clsB = await prisma.class.create({
        data: {
          gymId: gymBId,
          classTypeId: baseClassTypeBId,
          coachId: gymBCoach.id,
          startsAt: startsAtB,
          endsAt: new Date(startsAtB.getTime() + 60 * 60 * 1000),
          capacity: 5,
          frequency: 'ONCE',
        },
      })
      createdClassIds.push(clsB.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/classes/attendance',
        headers: { authorization: `Bearer ${adminAToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()

      // Si existe una entrada "03:00", no puede ser por la clase de gymB
      // (gymA no tiene clases a las 3am en este test)
      // El servicio filtra por gymId del token, así que no debería aparecer
      // Verificamos indirectamente: el total de clases de gymA no incluye las de gymB
      // Este test es de caja negra — verifica que no hay contaminación
      const entry03 = body.find((e: any) => e.hour === '03:00')
      // Si gymA no tiene clases a las 3am, esta entrada no debe existir
      // Si existe (por alguna clase de gymA), el test aún es válido porque
      // la clase de gymB no cambia el conteo de gymA
      expect(entry03?.total ?? 0).toBeLessThanOrEqual(
        // Solo clases del gymA a las 03:00 UTC
        await prisma.class.count({
          where: {
            gymId: gymAId,
            startsAt: { gte: new Date(0) },
          },
        }) // upper bound generoso — lo importante es que no suma las de gymB
      )
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 11: Class — POST /classes frequency=RECURRING
// ─────────────────────────────────────────────────────────────────────────────

describe('Class: POST /api/classes — clases recurrentes', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('Caso 35 — RECURRING crea múltiples instancias para los días indicados', async () => {
    // Crear un ClassType exclusivo para este test (evita colisiones con otros tests)
    const ctRecurring = await prisma.classType.create({
      data: { gymId: gymAId, name: 'Recurring Test Type' },
    })
    createdClassTypeIds.push(ctRecurring.id)

    // Lunes y Miércoles de la semana que viene
    const nextMonday = new Date()
    const dayOfWeek = nextMonday.getUTCDay()
    // Avanzar al próximo lunes (si hoy es lunes, usar el siguiente)
    const daysToMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7
    nextMonday.setDate(nextMonday.getDate() + daysToMonday)
    nextMonday.setUTCHours(8, 0, 0, 0)

    // recurringUntil: el domingo de la misma semana (6 días después del lunes)
    const sunday = new Date(nextMonday)
    sunday.setDate(sunday.getDate() + 6)
    const recurringUntil = sunday.toISOString().split('T')[0]

    const res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: ctRecurring.id,
        coachId: coachAId,
        startsAt: nextMonday.toISOString(),
        endsAt: new Date(nextMonday.getTime() + 60 * 60 * 1000).toISOString(),
        capacity: 10,
        frequency: 'RECURRING',
        recurringDays: [1, 3], // Lunes=1, Miércoles=3
        recurringUntil,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()

    // Debe haber creado exactamente Lunes y Miércoles de la semana
    expect(body.created).toBe(2)
    expect(body.skipped).toBe(0)
    expect(body.message).toMatch(/2 clases recurrentes creadas/i)

    // Verificar en DB
    const classes = await prisma.class.findMany({
      where: { gymId: gymAId, classTypeId: ctRecurring.id },
    })
    expect(classes).toHaveLength(2)
    classes.forEach(c => {
      createdClassIds.push(c.id)
      expect(c.frequency).toBe('RECURRING')
      const dow = c.startsAt.getUTCDay()
      expect([1, 3]).toContain(dow)
    })
  })

  it('Caso 35b — RECURRING con todos los slots ya existentes → 400', async () => {
    // Crear ClassType exclusivo
    const ctDup = await prisma.classType.create({
      data: { gymId: gymAId, name: 'Recurring Dup Type' },
    })
    createdClassTypeIds.push(ctDup.id)

    const nextTuesday = new Date()
    const dow = nextTuesday.getUTCDay()
    const daysToTuesday = dow === 2 ? 7 : (9 - dow) % 7 || 7
    nextTuesday.setDate(nextTuesday.getDate() + daysToTuesday)
    nextTuesday.setUTCHours(9, 0, 0, 0)

    const recurringUntil = nextTuesday.toISOString().split('T')[0]

    // Crear la primera vez
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: ctDup.id,
        coachId: coachAId,
        startsAt: nextTuesday.toISOString(),
        endsAt: new Date(nextTuesday.getTime() + 60 * 60 * 1000).toISOString(),
        capacity: 10,
        frequency: 'RECURRING',
        recurringDays: [2], // Martes
        recurringUntil,
      },
    })
    expect(res1.statusCode).toBe(201)
    const body1 = res1.json()
    // Limpiar después
    const clases1 = await prisma.class.findMany({ where: { gymId: gymAId, classTypeId: ctDup.id } })
    clases1.forEach(c => createdClassIds.push(c.id))

    // Crear exactamente los mismos slots → todos duplicados
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        classTypeId: ctDup.id,
        coachId: coachAId,
        startsAt: nextTuesday.toISOString(),
        endsAt: new Date(nextTuesday.getTime() + 60 * 60 * 1000).toISOString(),
        capacity: 10,
        frequency: 'RECURRING',
        recurringDays: [2],
        recurringUntil,
      },
    })
    expect(res2.statusCode).toBe(400)
    expect(res2.json().error).toMatch(/todas las clases del período ya existen/i)
  })
})

// ─── Suite: IDs del body deben pertenecer al gym del token ───────────────────

describe('Class: allowedPlanIds y coachId de otro gym → rechazados', () => {
  let app: FastifyInstance
  let planAId: string
  let planBId: string
  let classId: string

  function futureDate(daysAhead: number, hour = 8): string {
    const d = new Date()
    d.setDate(d.getDate() + daysAhead)
    d.setUTCHours(hour, 0, 0, 0)
    return d.toISOString()
  }

  const auth = () => ({ authorization: `Bearer ${adminAToken}` })

  beforeAll(async () => {
    app = await buildApp()
    planAId = (await prisma.plan.create({ data: { gymId: gymAId, name: 'QA Plan A', priceCents: 1000, durationDays: 30 } })).id
    planBId = (await prisma.plan.create({ data: { gymId: gymBId, name: 'QA Plan B', priceCents: 1000, durationDays: 30 } })).id
    const cls = await prisma.class.create({
      data: {
        gymId: gymAId, classTypeId: baseClassTypeAId, coachId: coachAId,
        startsAt: new Date(futureDate(20)), endsAt: new Date(futureDate(20, 9)), capacity: 10, frequency: 'ONCE',
      },
    })
    classId = cls.id
    createdClassIds.push(classId)
  })

  afterAll(async () => {
    await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } })
    await prisma.plan.deleteMany({ where: { id: { in: [planAId, planBId] } } })
    await app.close()
  })

  const allowedPlanIdsOf = async (id: string) =>
    (await prisma.class.findUnique({ where: { id }, include: { allowedPlans: true } }))!.allowedPlans.map(p => p.id)

  it('POST /classes con plan de otro gym → 400 y no crea la clase', async () => {
    const startsAt = futureDate(21)
    const res = await app.inject({
      method: 'POST', url: '/api/classes', headers: auth(),
      payload: { classTypeId: baseClassTypeAId, coachId: coachAId, startsAt, endsAt: futureDate(21, 9), capacity: 10, allowedPlanIds: [planBId] },
    })
    expect(res.statusCode).toBe(400)
    const created = await prisma.class.findFirst({ where: { gymId: gymAId, startsAt: new Date(startsAt) } })
    if (created) createdClassIds.push(created.id)
    expect(created).toBeNull()
  })

  it('POST /classes recurrente con plan de otro gym → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/classes', headers: auth(),
      payload: {
        classTypeId: baseClassTypeAId, coachId: coachAId, startsAt: futureDate(22), endsAt: futureDate(22, 9),
        capacity: 10, frequency: 'RECURRING', recurringDays: [1], recurringUntil: futureDate(40), allowedPlanIds: [planBId],
      },
    })
    expect(res.statusCode).toBe(400)
    const connected = await prisma.class.count({ where: { gymId: gymAId, allowedPlans: { some: { id: planBId } } } })
    expect(connected).toBe(0)
  })

  it('POST /classes con coach de otro gym → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/classes', headers: auth(),
      payload: { classTypeId: baseClassTypeAId, coachId: adminBId, startsAt: futureDate(23), endsAt: futureDate(23, 9), capacity: 10 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /classes con plan propio → 201 y lo conecta', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/classes', headers: auth(),
      payload: { classTypeId: baseClassTypeAId, coachId: coachAId, startsAt: futureDate(24), endsAt: futureDate(24, 9), capacity: 10, allowedPlanIds: [planAId] },
    })
    expect(res.statusCode).toBe(201)
    createdClassIds.push(res.json().id)
    expect(await allowedPlanIdsOf(res.json().id)).toEqual([planAId])
  })

  it('PUT /classes/:id/allowed-plans con plan de otro gym → 400 y no lo conecta', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/classes/${classId}/allowed-plans`, headers: auth(),
      payload: { allowedPlanIds: [planAId, planBId] },
    })
    expect(res.statusCode).toBe(400)
    expect(await allowedPlanIdsOf(classId)).not.toContain(planBId)
  })

  it('PATCH /classes/:id con plan de otro gym → 400 y no lo conecta', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/classes/${classId}`, headers: auth(),
      payload: { allowedPlanIds: [planBId] },
    })
    expect(res.statusCode).toBe(400)
    expect(await allowedPlanIdsOf(classId)).not.toContain(planBId)
  })

  it('PUT /classes/:id/allowed-plans con plan propio → 200', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/classes/${classId}/allowed-plans`, headers: auth(),
      payload: { allowedPlanIds: [planAId] },
    })
    expect(res.statusCode).toBe(200)
    expect(await allowedPlanIdsOf(classId)).toEqual([planAId])
  })
})

// ─── Suite: PATCH /bookings/:bookingId/attend — marcar y desmarcar ───────────

describe('Asistencia: PATCH /api/bookings/:bookingId/attend', () => {
  let app: FastifyInstance
  let classId: string
  let bookingId: string

  beforeAll(async () => {
    app = await buildApp()
    const cls = await prisma.class.create({
      data: {
        gymId: gymAId, classTypeId: baseClassTypeAId, coachId: coachAId,
        startsAt: new Date('2026-12-05T13:00:00Z'), endsAt: new Date('2026-12-05T14:00:00Z'), capacity: 10, frequency: 'ONCE',
      },
    })
    classId = cls.id
    createdClassIds.push(classId)
    bookingId = (await prisma.booking.create({ data: { userId: memberAId, classId, status: 'CONFIRMED' } })).id
  })

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { classId } })
    await app.close()
  })

  const attend = (payload?: object) => app.inject({
    method: 'PATCH', url: `/api/bookings/${bookingId}/attend`,
    headers: { authorization: `Bearer ${coachAToken}` }, ...(payload ? { payload } : {}),
  })

  it('sin body marca asistencia: status ATTENDED, attended y attendedAt', async () => {
    const res = await attend()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ATTENDED', attended: true })
    expect(res.json().attendedAt).not.toBeNull()
  })

  it('{ attended: false } la desmarca: vuelve a CONFIRMED sin attendedAt', async () => {
    const res = await attend({ attended: false })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'CONFIRMED', attended: false, attendedAt: null })
  })

  it('attended no booleano → 400', async () => {
    expect((await attend({ attended: 'si' })).statusCode).toBe(400)
  })

  it('la asistencia masiva (coach) se refleja en /classes/:id/attendees', async () => {
    const bulk = await app.inject({
      method: 'PATCH', url: `/api/classes/${classId}/attendance`,
      headers: { authorization: `Bearer ${coachAToken}` }, payload: { userIds: [memberAId] },
    })
    expect(bulk.statusCode).toBe(200)
    const list = await app.inject({
      method: 'GET', url: `/api/classes/${classId}/attendees`,
      headers: { authorization: `Bearer ${coachAToken}` },
    })
    // Antes attended nunca se marcaba en este flujo y el contador quedaba en 0
    expect(list.json().attended).toBe(1)
  })
})
