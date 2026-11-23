import { FastifyInstance, FastifyReply } from 'fastify'
import { requireAdmin, requireSuperAdmin } from '../../middlewares/auth.middleware'
import { HttpError } from '../../lib/http-error'
import { logger } from '../../lib/logger'
import { BILLING_PUBLIC_FIELDS, mergeGateways } from '../../lib/secrets'
import {
  FLOW_REQUIRED, TRANSFER_REQUIRED, getBillingGatewaysView, readBillingGateways, writeBillingGateways,
} from './billing-config.service'
import {
  createGymCheckout, getGymBillingGateways, handleGymFlowConfirm, listGymSubscriptionPayments, saveTransferReceipt,
} from './gym-billing.service'
import {
  flowConfirmSchema, gymCheckoutSchema, paymentIdParamSchema, updateBillingGatewaysSchema,
} from './gym-billing.schema'

export function sendBillingError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message })
  // Nunca se devuelve el mensaje crudo (Prisma, rutas del server): solo al log
  logger.error({ err }, '[gym-billing] error inesperado')
  return reply.status(500).send({ error: 'Error interno del servidor' })
}

const REQUIRED_BY_GATEWAY: Record<string, readonly string[]> = { flow: FLOW_REQUIRED, transfer: TRANSFER_REQUIRED }

export async function gymBillingRoutes(app: FastifyInstance) {
  // Flow confirma por POST application/x-www-form-urlencoded; Fastify no trae ese parser
  // (@fastify/formbody no está instalado). Encapsulado a este plugin, igual que payments.routes.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body: string, done) => {
    try {
      const parsed: Record<string, string> = {}
      for (const [k, v] of new URLSearchParams(body)) parsed[k] = v
      done(null, parsed)
    } catch (err) { done(err as Error, undefined) }
  })

  // ─── SUPER_ADMIN: configuración de pasarelas de cobro ──────────────────────

  app.get('/superadmin/billing-gateways', { preHandler: requireSuperAdmin }, async (_req, reply) => {
    try { return reply.send(await getBillingGatewaysView()) } catch (err) { return sendBillingError(reply, err) }
  })

  app.put('/superadmin/billing-gateways', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = updateBillingGatewaysSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      const stored = await readBillingGateways({ fresh: true })
      const incoming = parsed.data as Record<string, Record<string, unknown>>
      const merged = mergeGateways(stored, incoming, BILLING_PUBLIC_FIELDS)

      const missing: string[] = []
      for (const name of Object.keys(incoming)) {
        const cfg = (merged[name] ??= {})
        cfg.enabled = cfg.enabled === true
        if (name === 'flow' && cfg.sandbox === undefined) cfg.sandbox = true
        if (cfg.enabled) {
          for (const f of REQUIRED_BY_GATEWAY[name] ?? []) {
            if (typeof cfg[f] !== 'string' || cfg[f] === '') missing.push(`${name}.${f}`)
          }
        }
      }
      if (missing.length) {
        return reply.status(422).send({ error: 'Faltan credenciales para habilitar la pasarela', missing })
      }

      await writeBillingGateways(merged)
      // Auditoría: quién y qué campos, jamás los valores
      logger.info({
        action: 'billing-gateways.update', userId: (request.user as any).userId,
        gateways: Object.fromEntries(Object.entries(incoming).map(([n, c]) => [n, Object.keys(c)])),
      }, '[gym-billing] configuración de pasarelas actualizada')
      return reply.send(await getBillingGatewaysView())
    } catch (err) { return sendBillingError(reply, err) }
  })

  // ─── Admin del gym ─────────────────────────────────────────────────────────

  app.get('/gyms/me/billing/gateways', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    if (!user.gymId) return reply.status(400).send({ error: 'Sin gimnasio asociado' })
    try { return reply.send(await getGymBillingGateways(user.gymId)) } catch (err) { return sendBillingError(reply, err) }
  })

  app.post('/gyms/me/subscription/checkout', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = request.user as any
    if (!user.gymId) return reply.status(400).send({ error: 'Sin gimnasio asociado' })
    const parsed = gymCheckoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try { return reply.send(await createGymCheckout(user.gymId, user.userId, parsed.data)) }
    catch (err) { return sendBillingError(reply, err) }
  })

  app.get('/gyms/me/subscription/payments', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    if (!user.gymId) return reply.status(400).send({ error: 'Sin gimnasio asociado' })
    try { return reply.send(await listGymSubscriptionPayments(user.gymId)) } catch (err) { return sendBillingError(reply, err) }
  })

  app.post('/gyms/me/subscription/payments/:paymentId/receipt', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = request.user as any
    if (!user.gymId) return reply.status(400).send({ error: 'Sin gimnasio asociado' })
    const params = paymentIdParamSchema.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Datos inválidos' })

    let buf: Buffer
    try {
      const file = await (request as any).file()
      if (!file) return reply.status(400).send({ error: 'No se recibió archivo' })
      buf = await file.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: 'El archivo supera 5 MB' })
      return reply.status(400).send({ error: 'No se recibió archivo' })
    }
    try { return reply.send(await saveTransferReceipt(user.gymId, params.data.paymentId, buf)) }
    catch (err) { return sendBillingError(reply, err) }
  })

  // ─── Público server-to-server: confirmación de Flow ────────────────────────
  // El alias /superadmin/gym-payments/flow/confirm existe hasta ~2026-12-06: las órdenes
  // Flow creadas por /flow/create llevan esa urlConfirmation. Luego eliminarlo.
  const flowConfirmHandler = async (request: any, reply: FastifyReply) => {
    const parsed = flowConfirmSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Token requerido' })
    try { return reply.send(await handleGymFlowConfirm(parsed.data.token)) }
    catch (err) { return sendBillingError(reply, err) }
  }
  const flowConfirmOpts = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }
  app.post('/gym-billing/flow/confirm', flowConfirmOpts, flowConfirmHandler)
  app.post('/superadmin/gym-payments/flow/confirm', flowConfirmOpts, flowConfirmHandler)
}
