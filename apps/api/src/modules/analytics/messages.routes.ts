import { FastifyInstance } from 'fastify'
import { requireAdmin, authenticate } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { z } from 'zod'
import { Expo, ExpoPushMessage } from 'expo-server-sdk'

const expo = new Expo()

const pushSchema = z.object({
  target: z.enum(['all', 'active', 'expiring', 'inactive', 'individual']),
  userId: z.string().uuid().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
})

const emailSchema = z.object({
  target: z.enum(['all', 'active', 'expiring', 'inactive', 'individual']),
  userId: z.string().uuid().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
})

const pushTokenSchema = z.object({
  token: z.string().min(1),
})

async function getTargetUsers(gymId: string, target: string, userId?: string) {
  if (target === 'individual' && userId) {
    return prisma.user.findMany({
      where: { id: userId, gymId },
      select: { id: true, name: true, email: true, pushToken: true },
    })
  }
  if (target === 'active') {
    return prisma.user.findMany({
      where: { gymId, role: 'MEMBER', memberships: { some: { status: 'ACTIVE' } } },
      select: { id: true, name: true, email: true, pushToken: true },
    })
  }
  if (target === 'inactive') {
    return prisma.user.findMany({
      where: { gymId, role: 'MEMBER', memberships: { none: { status: 'ACTIVE' } } },
      select: { id: true, name: true, email: true, pushToken: true },
    })
  }
  if (target === 'expiring') {
    const memberships = await prisma.membership.findMany({
      where: {
        user: { gymId },
        status: 'ACTIVE',
        endsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      select: { user: { select: { id: true, name: true, email: true, pushToken: true } } },
    })
    return memberships.map(m => m.user)
  }
  return prisma.user.findMany({
    where: { gymId, role: 'MEMBER' },
    select: { id: true, name: true, email: true, pushToken: true },
  })
}

export async function messageRoutes(app: FastifyInstance) {
  // Registrar push token del dispositivo (llamado desde la app móvil al iniciar sesión)
  app.post('/auth/push-token', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as any
    const parsed = pushTokenSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const token = parsed.data.token
    if (!Expo.isExpoPushToken(token)) {
      return reply.status(400).send({ error: 'Token de push inválido' })
    }

    await prisma.user.update({ where: { id: userId }, data: { pushToken: token } })
    return reply.send({ ok: true })
  })

  app.post('/messages/push', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = pushSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const targets = await getTargetUsers(user.gymId, parsed.data.target, parsed.data.userId)
    const validTokens = targets.filter(t => t.pushToken && Expo.isExpoPushToken(t.pushToken))

    let sent = 0
    let errors: string[] = []

    if (validTokens.length > 0) {
      const messages: ExpoPushMessage[] = validTokens.map(t => ({
        to: t.pushToken as string,
        sound: 'default',
        title: parsed.data.title,
        body: parsed.data.message,
      }))

      const chunks = expo.chunkPushNotifications(messages)
      for (const chunk of chunks) {
        try {
          const receipts = await expo.sendPushNotificationsAsync(chunk)
          sent += receipts.filter(r => r.status === 'ok').length
          errors.push(...receipts.filter(r => r.status === 'error').map(r => (r as any).message || 'Error'))
        } catch (err: any) {
          errors.push(err.message)
        }
      }
    }

    return reply.send({
      message: 'Notificación procesada',
      totalRecipients: targets.length,
      withToken: validTokens.length,
      sent,
      errors: errors.length > 0 ? errors : undefined,
    })
  })

  app.post('/messages/email', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = emailSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const targets = await getTargetUsers(user.gymId, parsed.data.target, parsed.data.userId)

    // Envío masivo vía SMTP del gimnasio (usa la misma infraestructura que emails automáticos)
    const { sendBulkEmail } = await import('../../lib/email')
    const results = await sendBulkEmail(user.gymId, {
      recipients: targets.map(t => ({ name: t.name, email: t.email })),
      subject: parsed.data.subject,
      body: parsed.data.body,
    })

    return reply.send({
      message: 'Emails enviados',
      totalRecipients: targets.length,
      sent: results.sent,
      failed: results.failed,
    })
  })
}
