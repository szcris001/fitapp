/**
 * auth.middleware.test.ts
 *
 * Los guards que encadenan `authenticate` deben detenerse si este ya respondió 401.
 * Antes seguían ejecutándose con `request.user` undefined y lanzaban TypeError
 * (Fastify lo descarta en silencio porque la respuesta ya se envió).
 */

import { describe, it, expect } from 'vitest'
import Fastify, { preHandlerAsyncHookHandler } from 'fastify'
import jwt from '@fastify/jwt'
import { requireAdmin, requireCoachOrAdmin, requireSuperAdmin } from '../auth.middleware'

const guards: Record<string, preHandlerAsyncHookHandler> = { requireAdmin, requireCoachOrAdmin, requireSuperAdmin }

async function buildApp(guard: preHandlerAsyncHookHandler) {
  const logged: string[] = []
  const app = Fastify({ logger: { level: 'warn', stream: { write: (line: string) => { logged.push(line) } } } })
  await app.register(jwt, { secret: 'test-secret' })
  app.get('/api/protected', { preHandler: guard }, async () => ({ ok: true }))
  await app.ready()
  return { app, logged }
}

describe.each(Object.entries(guards))('%s', (_name, guard) => {
  it('token inválido → responde 401 y no sigue ejecutando', async () => {
    let status = 0
    let sent = false
    const reply: any = {
      status(code: number) { status = code; return this },
      send() { sent = true; return this },
      get sent() { return sent },
    }
    const request: any = { url: '/api/protected', jwtVerify: async () => { throw new Error('invalid') } }
    await expect(guard.call({} as any, request, reply)).resolves.toBeUndefined()
    expect(status).toBe(401)
  })

  it('token inválido → 401 sin errores en el log', async () => {
    const { app, logged } = await buildApp(guard)
    const res = await app.inject({
      method: 'GET', url: '/api/protected',
      headers: { authorization: 'Bearer token-invalido' },
    })
    expect(res.statusCode).toBe(401)
    expect(logged).toEqual([])
    await app.close()
  })

  it('sin token → 401 sin errores en el log', async () => {
    const { app, logged } = await buildApp(guard)
    const res = await app.inject({ method: 'GET', url: '/api/protected' })
    expect(res.statusCode).toBe(401)
    expect(logged).toEqual([])
    await app.close()
  })

  it('MEMBER con token válido → 403', async () => {
    const { app } = await buildApp(guard)
    const token = app.jwt.sign({ userId: 'u1', gymId: 'g1', role: 'MEMBER' })
    const res = await app.inject({
      method: 'GET', url: '/api/protected',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
