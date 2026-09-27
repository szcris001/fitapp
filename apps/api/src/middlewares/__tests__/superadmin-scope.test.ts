/**
 * superadmin-scope.test.ts
 *
 * CLAUDE.md: "SUPER_ADMIN con gymId: null solo puede acceder a rutas /superadmin/*"
 * (más las de multi-sede, para poder elegir un gym). Las rutas de negocio —pagos
 * incluidos— usan user.gymId en cada query y no deben ejecutarse con gymId null.
 */

import { describe, it, expect } from 'vitest'
import Fastify, { preHandlerAsyncHookHandler } from 'fastify'
import jwt from '@fastify/jwt'
import { requireAdmin, requireCoachOrAdmin } from '../auth.middleware'

const BLOCKED = ['/api/payments/history', '/api/payments/fintoc/movements', '/api/users']
const ALLOWED = ['/api/superadmin/gyms', '/api/gyms/my-sedes', '/api/gyms/switch-sede', '/api/gyms/me/subscription']

async function statusFor(guard: preHandlerAsyncHookHandler, url: string, gymId: string | null) {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: 'test-secret' })
  app.get(url, { preHandler: guard }, async () => ({ ok: true }))
  await app.ready()
  const token = app.jwt.sign({ userId: 'sa', gymId, role: 'SUPER_ADMIN' })
  const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
  await app.close()
  return res.statusCode
}

describe.each([['requireAdmin', requireAdmin], ['requireCoachOrAdmin', requireCoachOrAdmin]] as const)('%s', (_n, guard) => {
  it.each(BLOCKED)('SUPER_ADMIN sin gym en %s → 403', async (url) => {
    expect(await statusFor(guard, url, null)).toBe(403)
  })

  it.each(ALLOWED)('SUPER_ADMIN sin gym en %s → permitido', async (url) => {
    expect(await statusFor(guard, url, null)).toBe(200)
  })

  it('SUPER_ADMIN con gym (tras switch-sede) en pagos → permitido', async () => {
    expect(await statusFor(guard, '/api/payments/history', 'gym-1')).toBe(200)
  })
})
