import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { requireSuperAdmin } from '../../middlewares/auth.middleware'
import { listEnabledBillingGateways } from '../gym-billing/billing-config.service'
import {
  confirmGymTransfer, refundGymPayment, registerManualGymPayment, rejectGymTransfer,
} from '../gym-billing/gym-billing.service'
import { sendBillingError } from '../gym-billing/gym-billing.routes'
import {
  confirmGymPaymentSchema, idParamSchema, listGymPaymentsQuerySchema, manualGymPaymentSchema, rejectGymPaymentSchema,
} from '../gym-billing/gym-billing.schema'

// Cobro por Flow lo inicia el admin del gym (POST /gyms/me/subscription/checkout) y confirma
// POST /gym-billing/flow/confirm: ya no existe /superadmin/gym-payments/flow/create.
export async function gymPaymentsRoutes(app: FastifyInstance) {
  // GET — listar pagos con filtros (hasReceipt para la cola de transferencias)
  app.get('/superadmin/gym-payments', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = listGymPaymentsQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    const { gymId, status, gateway, hasReceipt, limit, offset } = parsed.data
    const where: any = {}
    if (gymId)   where.gymId   = gymId
    if (status)  where.status  = status
    if (gateway) where.gateway = gateway
    if (hasReceipt) where.receiptUrl = hasReceipt === 'true' ? { not: null } : null

    try {
      const [payments, total] = await Promise.all([
        prisma.gymSubscriptionPayment.findMany({
          where,
          omit: { gatewayData: true },
          include: { gym: { select: { id: true, name: true, country: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.gymSubscriptionPayment.count({ where }),
      ])
      return reply.send({ payments, total })
    } catch (err) { return sendBillingError(reply, err) }
  })

  // GET — pasarelas disponibles para un gym según su país
  app.get('/superadmin/gym-payments/gateways/:gymId', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { gymId } = request.params as { gymId: string }
    try {
      const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { country: true } })
      if (!gym) return reply.status(404).send({ error: 'Gimnasio no encontrado' })
      return reply.send({ gateways: ['manual', ...(await listEnabledBillingGateways(gym.country))] })
    } catch (err) { return sendBillingError(reply, err) }
  })

  // POST — registrar pago manual (activa de verdad la suscripción)
  app.post('/superadmin/gym-payments/manual', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = manualGymPaymentSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      return reply.status(201).send(await registerManualGymPayment(parsed.data, (request.user as any).userId))
    } catch (err) { return sendBillingError(reply, err) }
  })

  // POST — confirmar transferencia de suscripción (activa la suscripción)
  app.post('/superadmin/gym-payments/:id/confirm', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    const body = confirmGymPaymentSchema.safeParse(request.body ?? {})
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Datos inválidos' })
    try {
      return reply.send(await confirmGymTransfer(params.data.id, (request.user as any).userId, body.data.notes))
    } catch (err) { return sendBillingError(reply, err) }
  })

  // POST — rechazar transferencia de suscripción (FAILED + motivo)
  app.post('/superadmin/gym-payments/:id/reject', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    const body = rejectGymPaymentSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Datos inválidos', details: body.success ? undefined : body.error.flatten() })
    try {
      return reply.send(await rejectGymTransfer(params.data.id, (request.user as any).userId, body.data.reason))
    } catch (err) { return sendBillingError(reply, err) }
  })

  // PATCH — marcar pago como reembolsado (solo pagos PAID)
  app.patch('/superadmin/gym-payments/:id/refund', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Datos inválidos' })
    try { return reply.send(await refundGymPayment(params.data.id)) } catch (err) { return sendBillingError(reply, err) }
  })
}
