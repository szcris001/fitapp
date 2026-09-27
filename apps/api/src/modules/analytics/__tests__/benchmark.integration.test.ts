/**
 * benchmark.integration.test.ts
 *
 * Resultados de benchmark del atleta:
 *   POST /api/benchmarks/:id/result     — registra con el userId del JWT
 *   GET  /api/benchmarks/:id/my-result  — solo resultados propios y del gym del token
 *
 * Regresión: el handler leía `user.id` (el JWT trae `userId`); con `userId: undefined`
 * Prisma ignora el filtro y my-result devolvía resultados de todos los gyms.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { benchmarkRoutes } from '../benchmark.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-bench-gym-a', 'qa-bench-gym-b']
const BENCHMARK_NAME = 'QA Benchmark Fran'

let app: FastifyInstance
let gymAId: string
let gymBId: string
let memberAId: string
let memberBId: string
let benchmarkId: string
let memberAToken: string

async function cleanup() {
  await prisma.benchmarkResult.deleteMany({ where: { benchmark: { nombre: BENCHMARK_NAME } } })
  await prisma.benchmark.deleteMany({ where: { nombre: BENCHMARK_NAME } })
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
    data: { nombre: BENCHMARK_NAME, categoria: 'GIRL', formato: 'For time', isOfficial: true },
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
