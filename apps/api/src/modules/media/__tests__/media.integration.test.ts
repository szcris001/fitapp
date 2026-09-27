/**
 * media.integration.test.ts
 *
 * Archivos subidos servidos por mediaRoutes (sin prefijo /api):
 *   /uploads/avatars/:filename — token de medios (?t=) o JWT; solo mismo gym, el propio, o SUPER_ADMIN
 *   /uploads/:filename         — logos de gym; requiere token
 *   /uploads/assets/:filename  — assets de plataforma; públicos
 * El token de medios (scope 'media') no sirve para endpoints normales.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import fs from 'fs'
import path from 'path'
import { mediaRoutes } from '../media.routes'
import { authenticate } from '../../../middlewares/auth.middleware'
import { signMediaToken } from '../../../lib/media-token'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const SLUGS = ['qa-media-gym-a', 'qa-media-gym-b']
const uploadsDir = path.resolve(process.cwd(), 'uploads')

let app: FastifyInstance
const ids = { gymA: '', gymB: '', memberA: '', memberA2: '', memberB: '' }
const files: string[] = []
let avatarFile: string
let logoFile: string
const assetFile = `qa_media_asset_${Date.now()}.png`

async function cleanup() {
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

function writeFile(rel: string) {
  const full = path.join(uploadsDir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'fake-png')
  files.push(full)
}

const media = (userId: string, gymId: string | null, role = 'MEMBER') => signMediaToken(app, { userId, gymId, role })
const access = (userId: string, gymId: string | null, role = 'MEMBER') => app.jwt.sign({ userId, gymId, role })
const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers })

beforeAll(async () => {
  await cleanup()
  ids.gymA = (await prisma.gym.create({ data: { name: 'QA Media A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  ids.gymB = (await prisma.gym.create({ data: { name: 'QA Media B', slug: SLUGS[1], status: 'ACTIVE' } })).id
  const mk = async (gymId: string, email: string) =>
    (await prisma.user.create({ data: { gymId, name: email, email, passwordHash: 'x', role: 'MEMBER' } })).id
  ids.memberA = await mk(ids.gymA, 'qa-media-a@test.local')
  ids.memberA2 = await mk(ids.gymA, 'qa-media-a2@test.local')
  ids.memberB = await mk(ids.gymB, 'qa-media-b@test.local')

  avatarFile = `avatar_${ids.memberA}.png`
  logoFile = `logo_${ids.gymA}.png`
  writeFile(`avatars/${avatarFile}`)
  writeFile(logoFile)
  writeFile(`assets/${assetFile}`)

  app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(mediaRoutes)
  app.get('/api/protected', { preHandler: authenticate }, async () => ({ ok: true }))
  await app.ready()
})

afterAll(async () => {
  for (const f of files) fs.rmSync(f, { force: true })
  await app?.close()
  await cleanup()
  await prisma.$disconnect()
})

describe('Avatares', () => {
  it('sin token → 401', async () => {
    expect((await get(`/uploads/avatars/${avatarFile}`)).statusCode).toBe(401)
  })

  it('token de medios del mismo gym → 200', async () => {
    const res = await get(`/uploads/avatars/${avatarFile}?t=${media(ids.memberA2, ids.gymA)}`)
    expect(res.statusCode).toBe(200)
  })

  it('JWT normal en Authorization del mismo gym → 200', async () => {
    const res = await get(`/uploads/avatars/${avatarFile}`, { authorization: `Bearer ${access(ids.memberA2, ids.gymA)}` })
    expect(res.statusCode).toBe(200)
  })

  it('token de medios de otro gym → 404', async () => {
    const res = await get(`/uploads/avatars/${avatarFile}?t=${media(ids.memberB, ids.gymB)}`)
    expect(res.statusCode).toBe(404)
  })

  it('avatar propio con gymId de otra sede (tras switch-sede) → 200', async () => {
    const res = await get(`/uploads/avatars/${avatarFile}?t=${media(ids.memberA, ids.gymB, 'ADMIN')}`)
    expect(res.statusCode).toBe(200)
  })

  it('SUPER_ADMIN sin gym → 200', async () => {
    const res = await get(`/uploads/avatars/${avatarFile}?t=${media('sa', null, 'SUPER_ADMIN')}`)
    expect(res.statusCode).toBe(200)
  })

  it('JWT de acceso en ?t= (sin scope media) → 401', async () => {
    const res = await get(`/uploads/avatars/${avatarFile}?t=${access(ids.memberA2, ids.gymA)}`)
    expect(res.statusCode).toBe(401)
  })
})

describe('Logos de gym', () => {
  it('sin token → 401', async () => {
    expect((await get(`/uploads/${logoFile}`)).statusCode).toBe(401)
  })

  it('con token de medios → 200', async () => {
    expect((await get(`/uploads/${logoFile}?t=${media(ids.memberB, ids.gymB)}`)).statusCode).toBe(200)
  })
})

describe('Assets de plataforma', () => {
  it('públicos, sin token → 200', async () => {
    expect((await get(`/uploads/assets/${assetFile}`)).statusCode).toBe(200)
  })
})

describe('Token de medios fuera de /uploads', () => {
  it('usado como Bearer en un endpoint normal → 401', async () => {
    const res = await get('/api/protected', { authorization: `Bearer ${media(ids.memberA, ids.gymA)}` })
    expect(res.statusCode).toBe(401)
  })
})

describe('Comprobantes de transferencia', () => {
  let receiptFile: string
  let adminAId: string
  let adminBId: string
  let planId: string

  beforeAll(async () => {
    adminAId = (await prisma.user.create({ data: { gymId: ids.gymA, name: 'Admin A', email: 'qa-media-admin-a@test.local', passwordHash: 'x', role: 'ADMIN' } })).id
    adminBId = (await prisma.user.create({ data: { gymId: ids.gymB, name: 'Admin B', email: 'qa-media-admin-b@test.local', passwordHash: 'x', role: 'ADMIN' } })).id
    planId = (await prisma.plan.create({ data: { gymId: ids.gymA, name: 'QA Plan Recibo', priceCents: 1000, durationDays: 30 } })).id
    receiptFile = `${ids.memberA}-${Date.now()}.pdf`
    writeFile(`receipts/${receiptFile}`)
    await prisma.membership.create({
      data: {
        userId: ids.memberA, planId, status: 'INACTIVE', transferStatus: 'PENDING_REVIEW', startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000),
        pricePaid: 1000, currency: 'CLP', transferReceiptUrl: `/uploads/receipts/${receiptFile}`,
      },
    })
  })

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { planId } })
    await prisma.plan.deleteMany({ where: { id: planId } })
  })

  const url = () => `/uploads/receipts/${receiptFile}`

  it('sin token → 401', async () => {
    expect((await get(url())).statusCode).toBe(401)
  })

  it('el alumno dueño → 200 como PDF', async () => {
    const res = await get(`${url()}?t=${media(ids.memberA, ids.gymA)}`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
  })

  it('ADMIN del mismo gym → 200', async () => {
    expect((await get(`${url()}?t=${media(adminAId, ids.gymA, 'ADMIN')}`)).statusCode).toBe(200)
  })

  it('otro alumno del mismo gym → 404', async () => {
    expect((await get(`${url()}?t=${media(ids.memberA2, ids.gymA)}`)).statusCode).toBe(404)
  })

  it('ADMIN de otro gym → 404', async () => {
    expect((await get(`${url()}?t=${media(adminBId, ids.gymB, 'ADMIN')}`)).statusCode).toBe(404)
  })

  it('archivo sin membresía asociada → 404', async () => {
    writeFile('receipts/huerfano.pdf')
    expect((await get(`/uploads/receipts/huerfano.pdf?t=${media(adminAId, ids.gymA, 'ADMIN')}`)).statusCode).toBe(404)
  })
})
