/**
 * benchmark.integration.test.ts
 *
 * Resultados de benchmark del atleta:
 *   POST /api/benchmarks/:id/result     — registra con el userId del JWT
 *   GET  /api/benchmarks/:id/my-result  — solo resultados propios y del gym del token
 *
 * Regresión: el handler leía `user.id` (el JWT trae `userId`); con `userId: undefined`
 * Prisma ignora el filtro y my-result devolvía resultados de todos los gyms.
 *
 * Catálogo de lectura (feat/wod-benchmark-link, 2026-10-19):
 *   GET /api/benchmarks      — bajó de requireCoachOrAdmin a authenticate (MEMBER puede listar)
 *   GET /api/benchmarks/:id  — idem; sigue filtrando por catálogo oficial o del propio gym
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { benchmarkRoutes } from '../benchmark.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-bench-gym-a', 'qa-bench-gym-b']
const BENCHMARK_NAME = 'QA Benchmark Fran'
const BENCHMARK_B_NAME = 'QA Benchmark Custom Gym B'

let app: FastifyInstance
let gymAId: string
let gymBId: string
let memberAId: string
let memberBId: string
let benchmarkId: string
let benchmarkBId: string
let memberAToken: string
let memberBToken: string

async function cleanup() {
  await prisma.benchmarkResult.deleteMany({ where: { benchmark: { nombre: { in: [BENCHMARK_NAME, BENCHMARK_B_NAME] } } } })
  await prisma.benchmark.deleteMany({ where: { nombre: { in: [BENCHMARK_NAME, BENCHMARK_B_NAME] } } })
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

beforeAll(async () => {
  await cleanup()
  gymAId = (await prisma.gym.create({ data: { name: 'QA Bench A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  gymBId = (await prisma.gym.create({ data: { name: 'QA Bench B', slug: SLUGS[1], status: 'ACTIVE' } })).id
  memberAId = (await prisma.user.create({
    data: { gymId: gymAId, name: 'Member Bench A', email: 'qa-bench-a@test.local', passwordHash: 'x', role: 'MEMBER' },
  })).id
  memberBId = (await prisma.user.create({
    data: { gymId: gymBId, name: 'Member Bench B', email: 'qa-bench-b@test.local', passwordHash: 'x', role: 'MEMBER' },
  })).id
  benchmarkId = (await prisma.benchmark.create({
    // Benchmark del gym A (no oficial): uno oficial alteraría el conteo de seedBenchmarks en paralelo
    data: { nombre: BENCHMARK_NAME, categoria: 'GIRL', formato: 'For time', isOfficial: false, gymId: gymAId },
  })).id
  benchmarkBId = (await prisma.benchmark.create({
    // Benchmark custom del gym B, para probar aislamiento cross-gym en GET /benchmarks/:id
    data: { nombre: BENCHMARK_B_NAME, categoria: 'CUSTOM', formato: 'AMRAP 15', isOfficial: false, gymId: gymBId },
  })).id
  // Resultado de otro gym que NO debe aparecer en my-result de memberA
  await prisma.benchmarkResult.create({
    data: { benchmarkId, userId: memberBId, gymId: gymBId, scoreType: 'TIME', scoreValue: 200, isRx: true },
  })

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(benchmarkRoutes, { prefix: '/api' })
  await app.ready()
  memberAToken = app.jwt.sign({ userId: memberAId, gymId: gymAId, role: 'MEMBER' })
  memberBToken = app.jwt.sign({ userId: memberBId, gymId: gymBId, role: 'MEMBER' })
})

afterAll(async () => {
  await app?.close()
  await cleanup()
  await prisma.$disconnect()
})

describe('Benchmark: resultados del atleta', () => {
  it('POST /benchmarks/:id/result → 201 con el userId del JWT', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/benchmarks/${benchmarkId}/result`,
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { scoreType: 'TIME', scoreValue: 180, isRx: true },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().userId).toBe(memberAId)
    expect(res.json().gymId).toBe(gymAId)
  })

  it('GET /benchmarks/:id/my-result → solo resultados propios, nunca de otro gym', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/benchmarks/${benchmarkId}/my-result`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const results = res.json()
    expect(results).toHaveLength(1)
    expect(results.every((r: any) => r.userId === memberAId && r.gymId === gymAId)).toBe(true)
  })
})

describe('Benchmark: catálogo de lectura abierto a MEMBER (feat/wod-benchmark-link)', () => {
  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/benchmarks' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /benchmarks con rol MEMBER → 200 (antes era 403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/benchmarks',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
    // El listado incluye benchmarks oficiales y el custom del propio gym (A)
    const ids = res.json().map((b: any) => b.id)
    expect(ids).toContain(benchmarkId)
    // Nunca el benchmark custom de otro gym
    expect(ids).not.toContain(benchmarkBId)
  })

  it('GET /benchmarks/:id con rol MEMBER sobre un benchmark del propio gym → 200', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/benchmarks/${benchmarkId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(benchmarkId)
    expect(res.json().nombre).toBe(BENCHMARK_NAME)
  })

  it('GET /benchmarks/:id con un benchmark custom de OTRO gym (no oficial) → 404', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/benchmarks/${benchmarkBId}`,
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/Benchmark no encontrado/i)
  })

  it('el mismo benchmark custom sí es visible para un MEMBER de su propio gym (B)', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/benchmarks/${benchmarkBId}`,
      headers: { authorization: `Bearer ${memberBToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(benchmarkBId)
  })
})
