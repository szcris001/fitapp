/**
 * Cobro Tribu-Box -> gyms (suscripción de plataforma).
 * Diseño: docs/design/gym-billing-gateways.md
 *
 * Reglas:
 *  - Monto SIEMPRE de FitAppPlan.priceCLP (servidor), nunca del cliente.
 *  - Idempotencia: transición condicional PENDING -> PAID (updateMany count===1) y solo
 *    entonces se activa la suscripción. Un reintento/webhook duplicado es no-op.
 *  - gymId siempre del JWT en rutas de gym; el superadmin activa con payment.gymId.
 *  - Nunca se guardan secretos en gatewayData (solo token/flowOrder/sandbox).
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { prisma } from '../../lib/prisma'
import { Prisma } from '../../generated/prisma'
import { HttpError } from '../../lib/http-error'
import { logger } from '../../lib/logger'
import { safeResolvePath } from '../../lib/safe-path'
import { detectImageExt } from '../../lib/image-sniff'
import { createGymSubscriptionCheckout } from '../payments/payments.service'
import {
  getBillingGatewayConfig, listEnabledBillingGateways, type BillingGatewayName, type TransferConfig,
} from './billing-config.service'

const DAY_MS = 86_400_000
export const TRANSFER_EXPIRY_DAYS = 7
// Sin timeout un Flow colgado retiene conexiones (incluido el endpoint público de confirmación)
const FLOW_TIMEOUT_MS = 15_000
const GATEWAY_LABELS: Record<BillingGatewayName, string> = {
  flow: 'Flow (tarjetas chilenas, Webpay, transferencia)',
  stripe: 'Tarjeta internacional (Stripe)',
  transfer: 'Transferencia bancaria',
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Firma Flow: HMAC-SHA256 de los params ordenados alfabéticamente (key+value concatenados). */
export function flowSign(params: Record<string, string>, secretKey: string): string {
  const toSign = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('')
  return crypto.createHmac('sha256', secretKey).update(toSign).digest('hex')
}

// Sin 0/O/1/I para que el admin no confunda caracteres al escribir la glosa
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateTransferReference(): string {
  const bytes = crypto.randomBytes(6)
  return 'TB-' + Array.from(bytes, b => REF_ALPHABET[b % REF_ALPHABET.length]).join('')
}

export { activateGymSubscriptionInTx, activateGymSubscriptionFromPayment } from './activation.service'
import { activateGymSubscriptionInTx } from './activation.service'

// ─── Pasarelas disponibles para el admin del gym ─────────────────────────────

export async function getGymBillingGateways(gymId: string) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { country: true } })
  if (!gym) throw new HttpError(404, 'Gimnasio no encontrado')
  const enabled = await listEnabledBillingGateways(gym.country)
  const gateways: Array<Record<string, unknown>> = []
  for (const gateway of enabled) {
    const entry: Record<string, unknown> = { gateway, label: GATEWAY_LABELS[gateway] }
    if (gateway === 'flow') entry.sandbox = (await getBillingGatewayConfig('flow')).sandbox
    if (gateway === 'transfer') entry.transfer = transferBankInfo(await getBillingGatewayConfig('transfer'))
    gateways.push(entry)
  }
  return { gateways }
}

// Lista blanca explícita: nunca se serializa el objeto de configuración completo
function transferBankInfo(cfg: TransferConfig) {
  return {
    bankName: cfg.bankName ?? null,
    accountType: cfg.accountType ?? null,
    accountNumber: cfg.accountNumber ?? null,
    holderName: cfg.holderName ?? null,
    holderRut: cfg.holderRut ?? null,
    contactEmail: cfg.contactEmail ?? null,
    instructions: cfg.instructions ?? null,
  }
}

// ─── Checkout ────────────────────────────────────────────────────────────────

async function loadCheckoutContext(gymId: string, planId: string, gateway: BillingGatewayName) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId } })
  if (!gym) throw new HttpError(404, 'Gimnasio no encontrado')
  const enabled = await listEnabledBillingGateways(gym.country)
  if (!enabled.includes(gateway)) throw new HttpError(400, 'Pasarela no disponible')
  const plan = await prisma.fitAppPlan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) throw new HttpError(404, 'Plan no encontrado')
  if (plan.isFree || plan.priceCLP <= 0) throw new HttpError(422, 'El plan es gratuito, no requiere pago')
  return { gym, plan }
}

export type GymCheckoutResult =
  | { type: 'redirect'; url: string; paymentId: string }
  | { type: 'transfer'; paymentId: string; reference: string; amountCLP: number; bank: ReturnType<typeof transferBankInfo> }

