/**
 * consistency.routes.test.ts
 *
 * Test de integración para GET /consistency-badges/me — verifica que cada
 * insignia devuelta trae el `incentiveText` vigente del gym (texto libre
 * configurable en Gym.consistencyIncentiveText, no un snapshot histórico).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { consistencyRoutes } from '../consistency.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const GYM_SLUG = 'qa-consistency-routes-gym'

let app: FastifyInstance
let gymId: string
let memberId: string
let memberToken: string

beforeAll(async () => {
  const existing = await prisma.gym.findUnique({ where: { slug: GYM_SLUG } })
  if (existing) await prisma.gym.delete({ where: { id: existing.id } })

  const gym = await prisma.gym.create({
    data: { name: 'QA Consistency Routes', slug: GYM_SLUG, status: 'ACTIVE', consistencyIncentiveText: '1 mes gratis' },
  })
  gymId = gym.id
  const member = await prisma.user.create({
    data: { gymId, name: 'QA Member', email: 'qa-consistency-routes-member@test.local', passwordHash: 'x', role: 'MEMBER' },
  })
  memberId = member.id
  await prisma.consistencyBadge.create({
    data: { gymId, userId: memberId, periodStart: new Date('2021-01-01'), periodEnd: new Date('2021-07-01'), eligibleCount: 20, loggedCount: 20 },
  })

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(consistencyRoutes, { prefix: '/api' })
  await app.ready()
  memberToken = app.jwt.sign({ userId: memberId, gymId, role: 'MEMBER' })
})

afterAll(async () => {
  await app.close()
  await prisma.consistencyBadge.deleteMany({ where: { gymId } })
  await prisma.user.deleteMany({ where: { gymId } })
  await prisma.gym.delete({ where: { id: gymId } })
  await prisma.$disconnect()
})

describe('GET /consistency-badges/me', () => {
  it('cada insignia trae el incentiveText vigente del gym', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/consistency-badges/me',
      headers: { authorization: `Bearer ${memberToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].incentiveText).toBe('1 mes gratis')
  })

  it('si el gym no tiene incentiveText configurado, viene null', async () => {
    await prisma.gym.update({ where: { id: gymId }, data: { consistencyIncentiveText: null } })
    const res = await app.inject({
      method: 'GET', url: '/api/consistency-badges/me',
      headers: { authorization: `Bearer ${memberToken}` },
    })
    expect(res.json()[0].incentiveText).toBeNull()
  })
})
