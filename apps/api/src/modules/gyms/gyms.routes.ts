import { FastifyInstance, FastifyRequest } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { updateGymSchema } from './gyms.schema'
import { getGym, updateGym, getGymStats, getClassOccupancy } from './gyms.service'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'
import { sendTestEmail } from '../../lib/email'
import path from 'path'
import fs from 'fs'
import { z } from 'zod'
import { createGymSubscriptionCheckout, getGymSubscriptionStatus } from '../payments/payments.service'
import { signMediaToken } from '../../lib/media-token'
import { canEnterSede, sedeRole } from '../../lib/sede-access'
import { detectImageExt } from '../../lib/image-sniff'

const createSedeSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  address: z.string().optional(),
})

// Acepta tanto el formato legado (string suelto) como el actual ({name, cat}) — la UI
// solo escribe objetos, pero gyms sembrados o integraciones externas pueden seguir
// mandando strings. Todo se normaliza a {name, cat} antes de guardar.
const movementsLibrarySchema = z.array(
  z.union([
    z.string(),
    z.object({ name: z.string(), cat: z.string().optional() }),
  ])
    .transform(item => typeof item === 'string' ? { name: item, cat: 'Personalizado' } : { name: item.name, cat: item.cat ?? 'Personalizado' })
    .pipe(z.object({
      name: z.string().trim().min(1, 'El nombre del movimiento no puede estar vacío').max(100),
      cat: z.string().trim().min(1).max(50),
    })),
)

// Para dedupe: minúsculas + sin tildes, igual criterio que la búsqueda de alumnos
// (lib/search.ts en web) — "Sentadilla" y "Sentadillá" son el mismo movimiento.
function normalizeMovementName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// El JWT solo lleva { userId, gymId, role }: email y nombre se leen de la DB.
// Tras un switch-sede el gymId del JWT puede no ser el del usuario, por eso se busca por id.
async function getRequester(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, role: true } })
}

