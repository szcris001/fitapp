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

const createSedeSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  address: z.string().optional(),
})

export async function gymRoutes(app: FastifyInstance) {
  // ─── Multi-sede ────────────────────────────────────────────────────────────

  // Listar todas las sedes del admin autenticado
  app.get('/gyms/my-sedes', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const sedes = await prisma.gym.findMany({
      where: { ownerEmail: user.email },
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
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { name, slug, address } = parsed.data

    const existing = await prisma.gym.findUnique({ where: { slug } })
    if (existing) return reply.status(409).send({ error: 'El slug ya está en uso' })

    try {
      const sede = await prisma.gym.create({
        data: { name, slug, address, ownerEmail: user.email },
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

    if (gym.ownerEmail !== user.email) {
      return reply.status(403).send({ error: 'No tienes acceso a esta sede' })
    }

    if (gym.status === 'SUSPENDED') {
      return reply.status(403).send({ error: 'Esta sede está suspendida' })
    }

    const newToken = app.jwt.sign({
      userId: user.userId,
      gymId: gym.id,
      email: user.email,
      name: user.name,
      role: 'ADMIN',
    }, { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' })

    return reply.send({
      token: newToken,
      user: { userId: user.userId, gymId: gym.id, email: user.email, name: user.name, role: 'ADMIN' },
      gym: { id: gym.id, name: gym.name, slug: gym.slug, logoUrl: gym.logoUrl },
    })
  })


  app.get('/gyms/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getGym(user.gymId))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.put('/gyms/me', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = updateGymSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.send(await updateGym(user.gymId, parsed.data))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/gyms/me/stats', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    try {
      return reply.send(await getGymStats(user.gymId))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/gyms/me/occupancy', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { period = '7d' } = request.query as any
    try {
      return reply.send(await getClassOccupancy(user.gymId, period))
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
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

      const uploadsDir = path.join(process.cwd(), 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

      // Extensión según el MIME declarado: nada de SVG/HTML (se servirían desde el origen de la API)
      const LOGO_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
      const ext = LOGO_MIME[data.mimetype]
      if (!ext) return reply.status(400).send({ error: 'Formato no permitido (PNG, JPG o WEBP)' })
      const filename = `logo_${user.gymId}${ext}`
      const filepath = path.join(uploadsDir, filename)

      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(filepath)
        data.file.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })

      const logoUrl = `/uploads/${filename}`
      try {
        await prisma.gym.update({ where: { id: user.gymId }, data: { logoUrl } })
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al guardar el logo' })
      }

      return reply.send({ logoUrl })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
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
    const { movements } = request.body as any
    if (!Array.isArray(movements)) return reply.status(400).send({ error: 'movements debe ser un array' })
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
