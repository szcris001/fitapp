/**
 * benchmark-history.integration.test.ts
 *
 * Historial unificado de progreso de benchmarks del alumno (feat/wod-benchmark-link,
 * pedido de Cristian 2026-10-19): junta las dos vías de carga que conviven en el
 * producto —
 *   - "class": WodResult de un WOD de clase vinculado a un benchmark (Wod.benchmarkId)
 *   - "personal": BenchmarkResult que el alumno carga por su cuenta, sin clase
 *
 * Cubre:
 *   getBenchmarkHistory(gymId, userId)   — merge + sort, benchmark.service.ts
 *   GET /api/benchmarks/history/me       — endpoint que expone lo mismo (mobile)
 *
 * Convención de slugs: 'qa-bench-hist-gym-a' / 'qa-bench-hist-gym-b', únicas en
 * esta suite para no colisionar con otras que corren en paralelo.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { benchmarkRoutes } from '../benchmark.routes'
import { getBenchmarkHistory } from '../benchmark.service'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-bench-hist-gym-a', 'qa-bench-hist-gym-b']
const BENCH_CLASS_NAME = 'QA History Bench — hecho en clase'
const BENCH_PERSONAL_NAME = 'QA History Bench — cargado por el alumno'

let app: FastifyInstance
let gymAId: string
let gymBId: string
let classTypeAId: string
let memberAId: string
let memberBId: string
let memberAToken: string
let benchClassId: string
let benchPersonalId: string
let wodId: string

// Fechas: el WOD de clase queda más viejo; el resultado personal, más nuevo —
// así se verifica el orden por fecha desc en el merge.
const wodDate = new Date('2026-09-01T12:00:00Z')
const personalRecordedAt = new Date('2026-09-15T12:00:00Z')
// Un WOD de clase SIN benchmark (control): su WodResult nunca debe aparecer acá.
const plainWodDate = new Date('2026-09-10T12:00:00Z')

async function cleanup() {
  await prisma.benchmarkResult.deleteMany({ where: { benchmark: { nombre: { in: [BENCH_CLASS_NAME, BENCH_PERSONAL_NAME] } } } })
  await prisma.benchmark.deleteMany({ where: { nombre: { in: [BENCH_CLASS_NAME, BENCH_PERSONAL_NAME] } } })
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.wod.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.classType.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

beforeAll(async () => {
  await cleanup()
  gymAId = (await prisma.gym.create({ data: { name: 'QA Bench History A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  gymBId = (await prisma.gym.create({ data: { name: 'QA Bench History B', slug: SLUGS[1], status: 'ACTIVE' } })).id

  memberAId = (await prisma.user.create({
    data: { gymId: gymAId, name: 'Member History A', email: 'qa-bench-hist-a@test.local', passwordHash: 'x', role: 'MEMBER' },
  })).id
  memberBId = (await prisma.user.create({
    data: { gymId: gymBId, name: 'Member History B', email: 'qa-bench-hist-b@test.local', passwordHash: 'x', role: 'MEMBER' },
  })).id

  classTypeAId = (await prisma.classType.create({
    data: { gymId: gymAId, name: 'QA History CrossFit', discipline: 'CROSSFIT' },
  })).id

  benchClassId = (await prisma.benchmark.create({
    data: { nombre: BENCH_CLASS_NAME, categoria: 'HERO', formato: 'For time', isOfficial: false, gymId: gymAId },
  })).id
  benchPersonalId = (await prisma.benchmark.create({
    data: { nombre: BENCH_PERSONAL_NAME, categoria: 'GIRL', formato: 'For time', isOfficial: false, gymId: gymAId },
  })).id

  // WOD de clase, vinculado a benchClassId, scoreType TIME
  const wod = await prisma.wod.create({
    data: { gymId: gymAId, classTypeId: classTypeAId, date: wodDate, scoreType: 'TIME', benchmarkId: benchClassId },
  })
  wodId = wod.id
  await prisma.wodResult.create({
    data: {
      gymId: gymAId, wodId, userId: memberAId,
      score: 300, rx: true, recordedBy: memberAId, // 300s = 5:00
    },
  })

  // WOD de clase SIN benchmark — control negativo, no debe aparecer en el historial
  const plainWod = await prisma.wod.create({
    data: { gymId: gymAId, classTypeId: classTypeAId, date: plainWodDate, scoreType: 'REPS' },
  })
  await prisma.wodResult.create({
    data: { gymId: gymAId, wodId: plainWod.id, userId: memberAId, score: 150, rx: true, recordedBy: memberAId },
  })

  // Resultado personal (sin clase), más reciente que el WOD de clase
  await prisma.benchmarkResult.create({
    data: {
      benchmarkId: benchPersonalId, userId: memberAId, gymId: gymAId,
      scoreType: 'TIME', scoreValue: 280, isRx: true, recordedAt: personalRecordedAt, // 280s = 4:40
    },
  })

  // Resultado personal de OTRO gym/usuario — nunca debe aparecer en el historial de memberA
  await prisma.benchmarkResult.create({
    data: { benchmarkId: benchPersonalId, userId: memberBId, gymId: gymBId, scoreType: 'TIME', scoreValue: 999, isRx: true },
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

describe('getBenchmarkHistory — merge WodResult (clase) + BenchmarkResult (personal)', () => {
  it('devuelve ambas fuentes, marcadas con su origen, ordenadas por fecha desc', async () => {
    const history = await getBenchmarkHistory(gymAId, memberAId)

    // El WOD sin benchmark (control) no debe sumar una tercera entrada
    expect(history).toHaveLength(2)

    // Más reciente primero: el resultado personal (15-sep) antes que el de clase (1-sep)
    expect(history[0].source).toBe('personal')
    expect(history[0].benchmarkId).toBe(benchPersonalId)
    expect(history[0].benchmarkName).toBe(BENCH_PERSONAL_NAME)
    expect(history[0].scoreFormatted).toBe('4:40')
    expect(history[0].id).toBe(`personal_${history[0].id.replace('personal_', '')}`)

    expect(history[1].source).toBe('class')
    expect(history[1].benchmarkId).toBe(benchClassId)
    expect(history[1].benchmarkName).toBe(BENCH_CLASS_NAME)
    expect(history[1].scoreFormatted).toBe('5:00')
  })

  it('nunca mezcla datos de otro gym/usuario', async () => {
    const history = await getBenchmarkHistory(gymAId, memberAId)
    expect(history.every(h => h.benchmarkId !== benchPersonalId || h.id.includes('personal'))).toBe(true)

    const historyOtherGym = await getBenchmarkHistory(gymBId, memberBId)
    expect(historyOtherGym).toHaveLength(1)
    expect(historyOtherGym[0].score).toBe(999)
  })

  it('un gym/userId sin ningún resultado devuelve []', async () => {
    const history = await getBenchmarkHistory(gymAId, memberBId)
    expect(history).toEqual([])
  })
})

describe('GET /benchmarks/history/me', () => {
  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/benchmarks/history/me' })
    expect(res.statusCode).toBe(401)
  })

  it('con token → 200, mismo shape que getBenchmarkHistory', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/benchmarks/history/me',
      headers: { authorization: `Bearer ${memberAToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body.map((b: any) => b.source).sort()).toEqual(['class', 'personal'])
    expect(body.every((b: any) => typeof b.scoreFormatted === 'string')).toBe(true)
  })
})