export async function gymRoutes(app: FastifyInstance) {
  // ─── Multi-sede ────────────────────────────────────────────────────────────

  // Listar todas las sedes del admin autenticado
  app.get('/gyms/my-sedes', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const requester = await getRequester(user.userId)
    if (!requester) return reply.status(401).send({ error: 'Sesión inválida' })
    // SUPER_ADMIN puede entrar a cualquier gym (soporte); un ADMIN, a las sedes de las que es dueño
    const sedes = await prisma.gym.findMany({
      where: requester.role === 'SUPER_ADMIN' ? { deletedAt: null } : { ownerEmail: requester.email },
      select: {
        id: true, name: true, slug: true, logoUrl: true, status: true,
        address: true, createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(sedes)
  })

  // Crear nueva sede
  app.post('/gyms/my-sedes', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createSedeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    const { name, slug, address } = parsed.data
    const requester = await getRequester(user.userId)
    if (!requester) return reply.status(401).send({ error: 'Sesión inválida' })

    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) return reply.status(409).send({ error: 'El slug ya está en uso' })

    try {
      const sede = await prisma.gym.create({
        data: { name, slug, address, ownerEmail: requester.email },
      })
      return reply.status(201).send(sede)
    } catch (err: any) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al crear la sede' })
    }
  })

  // Cambiar de sede activa (devuelve nuevo JWT con gymId de la sede destino)
  app.post('/gyms/switch-sede', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { targetGymId } = request.body as any
    if (!targetGymId) return reply.status(400).send({ error: 'targetGymId requerido' })

    const gym = await prisma.gym.findUnique({ where: { id: targetGymId } })
    if (!gym) return reply.status(404).send({ error: 'Sede no encontrada' })

    const requester = await getRequester(user.userId)
    if (!requester) return reply.status(401).send({ error: 'Sesión inválida' })

    if (!canEnterSede(requester, gym)) {
      return reply.status(403).send({ error: 'No tienes acceso a esta sede' })
    }

    if (gym.status === 'SUSPENDED') {
      return reply.status(403).send({ error: 'Esta sede está suspendida' })
    }

    const role = sedeRole(requester.role)
    const newToken = app.jwt.sign({
      userId: user.userId,
      gymId: gym.id,
      role,
    }, { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' })

    return reply.send({
      token: newToken,
      mediaToken: signMediaToken(app, { userId: user.userId, gymId: gym.id, role }),
      user: { userId: user.userId, gymId: gym.id, email: requester.email, name: requester.name, role },
      gym: { id: gym.id, name: gym.name, slug: gym.slug, logoUrl: gym.logoUrl },
    })
  })


  app.get('/gyms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    try {
      const forAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
      return reply.send(await getGym(user.gymId, { forAdmin }))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.put('/gyms/me', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = updateGymSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      return reply.send(await updateGym(user.gymId, parsed.data))
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })

  app.get('/gyms/me/stats', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getGymStats(user.gymId))
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })

  app.get('/gyms/me/occupancy', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { period = '7d' } = request.query as any
    try {
      return reply.send(await getClassOccupancy(user.gymId, period))
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })

  app.post('/gyms/me/email-test', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      const result = await sendTestEmail(user.gymId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/gyms/me/logo', { preHandler: requireAdmin }, async (request: FastifyRequest, reply) => {
    const user = request.user as any
    try {
      const data = await (request as any).file() as MultipartFile
      if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })

      // Nada de SVG/HTML (se servirían desde el origen de la API). data.toBuffer() lanza
      // RequestFileTooLargeError (413) si el archivo supera el límite global de
      // @fastify/multipart (5MB) en vez de truncarlo silenciosamente — mismo fix que
      // saveAvatarFile en users.routes.ts. La extensión se decide por la firma real de
      // bytes, no por el Content-Type declarado por el cliente.
      const LOGO_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
      if (!LOGO_MIME[data.mimetype]) {
        data.file.resume()
        return reply.status(400).send({ error: 'Formato no permitido (PNG, JPG o WEBP)' })
      }
      const buf = await data.toBuffer()
      const ext = detectImageExt(buf)
      if (!ext) return reply.status(400).send({ error: 'Formato no permitido (PNG, JPG o WEBP)' })

      const uploadsDir = path.join(process.cwd(), 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      const filename = `logo_${user.gymId}${ext}`
      await fs.promises.writeFile(path.join(uploadsDir, filename), buf)

      const logoUrl = `/uploads/${filename}`
      try {
        await prisma.gym.update({ where: { id: user.gymId }, data: { logoUrl } })
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al guardar el logo' })
      }

      return reply.send({ logoUrl })
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })

  // ── Envío masivo a alumnos del gimnasio ──
  app.get('/gyms/me/email-blast/preview', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { planIds, statuses } = request.query as any

    const where: any = {
      gymId: user.gymId,
      role: 'MEMBER',
      email: { not: null },
    }

    if (planIds) {
      const ids = Array.isArray(planIds) ? planIds : [planIds]
      where.memberships = { some: { planId: { in: ids } } }
    }
    if (statuses) {
      const st = Array.isArray(statuses) ? statuses : [statuses]
      where.memberships = { ...(where.memberships ?? {}), some: { ...(where.memberships?.some ?? {}), status: { in: st } } }
    }

    const count = await prisma.user.count({ where })
    return reply.send({ count })
  })

  app.post('/gyms/me/email-blast', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { subject, body, planIds, statuses } = request.body as any

    if (!subject?.trim() || !body?.trim()) {
      return reply.status(400).send({ error: 'Asunto y cuerpo son requeridos' })
    }

    const where: any = {
      gymId: user.gymId,
      role: 'MEMBER',
      email: { not: null },
    }
    if (planIds?.length)  where.memberships = { some: { planId: { in: planIds } } }
    if (statuses?.length) {
      where.memberships = {
        some: { ...(where.memberships?.some ?? {}), status: { in: statuses } }
      }
    }

    const members = await prisma.user.findMany({
      where,
      select: { name: true, email: true },
    })

    if (members.length === 0) return reply.send({ sent: 0, failed: 0, total: 0 })

    const { sendBulkEmail } = await import('../../lib/email')
    const result = await sendBulkEmail(user.gymId, {
      recipients: members.map(m => ({ name: m.name, email: m.email! })),
      subject,
      body,
    })

    return reply.send({ ...result, total: members.length })
  })

  app.get('/gyms/me/movements-library', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const gym = await prisma.gym.findUnique({ where: { id: user.gymId }, select: { movementLibrary: true } })
    return reply.send(gym?.movementLibrary ?? [])
  })

  app.put('/gyms/me/movements-library', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = movementsLibrarySchema.safeParse((request.body as any)?.movements)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })

    // Dedupe por nombre normalizado (minúsculas + sin tildes): "Sentadilla" y "Sentadillá"
    // son el mismo movimiento para quien busca, aunque el usuario los haya tipeado distinto.
    const seen = new Set<string>()
    const movements = parsed.data.filter(m => {
      const key = normalizeMovementName(m.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    await prisma.gym.update({ where: { id: user.gymId }, data: { movementLibrary: movements } })
    return reply.send({ movements })
  })

  // ─── Suscripción de plataforma ─────────────────────────────────────────────

  app.get('/gyms/me/subscription', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    if (!user.gymId) return reply.status(400).send({ error: 'Sin gimnasio asociado' })
    try {
      return reply.send(await getGymSubscriptionStatus(user.gymId))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/gyms/me/subscription/checkout', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    if (!user.gymId) return reply.status(400).send({ error: 'Sin gimnasio asociado' })
    const { planId } = request.body as any
    if (!planId) return reply.status(400).send({ error: 'planId requerido' })
    try {
      const result = await createGymSubscriptionCheckout(user.gymId, planId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
