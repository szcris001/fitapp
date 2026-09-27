import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import { HttpError, registerErrorHandler } from '../http-error'
import { handlePrismaError } from '../prismaError'
import { Prisma } from '../../generated/prisma'

describe('error handler global en producción', () => {
  let app: FastifyInstance
  const previousEnv = process.env.NODE_ENV

  beforeAll(async () => {
    process.env.NODE_ENV = 'production'
    app = Fastify({ logger: false })
    registerErrorHandler(app)
    app.get('/conflict', async () => { throw new HttpError(409, 'El email ya está registrado') })
    app.get('/unexpected', async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432') })
    app.get('/prisma-duplicate', async () => {
      handlePrismaError(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['email'] } }))
    })
    await app.ready()
  })

  afterAll(async () => {
    process.env.NODE_ENV = previousEnv
    await app.close()
  })

  it('HttpError 4xx: status y mensaje visibles', async () => {
    const res = await app.inject('/conflict')
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('El email ya está registrado')
  })

  it('error inesperado: 500 sin detalles internos ni stack', async () => {
    const res = await app.inject('/unexpected')
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ statusCode: 500, error: 'Error interno del servidor' })
  })

  it('duplicado de Prisma → 409 con mensaje legible', async () => {
    const res = await app.inject('/prisma-duplicate')
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('El email ya está registrado en el sistema')
  })
})
