/**
 * movements.integration.test.ts
 *
 * Catálogo de movimientos (global + custom por gym), mismo patrón que Benchmark:
 *   GET    /api/movements      — officiales (gymId null) + custom del propio gym
 *   POST   /api/movements      — crea custom del gym (ADMIN)
 *   DELETE /api/movements/:id  — borra custom del gym (ADMIN)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { movementRoutes } from '../movements.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-mov-gym-a', 'qa-mov-gym-b']
const OFFICIAL_NAME = 'QA Movimiento Oficial'
const CUSTOM_NAME = 'QA Movimiento Custom A'

let app: FastifyInstance
let gymAId: string
let gymBId: string
let adminAId: string
let memberAId: string
let officialMovementId: string
let customAMovementId: string
let adminAToken: string
let memberAToken: string
let adminBToken: string

async function cleanup() {
  await prisma.movement.deleteMany({ where: { nombre: { in: [OFFICIAL_NAME, CUSTOM_NAME] } } })
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

beforeAll(async () => {
  await cleanup()
  gymAId = (await prisma.gym.create({ data: { name: 'QA Mov A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  gymBId = (await prisma.gym.create({ data: { name: 'QA Mov B', slug: SLUGS[1], status: 'ACTIVE' } })).id
  adminAId = (await prisma.user.create({
    data: { gymId: gymAId, name: 'Admin Mov A', email: 'qa-mov-admin-a@test.local', passwordHash: 'x', role: 'ADMIN' },
  })).id
  memberAId = (await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Mov A', email: 'qa-mov-member-a@test.local', passwordHash: 'x', role: 'MEMBER' },
  })).id
  const adminB = await prisma.user.create({
    data: { gymId: gymBId, name: 'Admin Mov B', email: 'qa-mov-admin-b@test.local', passwordHash: 'x', role: 'ADMIN' },
  })

  // Oficial: isOfficial true, gymId null — debe ser visible para cualquier gym.
  officialMovementId = (await prisma.movement.create({
    data: { nombre: OFFICIAL_NAME, categoria: 'Fundacionales', isOfficial: true, gymId: null },
  })).id
  // Custom del Gym A: no debe ser visible desde Gym B.
  customAMovementId = (await prisma.movement.create({
    data: { nombre: CUSTOM_NAME, categoria: 'Personalizado', isOfficial: false, gymId: gymAId },
  })).id

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (_req: any, body: Buffer, done: (err: Error | null, body?: unknown) => void) {
      if (!body || body.length === 0) { done(null, null); return }
      try { done(null, JSON.parse(body.toString())) }
      catch { done(null, null) }
    },
  )
  await app.register(movementRoutes, { prefix: '/api' })
  await app.ready()

  adminAToken = app.jwt.sign({ userId: adminAId, gymId: gymAId, role: 'ADMIN' })
  memberAToken = app.jwt.sign({ userId: memberAId, gymId: gymAId, role: 'MEMBER' })
  adminBToken = app.jwt.sign({ userId: adminB.id, gymId: gymBId, role: 'ADMIN' })
})

afterAll(async () => {
  await app?.close()
  await cleanup()
  await prisma.$disconnect()
})

describe('GET /api/movements', () => {
  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/movements' })
    expect(res.statusCode).toBe(401)
  })

  it('MEMBER puede leer el catálogo (no requiere coach/admin)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/movements',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((m: any) => m.id)
    expect(ids).toContain(officialMovementId)
    expect(ids).toContain(customAMovementId)
  })

  it('el custom de Gym A no es visible desde Gym B, pero el oficial sí', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/movements',
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((m: any) => m.id)
    expect(ids).toContain(officialMovementId)
    expect(ids).not.toContain(customAMovementId)
  })
})

describe('POST /api/movements', () => {
  it('MEMBER no puede crear → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/movements',
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { nombre: 'QA Movimiento Rechazado', categoria: 'Personalizado' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN crea un custom del propio gym → 201, isOfficial false', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/movements',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { nombre: 'QA Movimiento Nuevo', categoria: 'Personalizado' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().gymId).toBe(gymAId)
    expect(res.json().isOfficial).toBe(false)
    await prisma.movement.delete({ where: { id: res.json().id } })
  })

  it('nombre duplicado (normalizado) dentro del mismo gym → 409', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/movements',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { nombre: CUSTOM_NAME.toLowerCase(), categoria: 'Personalizado' },
    })
    expect(res.statusCode).toBe(409)
  })
})

describe('DELETE /api/movements/:id', () => {
  it('ADMIN de otro gym no puede borrar un custom que no es suyo → 404', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/movements/${customAMovementId}`,
      headers: { authorization: `Bearer ${adminBToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('no se puede borrar un movimiento oficial vía este endpoint → 404', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/movements/${officialMovementId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('ADMIN borra su propio custom → 204', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/movements/${customAMovementId}`,
      headers: { authorization: `Bearer ${adminAToken}` },
    })
    expect(res.statusCode).toBe(204)
  })
})
