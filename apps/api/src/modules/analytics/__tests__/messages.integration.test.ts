/**
 * messages.integration.test.ts — POST /api/messages/email, destino "por plan" (spec §4.10)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { prisma } from '../../../lib/prisma'

const sendBulkEmail = vi.fn(async (_gymId: string, data: { recipients: { email: string }[] }) => ({ sent: data.recipients.length, failed: 0 }))
vi.mock('../../../lib/email', () => ({ sendBulkEmail }))

import { messageRoutes } from '../messages.routes'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-msg-gym-a', 'qa-msg-gym-b']
let app: FastifyInstance
let adminToken: string
const ids = { gymA: '', gymB: '', planA1: '', planA2: '', planB: '' }

async function cleanup() {
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.membership.deleteMany({ where: { user: { gymId: { in: gymIds } } } })
  await prisma.plan.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

async function member(gymId: string, email: string, planId: string) {
  const u = await prisma.user.create({ data: { gymId, name: email, email, passwordHash: 'x', role: 'MEMBER' } })
  await prisma.membership.create({
    data: { userId: u.id, planId, status: 'ACTIVE', startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), pricePaid: 1000, currency: 'CLP' },
  })
}

beforeAll(async () => {
  await cleanup()
  ids.gymA = (await prisma.gym.create({ data: { name: 'QA Msg A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  ids.gymB = (await prisma.gym.create({ data: { name: 'QA Msg B', slug: SLUGS[1], status: 'ACTIVE' } })).id
  const plan = (gymId: string, name: string) => prisma.plan.create({ data: { gymId, name, priceCents: 1000, durationDays: 30 } }).then(p => p.id)
  ids.planA1 = await plan(ids.gymA, 'A1'); ids.planA2 = await plan(ids.gymA, 'A2'); ids.planB = await plan(ids.gymB, 'B')
  await member(ids.gymA, 'qa-msg-a1@test.local', ids.planA1)
  await member(ids.gymA, 'qa-msg-a2@test.local', ids.planA2)
  await member(ids.gymB, 'qa-msg-b@test.local', ids.planB)
  const admin = await prisma.user.create({ data: { gymId: ids.gymA, name: 'Admin', email: 'qa-msg-admin@test.local', passwordHash: 'x', role: 'ADMIN' } })

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(messageRoutes, { prefix: '/api' })
  await app.ready()
  adminToken = app.jwt.sign({ userId: admin.id, gymId: ids.gymA, role: 'ADMIN' })
})

afterAll(async () => {
  await app?.close()
  await cleanup()
})

const sendToPlan = (planId: string) => app.inject({
  method: 'POST', url: '/api/messages/email', headers: { authorization: `Bearer ${adminToken}` },
  payload: { target: 'plan', planId, subject: 'Hola', body: 'Mensaje' },
})

describe('POST /api/messages/email — por plan', () => {
  it('solo envía a los alumnos del plan elegido', async () => {
    sendBulkEmail.mockClear()
    const res = await sendToPlan(ids.planA1)
    expect(res.statusCode).toBe(200)
    expect(res.json().totalRecipients).toBe(1)
    expect(sendBulkEmail.mock.calls[0][1].recipients.map(r => r.email)).toEqual(['qa-msg-a1@test.local'])
  })

  it('un plan de otro gym no envía a nadie', async () => {
    const res = await sendToPlan(ids.planB)
    expect(res.statusCode).toBe(200)
    expect(res.json().totalRecipients).toBe(0)
  })
})
