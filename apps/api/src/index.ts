import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
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
import { platformConfigRoutes } from './modules/superadmin/config.routes'
import { emailTemplateRoutes, ensureSystemTemplates } from './modules/superadmin/email-templates.routes'
import { fitAppPlansRoutes, ensureFitAppPlans } from './modules/superadmin/fitapp-plans.routes'
import { gymSubscriptionsRoutes } from './modules/superadmin/gym-subscriptions.routes'
import { gymPaymentsRoutes } from './modules/superadmin/gym-payments.routes'
import { platformAssetsRoutes } from './modules/superadmin/platform-assets.routes'
import { skillRoutes } from './modules/gyms/skills.routes'
import { benchmarkRoutes } from './modules/analytics/benchmark.routes'
import { startCronJobs } from './lib/cron'
import { requireActiveGym } from './middlewares/auth.middleware'
import { registerTenantContext } from './lib/tenant-hook'

dotenv.config()

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no configurado. La API no puede iniciar sin un secreto seguro.')
  process.exit(1)
}

const app = Fastify({ logger: true })

// ── Cabeceras de seguridad HTTP ───────────────────────────────────────────────
app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  // Permite que browsers carguen imágenes y assets desde otro origen (web→API)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
})

// ── CORS ──────────────────────────────────────────────────────────────────────
// origin: true en producción abre la API a cualquier dominio → CRÍTICO.
// En producción sólo se acepta FRONTEND_URL; en dev se permiten localhost/*.
app.register(cors, {
  origin: (origin, callback) => {
    const frontendUrl = process.env.FRONTEND_URL

    // Requests sin origin = app móvil nativa, curl, servidor a servidor → permitir
    if (!origin) return callback(null, true)

    // En desarrollo: permitir localhost Y cualquier IP de red local (WebViews en Expo)
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true)
      }
    }

    // En producción: solo el dominio de frontend configurado
    if (frontendUrl && origin === frontendUrl) return callback(null, true)

    callback(new Error(`CORS: origen no permitido — ${origin}`), false)
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
})

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  }),
})

app.register(jwt, { secret: process.env.JWT_SECRET })
app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

// ─── rawBody support para webhooks de Stripe ─────────────────────────────────
// stripe.webhooks.constructEvent() requiere el payload original como Buffer.
// Fastify lo parsea a JSON antes de que llegue al handler, perdiendo los bytes
// originales. Sobrescribimos el parser de application/json para preservar
// el rawBody en request.rawBody antes de parsear.
// IMPORTANTE: si @fastify/rawbody existiera en npm, se usaría ese plugin.
// Como no existe, usamos addContentTypeParser directamente.
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  function (req: any, body: Buffer, done: (err: Error | null, body?: unknown) => void) {
    req.rawBody = body
    if (!body || body.length === 0) {
      done(null, null)
      return
    }
    try {
      done(null, JSON.parse(body.toString()))
    } catch (err: any) {
      // JSON inválido — dejar pasar como null (la ruta/handler lo manejará)
      done(null, null)
    }
  },
)

// ── Error handler seguro (sin stack traces en producción) ────────────────────
app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  const isProd = process.env.NODE_ENV === 'production'
  const status = error.statusCode ?? 500
  app.log.error({ err: error, status }, error.message)
  reply.status(status).send({
    statusCode: status,
    error: isProd && status >= 500 ? 'Error interno del servidor' : error.message,
    ...(isProd ? {} : { stack: error.stack }),
  })
})

// ── Protección path traversal ─────────────────────────────────────────────────
// Valida que el filepath resuelto no salga del directorio base permitido.
function safeResolvePath(base: string, filename: string): string | null {
  // Rechazar filename que contenga separadores de directorio o nulos
  if (/[/\\]|\.\.|\0/.test(filename)) return null
  const resolved = path.resolve(base, filename)
  // La ruta resuelta debe empezar con la base
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null
  return resolved
}

const serveDirFile = (dir: string) => async (request: any, reply: any) => {
  const { filename } = request.params as any
  const baseDir = path.resolve(process.cwd(), 'uploads', dir)
  const filepath = safeResolvePath(baseDir, filename)
  if (!filepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })
  if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.html': 'text/html',
  }
  reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  return reply.send(fs.createReadStream(filepath))
}

app.get('/uploads/avatars/:filename', serveDirFile('avatars'))
app.get('/uploads/assets/:filename', serveDirFile('assets'))

app.get('/uploads/:filename', async (request, reply) => {
  const { filename } = request.params as any
  const baseDir = path.resolve(process.cwd(), 'uploads')
  const filepath = safeResolvePath(baseDir, filename)
  if (!filepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })
  if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Archivo no encontrado' })
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  }
  reply.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  return reply.send(fs.createReadStream(filepath))
})


app.get('/movements/:filename', async (request, reply) => {
  const { filename } = request.params as any
  const baseDir = path.resolve(process.cwd(), 'public', 'movements')
  const resolvedFilepath = safeResolvePath(baseDir, filename)
  if (!resolvedFilepath) return reply.status(400).send({ error: 'Nombre de archivo inválido' })
  const filepath = resolvedFilepath
  if (!fs.existsSync(filepath)) return reply.status(404).send({ error: 'Movimiento no encontrado' })
  reply.header('Content-Type', 'image/gif')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(fs.createReadStream(filepath))
})

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// /healthz — health check para reverse proxy y monitoreo de plataforma.
// Valida que Postgres responda antes de reportar healthy.
app.get('/healthz', async (_request, reply) => {
  try {
    const { prisma } = await import('./lib/prisma')
    await prisma.$queryRaw`SELECT 1`
    return reply.status(200).send({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() })
  } catch (err) {
    app.log.error({ err }, 'healthz: db check failed')
    return reply.status(503).send({ status: 'error', db: 'unreachable', timestamp: new Date().toISOString() })
  }
})

// ── Contexto de tenant para RLS ───────────────────────────────────────────────
// Cada request autenticado con gym corre sus queries bajo RLS (lib/tenant-hook.ts);
// el filtro gymId explícito en los services sigue siendo obligatorio (CLAUDE.md).
registerTenantContext(app)

// ── Hook global: gym activo ───────────────────────────────────────────────────
app.addHook('preHandler', async (request, reply) => {
  if (!request.url.startsWith('/api/') || !request.headers.authorization) return
  try {
    await request.jwtVerify()
    await requireActiveGym(request, reply)
  } catch {
    // Si el JWT falla, las rutas individuales lo manejan con authenticate()
  }
})

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
app.register(platformConfigRoutes, { prefix: '/api' })
app.register(emailTemplateRoutes, { prefix: '/api' })
app.register(fitAppPlansRoutes, { prefix: '/api' })
app.register(gymSubscriptionsRoutes, { prefix: '/api' })
app.register(gymPaymentsRoutes, { prefix: '/api' })
app.register(platformAssetsRoutes, { prefix: '/api' })
app.register(skillRoutes, { prefix: '/api' })
app.register(benchmarkRoutes, { prefix: '/api' })

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`🚀 API corriendo en http://localhost:${port}`)
    await ensureSystemTemplates()
    await ensureFitAppPlans()
    startCronJobs()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
