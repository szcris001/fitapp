import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { authRoutes } from './modules/auth/auth.routes'
import { gymRoutes } from './modules/gyms/gyms.routes'
import { userRoutes } from './modules/users/users.routes'
import { planRoutes } from './modules/plans/plans.routes'
import { classRoutes } from './modules/classes/classes.routes'
import { wodRoutes } from './modules/wod/wod.routes'
import { rmRoutes } from './modules/analytics/rm.routes'
import { paymentRoutes } from './modules/payments/payments.routes'
import { aiRoutes } from './modules/analytics/ai.routes'
import { messageRoutes } from './modules/analytics/messages.routes'
import { superAdminRoutes } from './modules/superadmin/superadmin.routes'

dotenv.config()

const app = Fastify({ logger: true })

app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
app.register(jwt, { secret: process.env.JWT_SECRET || 'fallback_secret' })
app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

app.get('/uploads/:filename', async (request, reply) => {
  const { filename } = request.params as any
  const filepath = path.join(process.cwd(), 'uploads', filename)
  if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  }
  reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
  return reply.send(fs.createReadStream(filepath))
})


app.get('/movements/:filename', async (request, reply) => {
  const { filename } = request.params as any
  const filepath = path.join(process.cwd(), 'public', 'movements', filename)
  if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Movimiento no encontrado' })
  reply.header('Content-Type', 'image/gif')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(fs.createReadStream(filepath))
})

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

app.register(authRoutes, { prefix: '/api' })
app.register(gymRoutes, { prefix: '/api' })
app.register(userRoutes, { prefix: '/api' })
app.register(planRoutes, { prefix: '/api' })
app.register(classRoutes, { prefix: '/api' })
app.register(wodRoutes, { prefix: '/api' })
app.register(rmRoutes, { prefix: '/api' })
app.register(paymentRoutes, { prefix: '/api' })
app.register(aiRoutes, { prefix: '/api' })
app.register(messageRoutes, { prefix: '/api' })
app.register(superAdminRoutes, { prefix: '/api' })

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`🚀 API corriendo en http://localhost:${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
