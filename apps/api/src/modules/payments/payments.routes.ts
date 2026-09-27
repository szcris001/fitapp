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
  saveFintocLink, getFintocStatus, importFintocMovements, listBankMovements,
  confirmBankMovement, rejectBankMovement, handleFintocWebhook,
  createFintocPayCheckout, getFintocPayStatus, handleFintocPayWebhook,
  isValidHmacSha256,
} from './payments.service'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function validateCallbackParams(
  gymId: unknown,
  planId: unknown,
  userId: unknown,
): Promise<string | null> {
  if (
    typeof gymId !== 'string' || !uuidRegex.test(gymId) ||
    typeof planId !== 'string' || !uuidRegex.test(planId) ||
    typeof userId !== 'string' || !uuidRegex.test(userId)
  ) {
    return 'Parámetros de callback inválidos'
  }
  const user = await prisma.user.findFirst({ where: { id: userId, gymId }, select: { id: true } })
  if (!user) return 'Usuario no válido para este gimnasio'
  return null
}

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
      const rawBody = (request as any).rawBody as Buffer
      if (!rawBody) return reply.status(400).send({ error: 'Sin raw body' })
      const result = await handleStripeWebhook(rawBody, signature)
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
  const mpCheckoutSchema = z.object({ planId: z.string().uuid(), userId: z.string().uuid().optional() })

  app.post('/payments/checkout/mercadopago', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = mpCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const targetUserId = parsed.data.userId ?? user.userId
      const result = await createMercadoPagoCheckout(user.gymId, parsed.data.planId, targetUserId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Webhook IPN de Mercado Pago (sin auth)
  app.post('/payments/webhook/mercadopago', async (request, reply) => {
    const xSignature = request.headers['x-signature'] as string | undefined
    const xRequestId = request.headers['x-request-id'] as string | undefined
    const body = request.body as any
    // Solo rechazar por firma ausente si hay un paymentId real en el body
    const hasPaymentId = body?.data?.id || (request.query as any)?.id
    const globalMpSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
    if (globalMpSecret && hasPaymentId && !xSignature) {
      return reply.status(401).send({ error: 'Falta header x-signature de Mercado Pago' })
    }
    try {
      await handleMercadoPagoWebhook(body, xSignature, xRequestId, request.query)
      return reply.send({ ok: true })
    } catch (err: any) {
      const status = err.message?.includes('inválida') || err.message?.includes('Falta header') ? 401 : 400
      return reply.status(status).send({ error: err.message })
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
    const validationError = await validateCallbackParams(gymId, planId, userId)
    if (validationError) return reply.status(400).send({ error: validationError })
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
    const validationError = await validateCallbackParams(gymId, planId, userId)
    if (validationError) return reply.status(400).send({ error: validationError })
    const xKhipuSignature = request.headers['x-khipu-signature'] as string | undefined
    const rawBody = (request as any).rawBody as Buffer | undefined
    try {
      await handleKhipuCallback(rest, gymId, planId, userId, xKhipuSignature, rawBody)
      return reply.send({ ok: true })
    } catch (err: any) {
      const status = err.message?.includes('inválida') || err.message?.includes('Falta header') ? 401 : 400
      return reply.status(status).send({ error: err.message })
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
    const validationError = await validateCallbackParams(gymId, planId, userId)
    if (validationError) return reply.status(400).send({ error: validationError })
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
    const validationError = await validateCallbackParams(gymId, planId, userId)
    if (validationError) return reply.status(400).send({ error: validationError })
    const xKushkiToken = request.headers['x-kushki-token'] as string | undefined
    try {
      await handleKushkiCallback(request.body, gymId, planId, userId, xKushkiToken)
      return reply.send({ ok: true })
    } catch (err: any) {
      const status = err.message?.includes('inválido') || err.message?.includes('Falta header') || err.message?.includes('no coincide') || err.message?.includes('no tiene formato') ? 401 : 400
      return reply.status(status).send({ error: err.message })
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
    const { gymId, planId, userId } = request.query as any
    const validationError = await validateCallbackParams(gymId, planId, userId)
    if (validationError) {
      return reply.redirect(`${process.env.FRONTEND_URL}/payment/cancelled?error=${encodeURIComponent(validationError)}`)
    }
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
    const authorizationHeader = request.headers['authorization'] as string | undefined
    try {
      const result = await handleMachWebhook(request.body, authorizationHeader)
      return reply.send(result)
    } catch (err: any) {
      const status = err.message?.includes('inválido') || err.message?.includes('Falta header') ? 401 : 400
      return reply.status(status).send({ error: err.message })
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

  // ─── Fintoc — Conciliación bancaria ──────────────────────────────────────────

  const fintocLinkSchema = z.object({
    linkToken: z.string().min(1),
    accountId: z.string().min(1),
    accountNumber: z.string().optional(),
    bankName: z.string().optional(),
    holderName: z.string().optional(),
    holderRut: z.string().optional(),
  })

  // POST /payments/fintoc/link — guarda o actualiza el link Fintoc del gym
  app.post('/payments/fintoc/link', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const parsed = fintocLinkSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const link = await saveFintocLink(admin.gymId, parsed.data.linkToken, parsed.data.accountId, {
        accountNumber: parsed.data.accountNumber,
        bankName: parsed.data.bankName,
        holderName: parsed.data.holderName,
        holderRut: parsed.data.holderRut,
      })
      return reply.status(201).send(link)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /payments/fintoc/status — estado de conexión + pendingCount
  app.get('/payments/fintoc/status', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    try {
      return reply.send(await getFintocStatus(admin.gymId))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  const fintocSyncSchema = z.object({
    movements: z.array(
      z.object({
        id: z.string().min(1),
        amount: z.number().int(),
        currency: z.string().optional(),
        post_date: z.string().min(1),
        description: z.string().optional(),
        sender_rut: z.string().optional(),
        sender_name: z.string().optional(),
        reference_code: z.string().optional(),
      }),
    ).min(1),
  })

  // POST /payments/fintoc/sync — importa movimientos enviados por el frontend
  app.post('/payments/fintoc/sync', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const parsed = fintocSyncSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await importFintocMovements(admin.gymId, parsed.data.movements)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /payments/fintoc/movements — lista movimientos con filtros opcionales
  app.get('/payments/fintoc/movements', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const query = request.query as any
    try {
      const result = await listBankMovements(admin.gymId, {
        status: query.status,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      })
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // PATCH /payments/fintoc/movements/:movementId/confirm — confirmar movimiento
  app.patch('/payments/fintoc/movements/:movementId/confirm', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const { movementId } = request.params as any
    const { membershipId } = (request.body as any) || {}
    if (!membershipId) return reply.status(400).send({ error: 'membershipId requerido' })
    try {
      const result = await confirmBankMovement(admin.gymId, movementId, membershipId, admin.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // PATCH /payments/fintoc/movements/:movementId/reject — rechazar movimiento
  app.patch('/payments/fintoc/movements/:movementId/reject', { preHandler: requireAdmin }, async (request, reply) => {
    const admin = request.user as any
    const { movementId } = request.params as any
    const { reason } = (request.body as any) || {}
    try {
      const result = await rejectBankMovement(admin.gymId, movementId, admin.userId, reason)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // ─── Fintoc Payments (Pay by Bank) ──────────────────────────────────────────

  const fintocPayCheckoutSchema = z.object({ planId: z.string().uuid() })
  const fintocPayStatusParamsSchema = z.object({ paymentIntentId: z.string() })

  // POST /payments/checkout/fintoc-pay — inicia un payment intent Pay by Bank
  app.post('/payments/checkout/fintoc-pay', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = fintocPayCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await createFintocPayCheckout(user.gymId, parsed.data.planId, user.userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /payments/fintoc-pay/status/:paymentIntentId — consulta estado del intent
  app.get('/payments/fintoc-pay/status/:paymentIntentId', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = fintocPayStatusParamsSchema.safeParse(request.params)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const result = await getFintocPayStatus(parsed.data.paymentIntentId, user.userId)
      if (!result) return reply.status(404).send({ error: 'Payment intent no encontrado' })
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // POST /payments/webhook/fintoc-pay — webhook de Fintoc Pay by Bank (sin auth)
  app.post('/payments/webhook/fintoc-pay', async (request, reply) => {
    const fintocSignature = request.headers['fintoc-signature'] as string | undefined
    const rawBody = (request as any).rawBody as Buffer | undefined
    try {
      const result = await handleFintocPayWebhook(request.body, rawBody ?? Buffer.from(JSON.stringify(request.body)), fintocSignature)
      return reply.send(result)
    } catch (err: any) {
      const status = err.message?.includes('Firma inválida') || err.message?.includes('firma') ? 401 : 400
      return reply.status(status).send({ error: err.message })
    }
  })

  // POST /payments/webhook/fintoc — webhook sin auth JWT, valida HMAC-SHA256
  app.post('/payments/webhook/fintoc', async (request, reply) => {
    const signature = request.headers['fintoc-signature'] as string | undefined
    const body = request.body as any

    // La gymId viene en el payload del webhook (Fintoc la incluye en metadata)
    const gymId: string | undefined = body?.gymId ?? body?.metadata?.gymId
    if (!gymId) return reply.status(400).send({ error: 'gymId requerido en payload' })

    // Firma obligatoria con el webhookSecret del gym: el gymId viene del body, así que
    // solo es confiable si el payload está firmado con el secret de ESE gym
    if (!signature) return reply.status(401).send({ error: 'Firma Fintoc requerida' })

    const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { paymentGateways: true } })
    const webhookSecret: string | undefined = (gym?.paymentGateways as any)?.fintoc?.webhookSecret
    if (!webhookSecret) return reply.status(401).send({ error: 'Webhook Fintoc no configurado para este gimnasio' })

    const rawBody = (request as any).rawBody as Buffer | undefined
    const bodyStr = rawBody ? rawBody.toString() : JSON.stringify(body)
    if (!isValidHmacSha256(bodyStr, webhookSecret, signature)) {
      return reply.status(401).send({ error: 'Firma Fintoc inválida' })
    }

    try {
      const movements = body?.movements ?? []
      const result = await handleFintocWebhook(gymId, movements)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
