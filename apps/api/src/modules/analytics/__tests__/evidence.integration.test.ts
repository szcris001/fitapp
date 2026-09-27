/**
 * evidence.integration.test.ts
 *
 * GET /api/uploads/evidence/:filename — evidencias de progresiones gimnásticas.
 * Privadas: solo el dueño de la progresión o COACH/ADMIN del MISMO gym.
 * Archivos que no siguen el patrón evidence_<progressId>_<ts>.<ext> no se sirven.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import fs from 'fs'
import path from 'path'
import { rmRoutes } from '../rm.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-evidence-gym-a', 'qa-evidence-gym-b']
const evidenceDir = path.resolve(process.cwd(), 'uploads', 'evidence')

let app: FastifyInstance
const ids = { gymA: '', gymB: '', ownerA: '', memberA2: '', coachA: '', coachB: '', progress: '' }
let evidenceFile: string
const strayFile = `qa_stray_evidence_${Date.now()}.jpg`

async function cleanup() {
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.gymnasticProgress.deleteMany({ where: { user: { gymId: { in: gymIds } } } })
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

const tokenFor = (userId: string, gymId: string, role: string) => app.jwt.sign({ userId, gymId, role })
const get = (filename: string, token?: string) => app.inject({
  method: 'GET', url: `/api/uploads/evidence/${filename}`,
  headers: token ? { authorization: `Bearer ${token}` } : {},
})

beforeAll(async () => {
  await cleanup()
  ids.gymA = (await prisma.gym.create({ data: { name: 'QA Evidence A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  ids.gymB = (await prisma.gym.create({ data: { name: 'QA Evidence B', slug: SLUGS[1], status: 'ACTIVE' } })).id
  const mkUser = async (gymId: string, email: string, role: 'MEMBER' | 'COACH') =>
    (await prisma.user.create({ data: { gymId, name: email, email, passwordHash: 'x', role } })).id
  ids.ownerA = await mkUser(ids.gymA, 'qa-ev-owner@test.local', 'MEMBER')
  ids.memberA2 = await mkUser(ids.gymA, 'qa-ev-member2@test.local', 'MEMBER')
  ids.coachA = await mkUser(ids.gymA, 'qa-ev-coach-a@test.local', 'COACH')
  ids.coachB = await mkUser(ids.gymB, 'qa-ev-coach-b@test.local', 'COACH')
  ids.progress = (await prisma.gymnasticProgress.create({
    data: { userId: ids.ownerA, skillName: 'Muscle up', milestone: 'Primer MU' },
  })).id

  fs.mkdirSync(evidenceDir, { recursive: true })
  evidenceFile = `evidence_${ids.progress}_${Date.now()}.jpg`
  fs.writeFileSync(path.join(evidenceDir, evidenceFile), 'fake-jpg')
  fs.writeFileSync(path.join(evidenceDir, strayFile), 'fake-jpg')

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(rmRoutes, { prefix: '/api' })
  await app.ready()
})

afterAll(async () => {
  for (const f of [evidenceFile, strayFile]) fs.rmSync(path.join(evidenceDir, f), { force: true })
  await app?.close()
  await cleanup()
  await prisma.$disconnect()
})

describe('GET /api/uploads/evidence/:filename', () => {
  it('sin token → 401', async () => {
    expect((await get(evidenceFile)).statusCode).toBe(401)
  })

  it('dueño de la progresión → 200', async () => {
    expect((await get(evidenceFile, tokenFor(ids.ownerA, ids.gymA, 'MEMBER'))).statusCode).toBe(200)
  })

  it('coach del mismo gym → 200', async () => {
    expect((await get(evidenceFile, tokenFor(ids.coachA, ids.gymA, 'COACH'))).statusCode).toBe(200)
  })

  it('coach de OTRO gym → 403', async () => {
    expect((await get(evidenceFile, tokenFor(ids.coachB, ids.gymB, 'COACH'))).statusCode).toBe(403)
  })

  it('otro miembro del mismo gym → 403', async () => {
    expect((await get(evidenceFile, tokenFor(ids.memberA2, ids.gymA, 'MEMBER'))).statusCode).toBe(403)
  })

  it('archivo fuera del patrón evidence_<id>_… → 403 aunque exista', async () => {
    expect((await get(strayFile, tokenFor(ids.memberA2, ids.gymA, 'MEMBER'))).statusCode).toBe(403)
  })

  it('path traversal → 400', async () => {
    expect((await get('..%2F..%2F.env', tokenFor(ids.ownerA, ids.gymA, 'MEMBER'))).statusCode).toBe(400)
  })
})
