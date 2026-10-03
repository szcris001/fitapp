/**
 * avatar.integration.test.ts
 *
 * Tests de integración para POST /users/me/avatar — validación real del archivo.
 *
 * saveAvatarFile() en users.routes.ts solo miraba el Content-Type declarado por el
 * cliente (data.mimetype) y guardaba el archivo con data.file.pipe(writeStream) sin
 * inspeccionar el contenido real. Esto permitía subir cualquier archivo (PDF, texto)
 * declarando Content-Type: image/png. El fix usa data.toBuffer() + firma de bytes;
 * como efecto colateral correcto, un archivo que excede el límite de @fastify/multipart
 * ahora también falla con 413 (antes: 200, con un archivo cortado a medias en disco).
 *
 * Usa fastify.inject() con un body multipart construido a mano (igual que
 * transfer.integration.test.ts) — sin levantar puerto real.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { userRoutes } from '../users.routes'
import { prisma } from '../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'
const TEST_PASSWORD = 'password123'
const GYM_SLUG = 'qa-avatar-test-gym'

let gymId: string
let memberUserId: string
let memberToken: string
let member2UserId: string
let member2Token: string

// Un PNG 1×1 real — cabecera de firma PNG completa (8 bytes) + el resto es indiferente
// para este test, solo nos importa que detectImageExt() lo reconozca como PNG real.
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
  await app.register(userRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

function avatarPath(userId: string, ext: string) {
  return path.join(process.cwd(), 'uploads', 'avatars', `avatar_${userId}${ext}`)
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
  const existing = await prisma.gym.findUnique({ where: { slug: GYM_SLUG } })
  if (existing) {
    await prisma.user.deleteMany({ where: { gymId: existing.id } })
    await prisma.gym.delete({ where: { id: existing.id } })
  }
  const gym = await prisma.gym.create({ data: { name: 'QA Avatar Test Gym', slug: GYM_SLUG, status: 'ACTIVE' } })
  gymId = gym.id
  const member = await prisma.user.create({
    data: { gymId, name: 'QA Avatar Member', email: 'qa-avatar-member@test.local', passwordHash, role: 'MEMBER' },
  })
  memberUserId = member.id
  // Usuario separado para la suite de límite de tamaño — su propio archivo
  // avatar_<id>.png no colisiona con el que ya queda guardado por la suite anterior.
  const member2 = await prisma.user.create({
    data: { gymId, name: 'QA Avatar Member 2', email: 'qa-avatar-member-2@test.local', passwordHash, role: 'MEMBER' },
  })
  member2UserId = member2.id

  const tempApp = Fastify({ logger: false })
  await tempApp.register(jwt, { secret: JWT_SECRET })
  await tempApp.ready()
  memberToken = tempApp.jwt.sign({ userId: memberUserId, gymId, role: 'MEMBER' })
  member2Token = tempApp.jwt.sign({ userId: member2UserId, gymId, role: 'MEMBER' })
  await tempApp.close()
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [memberUserId, member2UserId] } } })
  await prisma.gym.deleteMany({ where: { id: gymId } })
  for (const userId of [memberUserId, member2UserId]) {
    for (const ext of ['.png', '.jpg', '.webp']) {
      await fs.promises.rm(avatarPath(userId, ext), { force: true })
    }
  }
})

describe('Users: POST /api/users/me/avatar — valida el contenido real del archivo', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it('PDF declarado como image/png → 400, no se guarda nada', async () => {
    const boundary = 'test-boundary-pdf'
    const body = buildMultipartBody(boundary, 'disfrazado.png', FAKE_PDF, 'image/png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/avatar',
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Tipo de archivo no permitido/i)
    expect(fs.existsSync(avatarPath(memberUserId, '.png'))).toBe(false)

    const user = await prisma.user.findUnique({ where: { id: memberUserId } })
    expect(user?.avatarUrl).toBeNull()
  })

  it('PNG real → 200, se guarda y avatarUrl queda seteado', async () => {
    const boundary = 'test-boundary-real-png'
    const body = buildMultipartBody(boundary, 'real.png', REAL_PNG, 'image/png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/avatar',
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().avatarUrl).toBe(`/uploads/avatars/avatar_${memberUserId}.png`)
    expect(fs.existsSync(avatarPath(memberUserId, '.png'))).toBe(true)
    expect(fs.readFileSync(avatarPath(memberUserId, '.png'))).toEqual(REAL_PNG)

    const user = await prisma.user.findUnique({ where: { id: memberUserId } })
    expect(user?.avatarUrl).toBe(`/uploads/avatars/avatar_${memberUserId}.png`)
  })
})

describe('Users: POST /api/users/me/avatar — rechaza archivos truncados por el límite de tamaño', () => {
  let app: FastifyInstance

  // Límite bajo a propósito: probar el límite real de 5MB enviando 5MB+ de payload
  // en cada test haría la suite lenta sin agregar nada — lo que se prueba es que
  // data.file.truncated se chequea, no el valor exacto del límite.
  beforeAll(async () => { app = await buildApp(1024) })
  afterAll(async () => { await app.close() })

  it('archivo más grande que el límite → 413, no queda un archivo cortado a medias', async () => {
    // @fastify/multipart (throwFileSizeLimit=true por defecto) lanza RequestFileTooLargeError
    // al leer el stream con toBuffer() — antes de que saveAvatarFile pueda escribir nada.
    const oversized = Buffer.concat([REAL_PNG, Buffer.alloc(2048, 0xaa)]) // > 1024 bytes
    const boundary = 'test-boundary-oversized'
    const body = buildMultipartBody(boundary, 'grande.png', oversized, 'image/png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/avatar',
      headers: { authorization: `Bearer ${member2Token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(413)
    expect(fs.existsSync(avatarPath(member2UserId, '.png'))).toBe(false)
  })
})
