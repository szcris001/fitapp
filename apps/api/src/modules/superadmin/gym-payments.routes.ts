import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireSuperAdmin } from '../../middlewares/auth.middleware'

const GATEWAYS_BY_COUNTRY: Record<string, string[]> = {
  CL: ['manual', 'flow', 'stripe'],
  US: ['manual', 'stripe'],
  default: ['manual', 'stripe'],
}

export function getGatewaysForCountry(country: string): string[] {
  return GATEWAYS_BY_COUNTRY[country] ?? GATEWAYS_BY_COUNTRY.default
}

export async function gymPaymentsRoutes(app: FastifyInstance) {
  // GET — listar pagos con filtros
  app.get('/superadmin/gym-payments', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { gymId, status, gateway, limit = '50', offset = '0' } = request.query as any
    const where: any = {}
    if (gymId)   where.gymId   = gymId
    if (status)  where.status  = status
    if (gateway) where.gateway = gateway

    const [payments, total] = await Promise.all([
      prisma.gymSubscriptionPayment.findMany({
        where,
        include: { gym: { select: { id: true, name: true, country: true } } },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.gymSubscriptionPayment.count({ where }),
    ])
    return reply.send({ payments, total })
  })

  // GET — gateways disponibles para un gym según su país
  app.get('/superadmin/gym-payments/gateways/:gymId', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { gymId } = request.params as any
    const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { country: true } })
    if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
    return reply.send({ gateways: getGatewaysForCountry(gym.country) })
  })

  // POST — registrar pago manual
  app.post('/superadmin/gym-payments/manual', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const schema = z.object({
      gymId:          z.string(),
      planId:         z.string(),
      subscriptionId: z.string().optional(),
      amount:         z.number().int().positive(),
      currency:       z.string().default('CLP'),
      notes:          z.string().optional(),
      paidAt:         z.string().optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const gym = await prisma.gym.findUnique({ where: { id: parsed.data.gymId }, select: { country: true } })
    const payment = await prisma.gymSubscriptionPayment.create({
      data: {
        ...parsed.data,
        gateway: 'manual',
        status:  'PAID',
        paidAt:  parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
        country: gym?.country ?? 'CL',
      },
      include: { gym: { select: { id: true, name: true } } },
    })

    // Si viene con subscriptionId, marcar la suscripción como activa
    if (parsed.data.subscriptionId) {
      await prisma.gymSubscription.update({
        where: { id: parsed.data.subscriptionId },
        data:  { status: 'ACTIVE' },
      })
    }

    return reply.status(201).send(payment)
  })

  // POST — crear orden de pago Flow (Chile)
  app.post('/superadmin/gym-payments/flow/create', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const schema = z.object({
      gymId:          z.string(),
      planId:         z.string(),
      subscriptionId: z.string().optional(),
      amount:         z.number().int().positive(),
      email:          z.string().email(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const flowApiKey    = process.env.FLOW_API_KEY
    const flowSecretKey = process.env.FLOW_SECRET_KEY
    const flowApiUrl    = process.env.FLOW_API_URL || 'https://sandbox.flow.cl/api'

    if (!flowApiKey || !flowSecretKey) {
      return reply.status(400).send({ error: 'Flow no está configurado. Agrega FLOW_API_KEY y FLOW_SECRET_KEY en el .env' })
    }

    const crypto = await import('crypto')
    const commerceOrder = `SUB-${parsed.data.gymId.slice(0, 8)}-${Date.now()}`
    const urlConfirmation = `${process.env.PUBLIC_API_URL || 'http://localhost:3001'}/api/superadmin/gym-payments/flow/confirm`
    const urlReturn       = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/superadmin/payments`

    const params: Record<string, string> = {
      apiKey:         flowApiKey,
      commerceOrder,
      subject:        `Suscripción FitApp`,
      currency:       'CLP',
      amount:         String(parsed.data.amount),
      email:          parsed.data.email,
      paymentMethod:  '9', // todos los métodos disponibles
      urlConfirmation,
      urlReturn,
    }

    // Firma HMAC-SHA256
    const keys = Object.keys(params).sort()
    const toSign = keys.map(k => `${k}${params[k]}`).join('')
    const sign = crypto.default.createHmac('sha256', flowSecretKey).update(toSign).digest('hex')

    const body = new URLSearchParams({ ...params, s: sign })
    const res = await fetch(`${flowApiUrl}/payment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await res.json() as any

    if (!data.token || !data.url) {
      return reply.status(500).send({ error: `Flow error: ${JSON.stringify(data)}` })
    }

    // Guardar pago pendiente
    const gym = await prisma.gym.findUnique({ where: { id: parsed.data.gymId }, select: { country: true } })
    await prisma.gymSubscriptionPayment.create({
      data: {
        gymId:          parsed.data.gymId,
        planId:         parsed.data.planId,
        subscriptionId: parsed.data.subscriptionId,
        amount:         parsed.data.amount,
        currency:       'CLP',
        country:        gym?.country ?? 'CL',
        gateway:        'flow',
        gatewayOrderId: commerceOrder,
        gatewayData:    { token: data.token, flowOrder: data.flowOrder },
        status:         'PENDING',
      },
    })

    return reply.send({ paymentUrl: `${data.url}?token=${data.token}`, token: data.token })
  })

  // POST — webhook de confirmación Flow
  app.post('/superadmin/gym-payments/flow/confirm', async (request, reply) => {
    const { token } = request.body as any
    if (!token) return reply.status(400).send({ error: 'Token requerido' })

    const flowApiKey    = process.env.FLOW_API_KEY!
    const flowSecretKey = process.env.FLOW_SECRET_KEY!
    const flowApiUrl    = process.env.FLOW_API_URL || 'https://sandbox.flow.cl/api'

    const crypto = await import('crypto')
    const params: Record<string, string> = { apiKey: flowApiKey, token }
    const keys = Object.keys(params).sort()
    const toSign = keys.map(k => `${k}${params[k]}`).join('')
    const sign = crypto.default.createHmac('sha256', flowSecretKey).update(toSign).digest('hex')

    const qs = new URLSearchParams({ ...params, s: sign })
    const res = await fetch(`${flowApiUrl}/payment/getStatus?${qs}`)
    const data = await res.json() as any

    // status 2 = pagado
    if (data.status === 2) {
      await prisma.gymSubscriptionPayment.updateMany({
        where: { gatewayOrderId: data.commerceOrder, gateway: 'flow' },
        data:  { status: 'PAID', paidAt: new Date(), gatewayData: data },
      })

      // Activar suscripción asociada
      const payment = await prisma.gymSubscriptionPayment.findFirst({
        where: { gatewayOrderId: data.commerceOrder },
      })
      if (payment?.subscriptionId) {
        await prisma.gymSubscription.update({
          where: { id: payment.subscriptionId },
          data:  { status: 'ACTIVE' },
        })
      }
    }

    return reply.send({ ok: true })
  })

  // PATCH — marcar pago como reembolsado
  app.patch('/superadmin/gym-payments/:id/refund', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { id } = request.params as any
    const payment = await prisma.gymSubscriptionPayment.update({
      where: { id },
      data:  { status: 'REFUNDED' },
    })
    return reply.send(payment)
  })
}