export async function createGymCheckout(
  gymId: string, userId: string, input: { planId: string; gateway: BillingGatewayName },
): Promise<GymCheckoutResult> {
  const { gym, plan } = await loadCheckoutContext(gymId, input.planId, input.gateway)

  if (input.gateway === 'stripe') {
    const r = await createGymSubscriptionCheckout(gymId, plan.id)
    return { type: 'redirect', url: r.checkoutUrl as string, paymentId: r.paymentId }
  }
  if (input.gateway === 'transfer') return createTransferCheckout(gym.id, plan)
  return createFlowCheckout(gym, plan, userId)
}

async function createFlowCheckout(
  gym: { id: string; country: string; ownerEmail: string | null },
  plan: { id: string; name: string; priceCLP: number },
  userId: string,
): Promise<GymCheckoutResult> {
  const cfg = await getBillingGatewayConfig('flow')
  if (!cfg.enabled || !cfg.apiKey || !cfg.secretKey) throw new HttpError(400, 'Pasarela no disponible')
  const user = await prisma.user.findFirst({ where: { id: userId, gymId: gym.id }, select: { email: true } })
  const email = gym.ownerEmail ?? user?.email
  if (!email) throw new HttpError(422, 'El gimnasio no tiene un email de contacto')

  const paymentId = crypto.randomUUID()
  const commerceOrder = `SUB-${paymentId}`
  await prisma.gymSubscriptionPayment.create({
    data: {
      id: paymentId, gymId: gym.id, planId: plan.id, amount: plan.priceCLP, currency: 'CLP',
      country: gym.country, gateway: 'flow', gatewayOrderId: commerceOrder, reference: commerceOrder,
      gatewayData: { sandbox: cfg.sandbox }, status: 'PENDING',
    },
  })

  const apiBase = process.env.PUBLIC_API_URL || 'http://localhost:3001'
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000'
  const params: Record<string, string> = {
    apiKey: cfg.apiKey,
    commerceOrder,
    subject: `Suscripción FitApp ${plan.name}`,
    currency: 'CLP',
    amount: String(plan.priceCLP),
    email,
    paymentMethod: '9',
    urlConfirmation: `${apiBase}/api/gym-billing/flow/confirm`,
    urlReturn: `${frontend}/dashboard/subscription?payment=${paymentId}`,
  }
  const body = new URLSearchParams({ ...params, s: flowSign(params, cfg.secretKey) })

  const failPayment = async (reason: string) => {
    await prisma.gymSubscriptionPayment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'FAILED', rejectionReason: reason },
    })
  }

  let data: any
  try {
    const res = await fetch(`${cfg.apiUrl}/payment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
    })
    data = await res.json()
  } catch (err) {
    logger.error({ err, paymentId }, '[gym-billing] Flow payment/create falló')
    await failPayment('Flow no respondió')
    throw new HttpError(502, 'No se pudo contactar a Flow')
  }
  if (!data?.token || !data?.url) {
    logger.error({ paymentId, flowCode: data?.code }, '[gym-billing] Flow rechazó payment/create')
    await failPayment('Flow rechazó la orden')
    throw new HttpError(502, 'Flow no pudo crear la orden de pago')
  }

  await prisma.gymSubscriptionPayment.updateMany({
    where: { id: paymentId, gymId: gym.id },
    data: { gatewayData: { token: String(data.token), flowOrder: data.flowOrder ?? null, sandbox: cfg.sandbox } },
  })
  return { type: 'redirect', url: `${data.url}?token=${data.token}`, paymentId }
}

async function createTransferCheckout(gymId: string, plan: { id: string; priceCLP: number }): Promise<GymCheckoutResult> {
  const cfg = await getBillingGatewayConfig('transfer')
  const bank = transferBankInfo(cfg)

  // Lock advisory por gym+plan: doble clic / retry no debe crear dos transferencias pendientes
  // (mismo patrón que submitTransferReceipt). Colisión del código de referencia (P2002):
  // improbable; se reintenta la transacción completa con otro código.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const payment = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'gymtransfer:' + gymId + ':' + plan.id}))`
        const existing = await tx.gymSubscriptionPayment.findFirst({
          where: { gymId, planId: plan.id, gateway: 'transfer', status: 'PENDING', receiptUrl: null, amount: plan.priceCLP },
          orderBy: { createdAt: 'desc' },
        })
        if (existing) return existing
        const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId }, select: { country: true } })
        const reference = generateTransferReference()
        return tx.gymSubscriptionPayment.create({
          data: {
            gymId, planId: plan.id, amount: plan.priceCLP, currency: 'CLP', country: gym.country,
            gateway: 'transfer', gatewayOrderId: reference, reference, status: 'PENDING',
          },
        })
      })
      return { type: 'transfer', paymentId: payment.id, reference: payment.reference!, amountCLP: payment.amount, bank }
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    }
  }
  throw new HttpError(500, 'No se pudo generar la referencia de transferencia')
}

