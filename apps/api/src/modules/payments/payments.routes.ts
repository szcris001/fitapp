import path from 'path'
import fs from 'fs'
import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { createCheckoutSchema } from './payments.schema'
import {
  createCheckoutSession, createSelfCheckout, registerManualPayment,
  handleStripeWebhook, getPaymentHistory, getMemberMemberships, getRevenueStats,
  getEnabledGateways,
  createMercadoPagoCheckout, handleMercadoPagoWebhook,
  createFlowCheckout, handleFlowCallback,
  createKhipuCheckout, handleKhipuCallback,
  createPayUCheckout, handlePayUCallback,
  createKushkiCheckout, handleKushkiCallback,
  createOpenPayCheckout, handleOpenPayCallback,
  createMachCheckout, handleMachWebhook,
  submitTransferReceipt, getPendingTransfers, confirmTransfer, rejectTransfer,
} from './payments.service'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const manualPaymentSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'other']),
  paymentNotes: z.string().optional(),
  invoiceType: z.enum(['boleta', 'factura']).optional(),
  receiverRut: z.string().optional(),
  receiverName: z.string().optional(),
})

const selfCheckoutSchema = z.object({
  planId: z.string().uuid(),
  autoRenew: z.boolean().optional().default(false),
})

export async function paymentRoutes(app: FastifyInstance) {
  // Admin: create Stripe checkout for a user
  app.post('/payments/checkout', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const session = await createCheckoutSession(user.gymId, parsed.data.planId, parsed.data.userId)
      return reply.send(session)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Admin: register manual payment (cash/transfer/etc)
  app.post('/payments/manual', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const parsed = manualPaymentSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await registerManualPayment(
        admin.gymId,
        parsed.data.userId,
        parsed.data.planId,
        parsed.data.paymentMethod,
        parsed.data.paymentNotes,
        parsed.data.invoiceType,
        parsed.data.receiverRut,
        parsed.data.receiverName,
      )
      return reply.status(201).send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Member: initiate their own Stripe checkout
  app.post('/payments/checkout-self', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = selfCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const session = await createSelfCheckout(user.userId, parsed.data.planId, parsed.data.autoRenew)
      return reply.send(session)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Member: view own memberships/payments
  app.get('/payments/my-memberships', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getMemberMemberships(user.userId))
  })

  // Member: toggle auto-renewal on their active membership
  app.put('/payments/my-memberships/:id/auto-renew', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const { enabled } = request.body as any

    const membership = await prisma.membership.findFirst({
      where: { id, userId: user.userId, status: 'ACTIVE' },
    })
    if (!membership) return reply.status(404).send({ error: 'Membresía no encontrada' })
    if (!membership.stripePaymentMethodId && enabled) {
      return reply.status(400).send({ error: 'No hay método de pago guardado para auto-renovación' })
    }

    const updated = await prisma.membership.update({
      where: { id },
      data: { autoRenew: enabled },
    })
    return reply.send(updated)
  })

  // Stripe webhook
  app.post('/payments/webhook', { config: { rawBody: true } }, async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string
    if (!signature) return reply.status(400).send({ error: 'Sin firma Stripe' })
    try {
      const result = await handleStripeWebhook(Buffer.from(JSON.stringify(request.body)), signature)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.get('/payments/history', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getPaymentHistory(user.gymId))
  })

  app.get('/payments/revenue', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getRevenueStats(user.gymId))
  })

  // ─── Pasarelas habilitadas ────────────────────────────────────────────────
  app.get('/payments/gateways', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send({ gateways: await getEnabledGateways(user.gymId) })
  })

  // ─── Mercado Pago ─────────────────────────────────────────────────────────
  const mpCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/mercadopago', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = mpCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createMercadoPagoCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Webhook IPN de Mercado Pago (sin auth)
  app.post('/payments/webhook/mercadopago', async (request, reply) => {
    try {
      await handleMercadoPagoWebhook(request.body)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── Flow Chile ───────────────────────────────────────────────────────────
  const flowCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/flow', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = flowCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createFlowCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Callback de Flow (redirect después de pago, sin auth)
  app.post('/payments/callback/flow', async (request, reply) => {
    const { token, gymId, planId, userId } = request.body as any
    try {
      await handleFlowCallback(token, gymId, planId, userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── Khipu Chile ──────────────────────────────────────────────────────────
  const khipuCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/khipu', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = khipuCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createKhipuCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // IPN de Khipu (sin auth)
  app.post('/payments/callback/khipu', async (request, reply) => {
    const { gymId, planId, userId, ...rest } = request.body as any
    try {
      await handleKhipuCallback(rest, gymId, planId, userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── PayU LATAM ──────────────────────────────────────────────────────────────
  const payuCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/payu', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = payuCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createPayUCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Confirmación de PayU (POST desde PayU a nuestro servidor)
  app.post('/payments/callback/payu', async (request, reply) => {
    const { gymId, planId, userId } = request.query as any
    try {
      await handlePayUCallback(request.body, gymId, planId, userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── Kushki ──────────────────────────────────────────────────────────────────
  const kushkiCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/kushki', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = kushkiCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createKushkiCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/payments/callback/kushki', async (request, reply) => {
    const { gymId, planId, userId } = request.query as any
    try {
      await handleKushkiCallback(request.body, gymId, planId, userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── OpenPay ─────────────────────────────────────────────────────────────────
  const openpayCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/openpay', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = openpayCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createOpenPayCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Callback de OpenPay (redirect GET desde el navegador del usuario)
  app.get('/payments/callback/openpay', async (request, reply) => {
    try {
      await handleOpenPayCallback(request.query)
      return reply.redirect(`${process.env.FRONTEND_URL}/payment/success`)
    } catch (err: any) {
      return reply.redirect(`${process.env.FRONTEND_URL}/payment/cancelled?error=${encodeURIComponent(err.message)}`)
    }
  })

  // ─── MACH Business ───────────────────────────────────────────────────────────
  const machCheckoutSchema = z.object({ planId: z.string().uuid() })

  app.post('/payments/checkout/mach', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = machCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createMachCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // MACH webhook (POST — MACH confirms payment)
  app.post('/payments/webhook/mach', async (request, reply) => {
    try {
      const result = await handleMachWebhook(request.body)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── Transferencia bancaria — alumno sube comprobante ─────────────────────
  app.post('/payments/transfer/receipt', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const data = await (request as any).file()
    if (!data) return reply.status(400).send({ error: 'No se recibió archivo' })

    const planId = (request.query as any).planId
    if (!planId) return reply.status(400).send({ error: 'planId requerido' })

    try {
      const uploadsDir = path.join(process.cwd(), 'uploads', 'receipts')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      const ext = path.extname(data.filename) || '.jpg'
      const filename = `${user.userId}-${Date.now()}${ext}`
      const filepath = path.join(uploadsDir, filename)
      await fs.promises.writeFile(filepath, await data.toBuffer())
      const receiptUrl = `/uploads/receipts/${filename}`
      const membership = await submitTransferReceipt(user.gymId, user.userId, planId, receiptUrl)
      return reply.status(201).send(membership)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Admin: ver transferencias pendientes de confirmación
  app.get('/payments/transfer/pending', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getPendingTransfers(user.gymId))
  })

  // Admin: confirmar transferencia
  app.patch('/payments/transfer/:membershipId/confirm', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const { membershipId } = request.params as any
    const { notes } = (request.body as any) || {}
    try {
      return reply.send(await confirmTransfer(admin.gymId, membershipId, notes))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Admin: rechazar transferencia
  app.patch('/payments/transfer/:membershipId/reject', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const { membershipId } = request.params as any
    const { reason } = (request.body as any) || {}
    try {
      return reply.send(await rejectTransfer(admin.gymId, membershipId, reason))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Fix: Stripe webhook con raw body real
  app.post('/payments/webhook/stripe', { config: { rawBody: true } }, async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string
    if (!signature) return reply.status(400).send({ error: 'Sin firma Stripe' })
    try {
      const rawBody = (request as any).rawBody as Buffer
      if (!rawBody) return reply.status(400).send({ error: 'Sin raw body' })
      const result = await handleStripeWebhook(rawBody, signature)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
