/**
 * logo.integration.test.ts
 *
 * Tests de integración para POST /gyms/me/logo — mismo bug que avatar.integration.test.ts
 * para users: el endpoint guardaba el archivo con data.file.pipe(writeStream), que no
 * detecta truncamiento por el límite de @fastify/multipart, y solo miraba el Content-Type
 * declarado por el cliente. El fix usa data.toBuffer() + firma real de bytes (detectImageExt),
 * igual que saveAvatarFile.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import fs from 'fs'
import path from 'path'
import { gymRoutes } from '../gyms.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const GYM_SLUG = 'qa-logo-test-gym'
const GYM_SLUG_2 = 'qa-logo-test-gym-2'

let gymId: string
let adminToken: string
let gymId2: string
let admin2Token: string

const REAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const FAKE_PDF = Buffer.from('%PDF-1.4\n%fake pdf content, not an image\n')

function buildMultipartBody(boundary: string, filename: string, fileContent: Buffer, contentType: string): Buffer {
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`
  return Buffer.concat([Buffer.from(header), fileContent, Buffer.from(footer)])
}

async function buildApp(fileSizeLimit = 5 * 1024 * 1024): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(multipart, { limits: { fileSize: fileSizeLimit } })
  await app.register(gymRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

function logoPath(gymId: string, ext: string) {
  return path.join(process.cwd(), 'uploads', `logo_${gymId}${ext}`)
}

beforeAll(async () => {
  for (const slug of [GYM_SLUG, GYM_SLUG_2]) {
    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) await prisma.gym.delete({ where: { id: existing.id } })
  }
  const gym = await prisma.gym.create({ data: { name: 'QA Logo Test Gym', slug: GYM_SLUG, status: 'ACTIVE' } })
  gymId = gym.id
  // Gym separado para la suite de límite de tamaño — su propio logo_<id> no colisiona
  // con el que ya queda guardado por la suite anterior.
  const gym2 = await prisma.gym.create({ data: { name: 'QA Logo Test Gym 2', slug: GYM_SLUG_2, status: 'ACTIVE' } })
  gymId2 = gym2.id

  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()
  adminToken = tempApp.jwt.sign({ userId: 'qa-logo-admin', gymId, role: 'ADMIN' })
  admin2Token = tempApp.jwt.sign({ userId: 'qa-logo-admin-2', gymId: gymId2, role: 'ADMIN' })
  await tempApp.close()
})

afterAll(async () => {
  await prisma.gym.deleteMany({ where: { id: { in: [gymId, gymId2] } } })
  for (const id of [gymId, gymId2]) {
    for (const ext of ['.png', '.jpg', '.webp']) {
      await fs.promises.rm(logoPath(id, ext), { force: true })
    }
  }
})

describe('Gyms: POST /api/gyms/me/logo — valida el contenido real del archivo', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('PDF declarado como image/png → 400, no se guarda nada', async () => {
    const boundary = 'test-boundary-pdf'
    const body = buildMultipartBody(boundary, 'disfrazado.png', FAKE_PDF, 'image/png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/gyms/me/logo',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(400)
    expect(fs.existsSync(logoPath(gymId, '.png'))).toBe(false)
    const gym = await prisma.gym.findUnique({ where: { id: gymId } })
    expect(gym?.logoUrl).toBeNull()
  })

  it('PNG real → 200, se guarda y logoUrl queda seteado', async () => {
    const boundary = 'test-boundary-real-png'
    const body = buildMultipartBody(boundary, 'real.png', REAL_PNG, 'image/png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/gyms/me/logo',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().logoUrl).toBe(`/uploads/logo_${gymId}.png`)
    expect(fs.existsSync(logoPath(gymId, '.png'))).toBe(true)
    expect(fs.readFileSync(logoPath(gymId, '.png'))).toEqual(REAL_PNG)

    const gym = await prisma.gym.findUnique({ where: { id: gymId } })
    expect(gym?.logoUrl).toBe(`/uploads/logo_${gymId}.png`)
  })
})

describe('Gyms: POST /api/gyms/me/logo — rechaza archivos truncados por el límite de tamaño', () => {
  let app: FastifyInstance

  // Límite bajo a propósito, igual que avatar.integration.test.ts: probar el límite real
  // de 5MB enviando 5MB+ en cada test haría la suite lenta sin agregar nada.
  beforeAll(async () => { app = await buildApp(1024) })
  afterAll(async () => { await app.close() })

  it('archivo más grande que el límite → 413, no queda un archivo cortado a medias ni logoUrl seteado', async () => {
    const oversized = Buffer.concat([REAL_PNG, Buffer.alloc(2048, 0xaa)]) // > 1024 bytes
    const boundary = 'test-boundary-oversized'
    const body = buildMultipartBody(boundary, 'grande.png', oversized, 'image/png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/gyms/me/logo',
      headers: { authorization: `Bearer ${admin2Token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(413)
    expect(fs.existsSync(logoPath(gymId2, '.png'))).toBe(false)
    const gym = await prisma.gym.findUnique({ where: { id: gymId2 } })
    expect(gym?.logoUrl).toBeNull()
  })
})