// ─── Comprobante de transferencia ────────────────────────────────────────────

function detectReceiptExt(buf: Buffer): string | null {
  const img = detectImageExt(buf)
  if (img) return img
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return '.pdf'
  return null
}

export async function saveTransferReceipt(gymId: string, paymentId: string, buf: Buffer) {
  // findFirst con gymId: un pago de otro gym responde igual que uno inexistente (404)
  const payment = await prisma.gymSubscriptionPayment.findFirst({ where: { id: paymentId, gymId, gateway: 'transfer' } })
  if (!payment) throw new HttpError(404, 'Pago no encontrado')
  if (payment.status !== 'PENDING') throw new HttpError(409, 'El pago ya no está pendiente')

  const ext = detectReceiptExt(buf)
  if (!ext) throw new HttpError(415, 'Formato no permitido (JPG, PNG, WEBP o PDF)')

  const dir = path.resolve(process.cwd(), 'uploads', 'gym-billing', gymId)
  const filename = `${paymentId}-${crypto.randomBytes(6).toString('hex')}${ext}`
  const filepath = safeResolvePath(dir, filename)
  if (!filepath) throw new HttpError(400, 'Nombre de archivo inválido')
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(filepath, buf)

  const receiptUrl = `/uploads/gym-billing/${gymId}/${filename}`
  const updated = await prisma.gymSubscriptionPayment.updateMany({
    where: { id: paymentId, gymId, gateway: 'transfer', status: 'PENDING' },
    data: { receiptUrl },
  })
  if (updated.count !== 1) {
    await fs.promises.unlink(filepath).catch(() => {})
    throw new HttpError(409, 'El pago ya no está pendiente')
  }
  // Reemplazo: borrar el comprobante anterior (best effort)
  if (payment.receiptUrl) {
    const old = safeResolvePath(dir, path.basename(payment.receiptUrl))
    if (old) await fs.promises.unlink(old).catch(() => {})
  }
  return { paymentId, status: 'PENDING' as const, receiptUrl }
}

// ─── Confirmar / rechazar transferencia (SUPER_ADMIN) ────────────────────────

async function assertTransferPending(paymentId: string) {
  const p = await prisma.gymSubscriptionPayment.findUnique({ where: { id: paymentId }, select: { gateway: true } })
  if (!p) throw new HttpError(404, 'Pago no encontrado')
  if (p.gateway !== 'transfer') throw new HttpError(409, 'Solo se pueden confirmar o rechazar transferencias')
  throw new HttpError(409, 'El pago ya no está pendiente')
}

export async function confirmGymTransfer(paymentId: string, superAdminId: string, notes?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.gymSubscriptionPayment.updateMany({
      where: { id: paymentId, gateway: 'transfer', status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date(), confirmedById: superAdminId, confirmedAt: new Date(), ...(notes ? { notes } : {}) },
    })
    if (claim.count !== 1) return null
    await activateGymSubscriptionInTx(tx, paymentId)
    return tx.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })
  })
  if (!result) return assertTransferPending(paymentId)
  logger.info({ paymentId, userId: superAdminId, action: 'gym-transfer.confirm' }, '[gym-billing] transferencia confirmada')
  return result
}

export async function rejectGymTransfer(paymentId: string, superAdminId: string, reason: string) {
  const claim = await prisma.gymSubscriptionPayment.updateMany({
    where: { id: paymentId, gateway: 'transfer', status: 'PENDING' },
    data: { status: 'FAILED', rejectionReason: reason, confirmedById: superAdminId, confirmedAt: new Date() },
  })
  if (claim.count !== 1) return assertTransferPending(paymentId)
  logger.info({ paymentId, userId: superAdminId, action: 'gym-transfer.reject' }, '[gym-billing] transferencia rechazada')
  return prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })
}

/** Cron: transferencias PENDING sin comprobante con más de 7 días -> FAILED. */
export async function expireStaleTransferPayments(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRANSFER_EXPIRY_DAYS * DAY_MS)
  const r = await prisma.gymSubscriptionPayment.updateMany({
    where: { gateway: 'transfer', status: 'PENDING', receiptUrl: null, createdAt: { lt: cutoff } },
    data: { status: 'FAILED', rejectionReason: `Expirada: sin comprobante en ${TRANSFER_EXPIRY_DAYS} días` },
  })
  return r.count
}

// ─── Pago manual / reembolso (SUPER_ADMIN) ───────────────────────────────────

