/**
 * multitenancy.integration.test.ts
 *
 * Tests de integración de multi-tenancy.
 *
 * Garantía: un usuario del Gym A NO puede leer ni escribir datos del Gym B,
 * aunque manipule IDs en la URL, el body o el querystring.
 *
 * Estrategia:
 * - Dos gyms completamente aislados (A y B) creados con timestamps únicos.
 * - Un ADMIN en cada gym, con tokens JWT reales (login real).
 * - Recursos reales en Gym B: Plan, ClassType, Class, WOD.
 * - Admin de Gym A intenta acceder a esos recursos → debe siempre fallar.
 * - Cleanup quirúrgico por IDs al final (no deleteMany sin filtro).
 *
 * Patrón buildApp(): igual al validado en auth.integration.test.ts.
 * El hook requireActiveGym se incluye porque la app real lo tiene y afecta
 * las respuestas de los endpoints (podría dar 402 si el gym está SUSPENDED).
 * Lo omitimos en buildApp() porque los gyms de test son ACTIVE — el preHandler
 * de la app real llama jwtVerify() + requireActiveGym() solo si hay Authorization
 * header, y aquí siempre enviamos tokens válidos de gyms ACTIVE.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { classRoutes } from '../classes/classes.routes'
import { planRoutes } from '../plans/plans.routes'
import { userRoutes } from '../users/users.routes'
import { wodRoutes } from '../wod/wod.routes'
import { authRoutes } from '../auth/auth.routes'

// ─── Constantes ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TS = Date.now()

const GYM_A_SLUG = `qa-mt-gym-a-${TS}`
const GYM_B_SLUG = `qa-mt-gym-b-${TS}`
const TEST_PASSWORD = 'TestPass123!'

// ─── Estado global del test ───────────────────────────────────────────────────

let gymAId: string
let gymBId: string

let adminAId: string
let adminBId: string

// IDs de recursos en Gym B (el gym que Gym A intenta atacar)
let planBId: string
let classTypeBId: string
let classBId: string
let wodBId: string
let bookingBId: string // booking de un alumno de Gym B en clase de Gym B

// Tokens JWT (obtenidos haciendo login real)
let tokenA: string // Admin del Gym A — el atacante
let tokenB: string // Admin del Gym B — la víctima (para verificar setup)

let app: FastifyInstance

// ─── buildApp() ───────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false })

  await instance.register(jwt, { secret: JWT_SECRET })

  // Registramos todos los módulos que se van a testear
  await instance.register(authRoutes, { prefix: '/api' })
  await instance.register(classRoutes, { prefix: '/api' })
  await instance.register(planRoutes, { prefix: '/api' })
  await instance.register(userRoutes, { prefix: '/api' })
  await instance.register(wodRoutes, { prefix: '/api' })

  await instance.ready()
  return instance
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = await buildApp()

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  // Crear Gym A
  const gymA = await prisma.gym.create({
    data: { name: 'QA MT Gym A', slug: GYM_A_SLUG, status: 'ACTIVE' },
  })
  gymAId = gymA.id

  // Crear Gym B
  const gymB = await prisma.gym.create({
    data: { name: 'QA MT Gym B', slug: GYM_B_SLUG, status: 'ACTIVE' },
  })
  gymBId = gymB.id

  // Crear Admin A (el atacante)
  const adminA = await prisma.user.create({
    data: {
      gymId: gymAId,
      name: 'MT Admin A',
      email: `mt-admin-a-${TS}@test.local`,
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminAId = adminA.id

  // Crear Admin B (la víctima — dueño de los recursos)
  const adminB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'MT Admin B',
      email: `mt-admin-b-${TS}@test.local`,
      passwordHash,
      role: 'ADMIN',
    },
  })
  adminBId = adminB.id

  // ── Recursos en Gym B ────────────────────────────────────────────────────

  // Plan B
  const planB = await prisma.plan.create({
    data: {
      gymId: gymBId,
      name: 'Plan B Exclusivo',
      priceCents: 50000,
      currency: 'CLP',
      durationDays: 30,
    },
  })
  planBId = planB.id

  // ClassType B
  const classTypeB = await prisma.classType.create({
    data: {
      gymId: gymBId,
      name: 'CrossFit B',
      color: '#ff0000',
    },
  })
  classTypeBId = classTypeB.id

  // Class B — el coachId es el mismo adminB (es un ADMIN con coachId válido)
  const classB = await prisma.class.create({
    data: {
      gymId: gymBId,
      classTypeId: classTypeBId,
      coachId: adminBId,
      startsAt: new Date('2030-06-01T09:00:00Z'),
      endsAt: new Date('2030-06-01T10:00:00Z'),
      capacity: 10,
    },
  })
  classBId = classB.id

  // WOD B
  const wodB = await prisma.wod.create({
    data: {
      gymId: gymBId,
      classTypeId: classTypeBId,
      title: 'WOD Secreto Gym B',
      date: new Date('2030-06-01T00:00:00Z'),
    },
  })
  wodBId = wodB.id

  // Booking B: un alumno de Gym B reservó la clase B
  // (necesario para testear DELETE /bookings/:bookingId/admin cross-tenant)
  const memberB = await prisma.user.create({
    data: {
      gymId: gymBId,
      name: 'MT Member B',
      email: `mt-member-b-${TS}@test.local`,
      passwordHash,
      role: 'MEMBER',
    },
  })
  const bookingB = await prisma.booking.create({
    data: {
      userId: memberB.id,
      classId: classBId,
      status: 'CONFIRMED',
    },
  })
  bookingBId = bookingB.id

  // ── Obtener tokens haciendo login real ───────────────────────────────────

  const loginA = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: `mt-admin-a-${TS}@test.local`,
      password: TEST_PASSWORD,
      gymSlug: GYM_A_SLUG,
    },
  })
  tokenA = loginA.json().token

  const loginB = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: `mt-admin-b-${TS}@test.local`,
      password: TEST_PASSWORD,
      gymSlug: GYM_B_SLUG,
    },
  })
  tokenB = loginB.json().token
})

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  // FK order: Booking → Class → WOD → WodBlock → ClassType → Plan → User → Gym
  // En este test no creamos Bookings, pero borramos en orden correcto

  // WodBlocks se borran en cascade con Wod (onDelete: Cascade en schema)
  if (wodBId) await prisma.wod.deleteMany({ where: { id: wodBId } })
  if (classBId) {
    await prisma.booking.deleteMany({ where: { classId: classBId } })
    await prisma.class.deleteMany({ where: { id: classBId } })
  }
  if (classTypeBId) await prisma.classType.deleteMany({ where: { id: classTypeBId } })
  if (planBId) await prisma.plan.deleteMany({ where: { id: planBId } })
  if (adminAId) await prisma.user.deleteMany({ where: { id: adminAId } })
  // Borrar memberB (creado para el test de booking cross-tenant)
  await prisma.user.deleteMany({ where: { gymId: gymBId, email: `mt-member-b-${TS}@test.local` } })
  if (adminBId) await prisma.user.deleteMany({ where: { id: adminBId } })
  if (gymAId) await prisma.gym.deleteMany({ where: { id: gymAId } })
  if (gymBId) await prisma.gym.deleteMany({ where: { id: gymBId } })

  await app.close()
  await prisma.$disconnect()
})

// ─── SUITE 1: Aislamiento en listados ────────────────────────────────────────
// El Admin de Gym A solo debe ver datos propios al llamar a endpoints de lista.

describe('Multi-tenancy — listados: Admin A solo ve datos de Gym A', () => {
  it('GET /api/classes — Admin A no recibe clases de Gym B en la lista', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(200)
    const classes = response.json()
    const ids = classes.map((c: any) => c.id)
    // La clase de Gym B no debe aparecer
    expect(ids).not.toContain(classBId)
    // Todos los resultados deben pertenecer al Gym A
    classes.forEach((c: any) => {
      expect(c.gymId).toBe(gymAId)
    })
  })

  it('GET /api/plans — Admin A no recibe planes de Gym B en la lista', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(200)
    const plans = response.json()
    const ids = plans.map((p: any) => p.id)
    expect(ids).not.toContain(planBId)
    plans.forEach((p: any) => {
      expect(p.gymId).toBe(gymAId)
    })
  })

  it('GET /api/users — Admin A no recibe usuarios de Gym B en la lista', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(200)
    const users = response.json()
    const ids = users.map((u: any) => u.id)
    expect(ids).not.toContain(adminBId)
    users.forEach((u: any) => {
      expect(u.gymId).toBe(gymAId)
    })
  })

  it('GET /api/wods — Admin A no recibe WODs de Gym B en la lista', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/wods',
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(200)
    const wods = response.json()
    const ids = wods.map((w: any) => w.id)
    expect(ids).not.toContain(wodBId)
    wods.forEach((w: any) => {
      expect(w.gymId).toBe(gymAId)
    })
  })

  it('GET /api/class-types — Admin A no recibe tipos de clase de Gym B', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/class-types',
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(200)
    const classTypes = response.json()
    const ids = classTypes.map((ct: any) => ct.id)
    expect(ids).not.toContain(classTypeBId)
    classTypes.forEach((ct: any) => {
      expect(ct.gymId).toBe(gymAId)
    })
  })
})

// ─── SUITE 2: Acceso directo por ID cross-tenant (el más crítico) ─────────────
// Admin A intenta acceder a un recurso de Gym B usando su ID directamente en la URL.

describe('Multi-tenancy — acceso por ID: Admin A no puede acceder a recursos de Gym B', () => {
  it('GET /api/classes/:id con ID de clase de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('GET /api/users/:id con ID de usuario de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/users/${adminBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('GET /api/wods/class/:classId con classId de Gym B → 404', async () => {
    // Esta ruta resuelve el WOD a partir de una clase — si la clase no es de gymA, debe 404
    const response = await app.inject({
      method: 'GET',
      url: `/api/wods/class/${classBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    // El código hace findFirst({ where: { id: classId, gymId: user.gymId } })
    // Si no encuentra la clase → 404
    expect(response.statusCode).toBe(404)
  })
})

// ─── SUITE 3: Escritura cross-tenant ─────────────────────────────────────────
// Admin A intenta modificar o borrar recursos de Gym B.

describe('Multi-tenancy — escritura: Admin A no puede modificar recursos de Gym B', () => {
  it('DELETE /api/classes/:id con ID de clase de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${classBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(404)
    // La clase de Gym B debe seguir existiendo
    const classStillExists = await prisma.class.findUnique({ where: { id: classBId } })
    expect(classStillExists).not.toBeNull()
  })

  it('PUT /api/plans/:id con ID de plan de Gym B → 400/404', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Plan B Hackeado',
        priceCents: 1,
        durationDays: 1,
      },
    })

    // updatePlan hace findFirst({ where: { id, gymId } }) — si no lo encuentra lanza error
    // que la ruta convierte en 400
    expect([400, 404]).toContain(response.statusCode)
    // El plan de Gym B no debe haber cambiado
    const planIntact = await prisma.plan.findUnique({ where: { id: planBId } })
    expect(planIntact?.name).toBe('Plan B Exclusivo')
    expect(planIntact?.priceCents).toBe(50000)
  })

  it('DELETE /api/plans/:id con ID de plan de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${planBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(404)
    // El plan de Gym B sigue activo
    const planIntact = await prisma.plan.findUnique({ where: { id: planBId } })
    expect(planIntact?.isActive).toBe(true)
  })

  it('PUT /api/plans/:id — body con gymId de Gym B es ignorado, usa gymId del token', async () => {
    // Admin A crea un plan propio (necesario para tener un planId de Gym A)
    const createResp = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Plan A Temporal',
        priceCents: 10000,
        currency: 'CLP',
        durationDays: 30,
      },
    })
    expect(createResp.statusCode).toBe(201)
    const planA = createResp.json()

    // Intenta actualizar con gymId de Gym B en el body
    // updatePlan ignora gymId del body — usa el del token (gymAId)
    const updateResp = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planA.id}`,
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Plan A con gymId B',
        priceCents: 20000,
        durationDays: 30,
        // El schema de updatePlan no acepta gymId — este campo debe ser ignorado
        gymId: gymBId,
      },
    })
    expect(updateResp.statusCode).toBe(200)
    const updated = updateResp.json()

    // El plan actualizado debe seguir perteneciendo a Gym A
    expect(updated.gymId).toBe(gymAId)

    // Cleanup: desactivar plan temporal
    await prisma.plan.delete({ where: { id: planA.id } })
  })

  it('PUT /api/users/:id con ID de usuario de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/users/${adminBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Hackeado',
      },
    })

    expect(response.statusCode).toBe(404)
    // El usuario de Gym B no cambió
    const userIntact = await prisma.user.findUnique({ where: { id: adminBId } })
    expect(userIntact?.name).toBe('MT Admin B')
  })

  it('DELETE /api/wods/:id con ID de WOD de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/wods/${wodBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(404)
    // El WOD de Gym B sigue existiendo
    const wodIntact = await prisma.wod.findUnique({ where: { id: wodBId } })
    expect(wodIntact).not.toBeNull()
  })

  it('PUT /api/wods/:id con ID de WOD de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/wods/${wodBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        title: 'WOD Hackeado',
        date: '2030-06-01',
        blocks: [],
      },
    })

    expect(response.statusCode).toBe(404)
    // El título del WOD de Gym B no cambió
    const wodIntact = await prisma.wod.findUnique({ where: { id: wodBId } })
    expect(wodIntact?.title).toBe('WOD Secreto Gym B')
  })

  it('DELETE /api/class-types/:id con ID de tipo de clase de Gym B → 400', async () => {
    // deleteClassType hace findFirst({ where: { id, gymId } }) — si no lo encuentra lanza error
    // que la ruta convierte en 400
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/class-types/${classTypeBId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect([400, 404]).toContain(response.statusCode)
    // El tipo de clase de Gym B sigue existiendo
    const ctIntact = await prisma.classType.findUnique({ where: { id: classTypeBId } })
    expect(ctIntact).not.toBeNull()
  })

  it('POST /api/users/:id/reset-password con ID de usuario de Gym B → 404', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/users/${adminBId}/reset-password`,
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: { newPassword: 'HackedPassword123' },
    })

    expect(response.statusCode).toBe(404)
    // Verificar que el password de Admin B no fue cambiado
    const userIntact = await prisma.user.findUnique({ where: { id: adminBId }, omit: { passwordHash: false } })
    const passwordStillValid = await bcrypt.compare(TEST_PASSWORD, userIntact!.passwordHash)
    expect(passwordStillValid).toBe(true)
  })

  it('DELETE /api/bookings/:bookingId/admin con bookingId de Gym B → 400 (no puede eliminar alumno de otro gym)', async () => {
    // removeStudentByAdmin hace findFirst({ where: { id: bookingId, class: { gymId } } })
    // Si el booking no pertenece al gymId del token, lanza "Reserva no encontrada" → 400
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/bookings/${bookingBId}/admin`,
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(response.statusCode).toBe(400)
    // El booking de Gym B sigue existiendo — no fue borrado
    const bookingIntact = await prisma.booking.findUnique({ where: { id: bookingBId } })
    expect(bookingIntact).not.toBeNull()
    expect(bookingIntact?.status).toBe('CONFIRMED')
  })
})

// ─── SUITE 4: Escritura cross-tenant — creación con gymId manipulado ──────────
// Admin A intenta crear un recurso con gymId del Gym B en el body.
// El endpoint debe ignorar el gymId del body y usar el del token.

describe('Multi-tenancy — creación: gymId del body no puede sobreescribir gymId del token', () => {
  it('POST /api/plans — gymId de Gym B en body es ignorado, plan se crea en Gym A', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Plan Smuggled',
        priceCents: 99000,
        currency: 'CLP',
        durationDays: 30,
        // Intenta inyectar gymId de Gym B — el schema no lo acepta
        gymId: gymBId,
      },
    })

    expect(response.statusCode).toBe(201)
    const plan = response.json()
    // El plan debe pertenecer a Gym A, no a Gym B
    expect(plan.gymId).toBe(gymAId)
    expect(plan.gymId).not.toBe(gymBId)

    // Cleanup
    await prisma.plan.delete({ where: { id: plan.id } })
  })

  it('POST /api/class-types — gymId de Gym B en body es ignorado, se crea en Gym A', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/class-types',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'CT Smuggled',
        color: '#000000',
        gymId: gymBId, // ignorado
      },
    })

    expect(response.statusCode).toBe(201)
    const ct = response.json()
    expect(ct.gymId).toBe(gymAId)
    expect(ct.gymId).not.toBe(gymBId)

    // Cleanup
    await prisma.classType.delete({ where: { id: ct.id } })
  })
})

// ─── SUITE 5: Token de Gym A no funciona en contexto de Gym B ────────────────
// Verificación directa: el token de Admin A no puede "fingir" ser de Gym B.

describe('Multi-tenancy — token: el JWT es la fuente de verdad del gymId', () => {
  it('El JWT de Admin A contiene gymId de Gym A (no de Gym B)', () => {
    const decoded = app.jwt.decode(tokenA) as any
    expect(decoded.gymId).toBe(gymAId)
    expect(decoded.gymId).not.toBe(gymBId)
  })

  it('El JWT de Admin B contiene gymId de Gym B', () => {
    const decoded = app.jwt.decode(tokenB) as any
    expect(decoded.gymId).toBe(gymBId)
    expect(decoded.gymId).not.toBe(gymAId)
  })

  it('GET /api/classes con token de Admin B → solo ve clases de Gym B (no de Gym A)', async () => {
    // Verificación espejo: también funciona para Admin B
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: { Authorization: `Bearer ${tokenB}` },
    })

    expect(response.statusCode).toBe(200)
    const classes = response.json()
    const ids = classes.map((c: any) => c.id)
    // Admin B debe ver su propia clase
    expect(ids).toContain(classBId)
    // Todas las clases son de Gym B
    classes.forEach((c: any) => {
      expect(c.gymId).toBe(gymBId)
    })
  })

  it('Usar token manipulado manualmente con gymId de Gym B firmado con secret correcto → endpoint acepta solo gymId del token (no del body)', async () => {
    // Creamos un token válido firmado correctamente pero con gymId de Gym B y userId de Admin A
    // Esto simula que Admin A de alguna forma obtiene gymId=gymBId en su token
    // (no es posible en producción sin el JWT_SECRET, pero lo testeamos por completitud)
    const manipulatedToken = app.jwt.sign({
      userId: adminAId,
      gymId: gymBId, // MENTIRA: Admin A no pertenece a Gym B
      email: `mt-admin-a-${TS}@test.local`,
      name: 'MT Admin A',
      role: 'ADMIN',
    })

    // Con este token, GET /api/plans debería devolver los planes de Gym B
    // ESTE TEST PUEDE FALLAR si el backend no tiene protección adicional
    // (la protección actual es solo "usa gymId del JWT" — si el JWT miente, el backend lo cree)
    // Documentamos el comportamiento real:
    const response = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { Authorization: `Bearer ${manipulatedToken}` },
    })

    expect(response.statusCode).toBe(200)
    const plans = response.json()
    // Si el token tiene gymId=gymBId, devuelve planes de Gym B
    // Esto es ACEPTABLE porque el secreto JWT no puede ser forjado por el atacante en producción
    // Un atacante real no puede crear un token firmado con gymId=gymBId sin el JWT_SECRET
    const hasPlanB = plans.some((p: any) => p.id === planBId)
    // Documentamos: si el token dice gymBId, el backend devuelve datos de Gym B
    // La seguridad depende de que SOLO el servidor puede firmar tokens (JWT_SECRET privado)
    // Este test confirma que NO hay protección adicional en el backend — solo JWT
    expect(hasPlanB).toBe(true) // Comportamiento esperado: la seguridad es el JWT_SECRET
  })
})