export async function registerManualGymPayment(
  input: { gymId: string; planId: string; amount: number; currency: string; notes?: string; paidAt?: string },
  superAdminId: string,
) {
  const [gym, plan] = await Promise.all([
    prisma.gym.findUnique({ where: { id: input.gymId }, select: { country: true } }),
    prisma.fitAppPlan.findUnique({ where: { id: input.planId }, select: { id: true } }),
  ])
  if (!gym) throw new HttpError(404, 'Gimnasio no encontrado')
  if (!plan) throw new HttpError(404, 'Plan no encontrado')
  return prisma.$transaction(async (tx) => {
    const payment = await tx.gymSubscriptionPayment.create({
      data: {
        gymId: input.gymId, planId: input.planId, amount: input.amount, currency: input.currency,
        notes: input.notes, gateway: 'manual', status: 'PAID', country: gym.country,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        confirmedById: superAdminId, confirmedAt: new Date(),
      },
    })
    await activateGymSubscriptionInTx(tx, payment.id)
    return tx.gymSubscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id }, include: { gym: { select: { id: true, name: true } } },
    })
  })
}

export async function refundGymPayment(paymentId: string) {
  const claim = await prisma.gymSubscriptionPayment.updateMany({
    where: { id: paymentId, status: 'PAID' },
    data: { status: 'REFUNDED' },
  })
  if (claim.count !== 1) {
    const exists = await prisma.gymSubscriptionPayment.findUnique({ where: { id: paymentId }, select: { id: true } })
    throw exists ? new HttpError(409, 'Solo se pueden reembolsar pagos aprobados') : new HttpError(404, 'Pago no encontrado')
  }
  return prisma.gymSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } })
}

// ─── Flow: confirmación server-to-server ─────────────────────────────────────

/**
 * Nunca confía en el body: con el token consulta payment/getStatus firmado y valida
 * estado, commerceOrder, monto y moneda contra el pago guardado. Tokens desconocidos
 * o respuestas inconsistentes son no-op (200 para que Flow no reintente en vano).
 * Si Flow no responde lanza 502 para que Flow reintente.
 */
export async function handleGymFlowConfirm(token: string): Promise<{ ok: true; activated: boolean }> {
  const payment = await prisma.gymSubscriptionPayment.findFirst({
    where: { gateway: 'flow', gatewayData: { path: ['token'], equals: token } },
  })
  if (!payment) return { ok: true, activated: false }
  if (payment.status !== 'PENDING') return { ok: true, activated: false } // reintento / duplicado

  const cfg = await getBillingGatewayConfig('flow')
  if (!cfg.apiKey || !cfg.secretKey) {
    logger.error('[gym-billing] Flow confirm sin credenciales configuradas')
    throw new HttpError(503, 'Flow no configurado')
  }
  // Credenciales según el entorno con el que se creó la orden (no el de hoy)
  const orderSandbox = (payment.gatewayData as { sandbox?: boolean } | null)?.sandbox
  const apiUrl = orderSandbox === undefined || orderSandbox === cfg.sandbox
    ? cfg.apiUrl
    : (orderSandbox ? 'https://sandbox.flow.cl/api' : 'https://www.flow.cl/api')

  const params = { apiKey: cfg.apiKey, token }
  let data: any
  try {
    const qs = new URLSearchParams({ ...params, s: flowSign(params, cfg.secretKey) })
    const res = await fetch(`${apiUrl}/payment/getStatus?${qs}`, { signal: AbortSignal.timeout(FLOW_TIMEOUT_MS) })
    data = await res.json()
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, '[gym-billing] Flow getStatus falló')
    throw new HttpError(502, 'No se pudo consultar a Flow')
  }

  if (Number(data?.status) !== 2) return { ok: true, activated: false }
  if (data.commerceOrder !== payment.gatewayOrderId
    || Number(data.amount) !== payment.amount
    || data.currency !== 'CLP') {
    logger.warn({ paymentId: payment.id }, '[gym-billing] Flow confirm: orden/monto/moneda no coinciden, ignorado')
    return { ok: true, activated: false }
  }

  const activated = await prisma.$transaction(async (tx) => {
    const claim = await tx.gymSubscriptionPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: 'PAID', paidAt: new Date(),
        gatewayData: { token, flowOrder: data.flowOrder ?? null, sandbox: orderSandbox ?? cfg.sandbox },
      },
    })
    if (claim.count !== 1) return false
    await activateGymSubscriptionInTx(tx, payment.id)
    return true
  })
  return { ok: true, activated }
}

// ─── Historial de pagos del gym ──────────────────────────────────────────────

export async function listGymSubscriptionPayments(gymId: string) {
  const rows = await prisma.gymSubscriptionPayment.findMany({
    where: { gymId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, planId: true, amount: true, currency: true, gateway: true, status: true,
      reference: true, rejectionReason: true, createdAt: true, receiptUrl: true,
    },
  })
  return {
    payments: rows.map(({ receiptUrl, ...p }) => ({ ...p, hasReceipt: !!receiptUrl })),
  }
}
