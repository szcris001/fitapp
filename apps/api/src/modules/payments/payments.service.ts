import Stripe from 'stripe'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import * as mpClient from '../../lib/mp-client'
import { emitirDTE, DteInput } from '../../lib/dte'
import { sendPaymentConfirmation } from '../../lib/email'
import { MEMBERSHIP_DAYS } from '../../lib/membership'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover',
})

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getGym(gymId: string) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId } })
  if (!gym) throw new Error('Gimnasio no encontrado')
  return gym
}

async function getPlan(planId: string, gymId: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, gymId } })
  if (!plan) throw new Error('Plan no encontrado')
  return plan
}

async function getUser(userId: string, gymId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')
  return user
}

async function activateMembership(userId: string, planId: string, paymentMethod: string, extraData?: Record<string, any>) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error('Plan no encontrado')

  // Si tiene membresía vigente, extender desde su vencimiento (no desde hoy)
  const existing = await prisma.membership.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'desc' },
  })

  const startsAt = existing ? existing.endsAt : new Date()
  const endsAt = new Date(startsAt)
  endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS)

  await prisma.membership.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
    data: { status: 'INACTIVE' },
  })

  return prisma.membership.create({
    data: {
      userId, planId,
      status: 'ACTIVE',
      startsAt, endsAt,
      pricePaid: plan.priceCents,
      currency: plan.currency,
      paidAt: new Date(),
      paymentMethod,
      ...extraData,
    },
  })
}

// ─── Gateway config helpers ──────────────────────────────────────────────────

export async function getEnabledGateways(gymId: string): Promise<string[]> {
  const gym = await getGym(gymId)
  const gateways = (gym.paymentGateways as Record<string, any>) || {}
  return Object.entries(gateways)
    .filter(([, cfg]) => cfg?.enabled)
    .map(([id]) => id)
}

function gatewayConfig(gym: any, gateway: string) {
  const gateways = (gym.paymentGateways as Record<string, any>) || {}
  const cfg = gateways[gateway]
  if (!cfg?.enabled) throw new Error(`Pasarela ${gateway} no configurada o deshabilitada`)
  return cfg
}

// ─── Checkouts de pasarela (Flow, Khipu, PayU, Kushki, OpenPay) ─────────────
// El checkout se guarda en el servidor al crearlo; el callback lo resuelve por la
// referencia de la pasarela. gymId/planId/userId nunca se toman de la URL del
// callback: con ellos, un pago válido podía activar otro plan u otro usuario.

type CheckoutGateway = 'flow' | 'khipu' | 'payu' | 'kushki' | 'openpay'

async function recordCheckout(
  gateway: CheckoutGateway, externalRef: string, gymId: string, userId: string,
  plan: { id: string; priceCents: number; currency: string },
) {
  await prisma.paymentCheckout.create({
    data: { gateway, externalRef, gymId, userId, planId: plan.id, amountCents: plan.priceCents, currency: plan.currency },
  })
}

async function findCheckout(gateway: CheckoutGateway, externalRef: unknown) {
  if (typeof externalRef !== 'string' || !externalRef) throw new Error('Referencia de pago faltante')
  const checkout = await prisma.paymentCheckout.findUnique({
    where: { gateway_externalRef: { gateway, externalRef } },
  })
  if (!checkout) throw new Error('Checkout no encontrado')
  return checkout
}

// Si la pasarela informa el monto pagado, debe coincidir con el del checkout
function assertPaidAmount(checkout: { amountCents: number }, paidMajorUnits: unknown) {
  if (paidMajorUnits === undefined || paidMajorUnits === null || paidMajorUnits === '') return
  const paid = Number(paidMajorUnits)
  if (!Number.isFinite(paid) || Math.abs(paid - checkout.amountCents / 100) >= 1) {
    throw new Error('El monto pagado no coincide con el checkout')
  }
}

type Checkout = Awaited<ReturnType<typeof findCheckout>>

// Activa la membresía del checkout una sola vez (el pago ya se verificó con la pasarela)
async function completeCheckout(checkout: Checkout, paymentMethod: CheckoutGateway, paymentNotes: string) {
  if (checkout.membershipId) return { received: true, membershipId: checkout.membershipId }

  // Reclamo atómico: dos callbacks simultáneos no activan dos membresías
  const claimed = await prisma.paymentCheckout.updateMany({
    where: { id: checkout.id, completedAt: null },
    data: { completedAt: new Date() },
  })
  if (claimed.count === 0) {
    const current = await prisma.paymentCheckout.findUnique({ where: { id: checkout.id } })
    return { received: true, membershipId: current?.membershipId ?? null }
  }

  let membership
  try {
    membership = await activateMembership(checkout.userId, checkout.planId, paymentMethod, { paymentNotes })
    await prisma.paymentCheckout.update({ where: { id: checkout.id }, data: { membershipId: membership.id } })
  } catch (err) {
    // Liberar el reclamo para que la pasarela pueda reintentar el callback
    await prisma.paymentCheckout.update({ where: { id: checkout.id }, data: { completedAt: null } })
    throw err
  }

  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: checkout.userId } }),
    prisma.plan.findUnique({ where: { id: checkout.planId } }),
  ])
  if (user && plan) {
    sendPaymentConfirmation(checkout.gymId, {
      memberName: user.name, memberEmail: user.email, planName: plan.name,
      amount: plan.priceCents, currency: plan.currency, paymentMethod, endsAt: membership.endsAt,
    }).catch(() => {})
  }
  return { received: true, membershipId: membership.id }
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

export async function createCheckoutSession(gymId: string, planId: string, userId: string) {
  const plan = await getPlan(planId, gymId)
  const user = await getUser(userId, gymId)

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: plan.currency.toLowerCase(),
        product_data: { name: plan.name, description: `Membresía ${MEMBERSHIP_DAYS} días — ${plan.name}` },
        unit_amount: plan.priceCents,
      },
      quantity: 1,
    }],
    metadata: { gymId, planId, userId },
    success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment/cancelled`,
  })

  return { url: session.url, sessionId: session.id }
}

export async function createSelfCheckout(userId: string, planId: string, autoRenew = false) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.gymId) throw new Error('Usuario no encontrado')

  const plan = await prisma.plan.findFirst({ where: { id: planId, gymId: user.gymId, isActive: true } })
  if (!plan) throw new Error('Plan no encontrado')

  // If auto-renewal requested, ensure we have a Stripe customer to attach methods to
  let customerId = user.stripeCustomerId || undefined
  if (autoRenew && !customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.name })
    customerId = customer.id
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    mode: 'payment',
    customer: customerId,
    customer_email: customerId ? undefined : user.email,
    line_items: [{
      price_data: {
        currency: plan.currency.toLowerCase(),
        product_data: { name: plan.name, description: `Membresía ${MEMBERSHIP_DAYS} días` },
        unit_amount: plan.priceCents,
      },
      quantity: 1,
    }],
    metadata: { gymId: user.gymId, planId, userId, autoRenew: autoRenew ? '1' : '0' },
    success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment/cancelled`,
  }

  if (autoRenew && plan.autoRenewEnabled) {
    sessionParams.payment_intent_data = { setup_future_usage: 'off_session' }
  }

  const session = await stripe.checkout.sessions.create(sessionParams)
  return { url: session.url, sessionId: session.id }
}

export async function handleStripeWebhook(payload: Buffer, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch {
    throw new Error('Webhook signature inválida')
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { type, gymId, planId, userId, subscriptionId } = session.metadata || {}

    // Pago de suscripción de plataforma (gym paga a FitApp)
    if (type === 'gym_subscription') {
      if (!gymId || !planId || !subscriptionId) return { received: true }
      await activateGymSubscriptionFromStripe(gymId, subscriptionId, planId, session.id)
      return { received: true, type: 'gym_subscription', gymId }
    }

    // Pago de membresía de alumno (miembro paga al gym)
    if (!gymId || !planId || !userId) return { received: true }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) return { received: true }

    const user = await prisma.user.findUnique({ where: { id: userId } })

    // Extract saved payment method if auto-renewal was requested
    let stripePaymentMethodId: string | undefined
    const wantsAutoRenew = session.metadata?.autoRenew === '1' && plan.autoRenewEnabled
    if (wantsAutoRenew && session.payment_intent) {
      try {
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string)
        if (typeof pi.payment_method === 'string') {
          stripePaymentMethodId = pi.payment_method
        }
      } catch { /* non-critical */ }
    }

    const nextAutoRenewAt = wantsAutoRenew && plan.autoRenewDaysBefore
      ? (() => {
          const d = new Date()
          d.setDate(d.getDate() + MEMBERSHIP_DAYS - plan.autoRenewDaysBefore)
          return d
        })()
      : undefined

    const membership = await activateMembership(userId, planId, 'stripe', {
      autoRenew: wantsAutoRenew,
      autoRenewConsent: wantsAutoRenew,
      stripePaymentMethodId: stripePaymentMethodId ?? null,
      nextAutoRenewAt: nextAutoRenewAt ?? null,
    })

    if (user) {
      sendPaymentConfirmation(gymId, {
        memberName: user.name, memberEmail: user.email, planName: plan.name,
        amount: plan.priceCents, currency: plan.currency, paymentMethod: 'stripe', endsAt: membership.endsAt,
      }).catch(err => console.error('[Email] Stripe:', err))
    }

    return { received: true, membershipId: membership.id }
  }

  return { received: true }
}

// ─── Auto-renewal ─────────────────────────────────────────────────────────────

export async function chargeAutoRenewMembership(membership: any): Promise<void> {
  const { id, userId, planId, stripePaymentMethodId } = membership
  if (!stripePaymentMethodId) throw new Error('Sin método de pago guardado')

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.stripeCustomerId) throw new Error('Usuario sin customer Stripe')

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error('Plan no encontrado')

  const pi = await stripe.paymentIntents.create({
    amount: plan.priceCents,
    currency: plan.currency.toLowerCase(),
    customer: user.stripeCustomerId,
    payment_method: stripePaymentMethodId,
    off_session: true,
    confirm: true,
    description: `Auto-renovación: ${plan.name}`,
    metadata: { membershipId: id, userId, planId, gymId: user.gymId ?? '' },
  })

  if (pi.status !== 'succeeded') {
    throw new Error(`PaymentIntent status: ${pi.status}`)
  }

  // Activate new membership with auto-renewal carried forward
  const autoRenewDaysBefore = plan.autoRenewDaysBefore
  const newMembership = await activateMembership(userId, planId, 'stripe_auto', {
    autoRenew: true,
    autoRenewConsent: true,
    stripePaymentMethodId,
  })

  const nextAutoRenewAt = new Date(newMembership.endsAt)
  nextAutoRenewAt.setDate(nextAutoRenewAt.getDate() - autoRenewDaysBefore)
  await prisma.membership.update({
    where: { id: newMembership.id },
    data: { nextAutoRenewAt },
  })

  if (user) {
    sendPaymentConfirmation(user.gymId ?? '', {
      memberName: user.name, memberEmail: user.email, planName: plan.name,
      amount: plan.priceCents, currency: plan.currency, paymentMethod: 'auto-renovación', endsAt: newMembership.endsAt,
    }).catch(err => console.error('[Email] AutoRenew:', err))
  }
}

// ─── Mercado Pago ─────────────────────────────────────────────────────────────

export async function createMercadoPagoCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'mercadopago')

  // gymId en la URL: el webhook consulta solo las credenciales de este gym (el pago se
  // valida igual contra MP y external_reference, así que un gymId falso no sirve)
  const notificationUrl = `${process.env.BACKEND_URL || process.env.PUBLIC_API_URL || 'http://localhost:3001'}/api/payments/webhook/mercadopago?gymId=${gymId}`
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const isLocalhost = frontendUrl.includes('localhost')

  const preference = await mpClient.createMPPreference(cfg.accessToken, {
    items: [{
      id: planId,
      title: plan.name,
      description: `Membresía ${MEMBERSHIP_DAYS} días`,
      quantity: 1,
      // CLP has no subunits — store value is already in the base currency unit
      unit_price: plan.currency.toUpperCase() === 'CLP' ? plan.priceCents : plan.priceCents / 100,
      currency_id: plan.currency.toUpperCase(),
    }],
    payer: {
      email: cfg.sandbox ? (process.env.MP_TEST_BUYER_EMAIL || user.email) : user.email,
      ...(cfg.sandbox ? {
        identification: { type: 'RUT', number: '12345678' },
      } : {}),
    },
    external_reference: `${gymId}|${planId}|${userId}`,
    back_urls: {
      success: `${frontendUrl}/payment/success`,
      failure: `${frontendUrl}/payment/cancelled`,
      pending: `${frontendUrl}/payment/pending`,
    },
    ...(!isLocalhost ? { auto_return: 'approved' as const } : {}),
    notification_url: notificationUrl,
  })

  const url = cfg.sandbox ? preference.sandbox_init_point : preference.init_point
  return { url, preferenceId: preference.id }
}

/**
 * Valida la firma entrante de Mercado Pago.
 * Header x-signature: "ts=<timestamp>,v1=<hash>"
 * La cadena firmada es: "id:<notification_id>;request-id:<x-request-id>;ts:<timestamp>"
 * usando HMAC-SHA256 con el webhookSecret del gym (o MERCADOPAGO_WEBHOOK_SECRET global).
 *
 * Lanza error si la firma es inválida. Si no hay firma ni secret configurado,
 * no rechaza (flujo sin secret configurado por el gym).
 */
export function validateMercadoPagoSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  notificationId: string | undefined,
  webhookSecret: string | undefined,
): void {
  // Sin secret configurado → no podemos verificar, pasamos
  if (!webhookSecret) return

  // Si hay secret pero no hay firma → rechazar
  if (!xSignature) throw new Error('Falta header x-signature de Mercado Pago')

  // Parsear: "ts=1234,v1=abcd"
  const tsMatch = xSignature.match(/ts=([^,]+)/)
  const v1Match = xSignature.match(/v1=([^,]+)/)
  if (!tsMatch || !v1Match) throw new Error('Formato de x-signature de Mercado Pago inválido')

  const ts = tsMatch[1]
  const receivedHash = v1Match[1]

  // Construir el string a firmar según documentación oficial de MP
  const parts: string[] = []
  if (notificationId) parts.push(`id:${notificationId}`)
  if (xRequestId) parts.push(`request-id:${xRequestId}`)
  parts.push(`ts:${ts}`)
  const template = parts.join(';')

  const expected = crypto.createHmac('sha256', webhookSecret).update(template).digest('hex')
  if (receivedHash !== expected) throw new Error('Firma Mercado Pago inválida')
}

export async function handleMercadoPagoWebhook(
  body: any,
  xSignature?: string,
  xRequestId?: string,
  query?: any,
) {
  // MP sends two formats:
  // New (Notifications API): { action: "payment.updated", data: { id: "123" } }
  // Old (IPN): query params topic=payment&id=<paymentId> or topic=merchant_order&id=<orderId>
  let paymentId: string | undefined

  // Gyms cuyas credenciales se prueban: solo el de la notification_url si viene gymId;
  // notificaciones de checkouts anteriores (sin gymId) recorren todos los gyms con MP
  const gymFilter = typeof query?.gymId === 'string' && query.gymId ? { id: query.gymId } : {}
  const candidates = (await prisma.gym.findMany({
    where: { ...gymFilter, paymentGateways: { not: {} } },
    select: { id: true, paymentGateways: true },
  })).filter(g => (g.paymentGateways as any)?.mercadopago?.enabled && (g.paymentGateways as any)?.mercadopago?.accessToken)

  if (body.action === 'payment.created' || body.action === 'payment.updated') {
    paymentId = body.data?.id
  } else if (query?.topic === 'payment' && query?.id) {
    paymentId = query.id
  } else if (query?.topic === 'merchant_order' && query?.id) {
    // Fetch the merchant order to get the payment IDs
    try {
      for (const gym of candidates) {
        const cfg = (gym.paymentGateways as any).mercadopago
        const res = await fetch(`https://api.mercadopago.com/merchant_orders/${query.id}`, {
          headers: { 'Authorization': `Bearer ${cfg.accessToken}` },
        })
        if (!res.ok) continue
        const order = await res.json() as any
        const approved = order.payments?.find((p: any) => p.status === 'approved')
        if (approved) { paymentId = String(approved.id); break }
      }
    } catch (err) {
      console.error('[MP Webhook] merchant_order lookup error', err)
    }
  }

  if (!paymentId) return { received: true }

  // Find which gym this belongs to by looking up the payment from MP
  // We need the access token — we'll look it up from the external_reference
  // For now, we'll handle this by checking all gyms (or storing gym in metadata)
  // In production, use a signing secret per gym

  // Validate MP signature with global secret if configured (per-gym check happens below)
  const globalMpSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (globalMpSecret && xSignature) {
    validateMercadoPagoSignature(xSignature, xRequestId, String(paymentId), globalMpSecret)
  }

  try {
    // We get the payment details from the notification URL gymId param
    // The external_reference format is "gymId|planId|userId"
    for (const gym of candidates) {
      const cfg = (gym.paymentGateways as any).mercadopago

      // Validar firma con el webhookSecret por gym si está configurado
      if (!globalMpSecret && cfg.webhookSecret && xSignature) {
        try {
          validateMercadoPagoSignature(xSignature, xRequestId, String(paymentId), cfg.webhookSecret)
        } catch {
          continue // la firma no coincide con este gym, probar el siguiente
        }
      }

      let payment: any
      try {
        payment = await mpClient.getMPPayment(cfg.accessToken, paymentId)
      } catch {
        continue
      }

      if (!payment || payment.status !== 'approved') continue

      const ref: string = payment.external_reference || ''
      const [gymId, planId, userId] = ref.split('|')
      if (!gymId || !planId || !userId || gymId !== gym.id) continue

      const plan = await prisma.plan.findUnique({ where: { id: planId } })
      if (!plan) continue

      // Check if membership already created
      const existing = await prisma.membership.findFirst({
        where: { userId, paymentNotes: `mp:${paymentId}` },
      })
      if (existing) return { received: true }

      const membership = await activateMembership(userId, planId, 'mercadopago', {
        paymentNotes: `mp:${paymentId}`,
      })

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (user) {
        const endsAt = new Date(); endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS)
        sendPaymentConfirmation(gymId, {
          memberName: user.name, memberEmail: user.email, planName: plan.name,
          amount: plan.priceCents, currency: plan.currency, paymentMethod: 'mercadopago', endsAt,
        }).catch(() => {})
      }

      return { received: true, membershipId: membership.id }
    }
  } catch (err) {
    console.error('[MP Webhook]', err)
  }

  return { received: true }
}

// ─── Flow (Chile) ─────────────────────────────────────────────────────────────

function flowSign(params: Record<string, string>, secretKey: string): string {
  const keys = Object.keys(params).sort()
  const str = keys.map(k => k + params[k]).join('')
  return crypto.createHmac('sha256', secretKey).update(str).digest('hex')
}

export async function createFlowCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'flow')

  const commerceOrder = `${gymId.slice(0, 8)}-${Date.now()}`
  const baseUrl = cfg.sandbox
    ? 'https://sandbox.flow.cl/api'
    : 'https://www.flow.cl/api'

  const params: Record<string, string> = {
    apiKey: cfg.apiKey,
    commerceOrder,
    subject: plan.name,
    currency: plan.currency.toUpperCase(),
    amount: String(Math.round(plan.priceCents / 100)),
    email: user.email,
    paymentMethod: '9', // all methods
    urlConfirmation: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/callback/flow`,
    urlReturn: `${process.env.FRONTEND_URL}/payment/success`,
  }
  params.s = flowSign(params, cfg.secretKey)

  const form = new URLSearchParams(params)
  const res = await fetch(`${baseUrl}/payment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  if (!res.ok) throw new Error(`Flow error: ${await res.text()}`)

  const data = await res.json() as any
  if (data.code && data.code !== 0) throw new Error(`Flow: ${data.message}`)

  await recordCheckout('flow', data.token, gymId, userId, plan)

  const redirectUrl = cfg.sandbox
    ? `https://sandbox.flow.cl/app/web/pay.php?token=${data.token}`
    : `https://www.flow.cl/app/web/pay.php?token=${data.token}`

  return { url: redirectUrl, token: data.token, commerceOrder }
}

export async function handleFlowCallback(token: unknown) {
  const checkout = await findCheckout('flow', token)
  const cfg = gatewayConfig(await getGym(checkout.gymId), 'flow')

  const baseUrl = cfg.sandbox ? 'https://sandbox.flow.cl/api' : 'https://www.flow.cl/api'
  const params: Record<string, string> = { apiKey: cfg.apiKey, token: token as string }
  params.s = flowSign(params, cfg.secretKey)

  const res = await fetch(`${baseUrl}/payment/getStatus?${new URLSearchParams(params)}`)
  if (!res.ok) throw new Error(`Flow getStatus error`)

  const payment = await res.json() as any
  if (payment.status !== 2) throw new Error(`Pago Flow no aprobado (status: ${payment.status})`)
  assertPaidAmount(checkout, payment.amount)

  return completeCheckout(checkout, 'flow', `flow:${token}`)
}

// ─── Khipu (Chile) ───────────────────────────────────────────────────────────

function khipuSign(method: string, url: string, body: string, secret: string): string {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const msg = `${method}\n${url}\n${bodyHash}`
  return crypto.createHmac('sha256', secret).update(msg).digest('hex')
}

export async function createKhipuCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'khipu')

  const url = 'https://khipu.com/api/2.0/payments'
  const params = new URLSearchParams({
    subject: plan.name,
    currency: plan.currency.toUpperCase(),
    amount: String(plan.priceCents / 100),
    payer_email: user.email,
    return_url: `${process.env.FRONTEND_URL}/payment/success`,
    cancel_url: `${process.env.FRONTEND_URL}/payment/cancelled`,
    notify_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/callback/khipu`,
  })

  const body = params.toString()
  const sig = khipuSign('POST', url, body, cfg.secret)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `${cfg.receiverId}:${sig}`,
    },
    body,
  })

  if (!res.ok) throw new Error(`Khipu error: ${await res.text()}`)
  const data = await res.json() as any
  await recordCheckout('khipu', data.payment_id, gymId, userId, plan)
  return { url: data.payment_url, paymentId: data.payment_id }
}

/**
 * Valida la firma entrante de Khipu.
 * Header x-khipu-signature: HMAC-SHA256 del raw body en hex.
 * La clave es el `secret` del receiver configurado en el gym.
 */
export function validateKhipuSignature(
  xKhipuSignature: string | undefined,
  rawBody: Buffer | string,
  secret: string,
): void {
  if (!xKhipuSignature) throw new Error('Falta header x-khipu-signature')
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString() : rawBody
  const expected = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex')
  if (xKhipuSignature !== expected) throw new Error('Firma Khipu inválida')
}

export async function handleKhipuCallback(
  body: any,
  xKhipuSignature?: string,
  rawBody?: Buffer,
) {
  const checkout = await findCheckout('khipu', body?.payment_id)
  const cfg = gatewayConfig(await getGym(checkout.gymId), 'khipu')

  // Validar firma si el gym tiene el secret configurado
  if (cfg.secret) {
    const bodyForSig = rawBody ?? Buffer.from(JSON.stringify(body))
    validateKhipuSignature(xKhipuSignature, bodyForSig, cfg.secret)
  }

  const paymentId: string = body.payment_id
  const url = `https://khipu.com/api/2.0/payments/${paymentId}`
  const sig = khipuSign('GET', url, '', cfg.secret ?? '')
  const res = await fetch(url, {
    headers: { 'Authorization': `${cfg.receiverId}:${sig}` },
  })
  if (!res.ok) throw new Error('Error verificando pago Khipu')
  const payment = await res.json() as any
  if (payment.status !== 'done') throw new Error(`Pago Khipu no completado (${payment.status})`)
  assertPaidAmount(checkout, payment.amount)

  return completeCheckout(checkout, 'khipu', `khipu:${paymentId}`)
}

// ─── PayU LATAM ───────────────────────────────────────────────────────────────

function payuSignature(apiKey: string, merchantId: string, referenceCode: string, amount: string, currency: string): string {
  return crypto.createHash('md5').update(`${apiKey}~${merchantId}~${referenceCode}~${amount}~${currency}`).digest('hex')
}

export async function createPayUCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'payu')

  const referenceCode = `${gymId.slice(0, 8)}-${Date.now()}`
  const amount = (plan.priceCents / 100).toFixed(2)
  const currency = plan.currency.toUpperCase()
  const signature = payuSignature(cfg.apiKey, cfg.merchantId, referenceCode, amount, currency)

  const baseUrl = cfg.sandbox
    ? 'https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/'
    : 'https://checkout.payulatam.com/ppp-web-gateway-payu/'

  const params = new URLSearchParams({
    merchantId: cfg.merchantId,
    accountId: cfg.accountId,
    description: plan.name,
    referenceCode,
    amount,
    currency,
    signature,
    test: cfg.sandbox ? '1' : '0',
    buyerEmail: user.email,
    buyerFullName: user.name,
    confirmationUrl: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/callback/payu`,
    responseUrl: `${process.env.FRONTEND_URL}/payment/success`,
  })

  // PayU requires a form POST — return URL + params for frontend to build the form
  await recordCheckout('payu', referenceCode, gymId, userId, plan)
  return { url: baseUrl, params: Object.fromEntries(params), referenceCode }
}

export async function handlePayUCallback(body: any) {
  // PayU sends: transactionState (4=Approved), referenceCode, TX_VALUE, currency, signature
  const { transactionState, referenceCode, TX_VALUE, currency, sign } = body ?? {}
  const checkout = await findCheckout('payu', referenceCode)
  const cfg = gatewayConfig(await getGym(checkout.gymId), 'payu')

  if (transactionState !== '4') throw new Error(`Pago PayU no aprobado (estado: ${transactionState})`)

  // Verify signature: MD5(apiKey~merchantId~referenceCode~TX_VALUE~currency~transactionState)
  const expected = crypto
    .createHash('md5')
    .update(`${cfg.apiKey}~${cfg.merchantId}~${referenceCode}~${TX_VALUE}~${currency}~${transactionState}`)
    .digest('hex')

  if (!sign) throw new Error('Falta firma PayU')
  if (sign.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('Firma PayU inválida')
  }
  assertPaidAmount(checkout, TX_VALUE)

  return completeCheckout(checkout, 'payu', `payu:${referenceCode}`)
}

// ─── Kushki ───────────────────────────────────────────────────────────────────

export async function createKushkiCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'kushki')

  const baseUrl = cfg.sandbox
    ? 'https://api-uat.kushkipagos.com'
    : 'https://api.kushkipagos.com'

  const body = {
    amount: {
      subtotalIva: 0,
      iva: 0,
      subtotalIva0: plan.priceCents / 100,
    },
    currency: plan.currency.toUpperCase(),
    description: plan.name,
    redirectURL: `${process.env.FRONTEND_URL}/payment/success`,
    cancelURL: `${process.env.FRONTEND_URL}/payment/cancelled`,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/callback/kushki`,
    userType: '0',
    paymentDescription: `Membresía ${MEMBERSHIP_DAYS} días — ${plan.name}`,
  }

  const res = await fetch(`${baseUrl}/card/v1/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Private-Merchant-Id': cfg.privateMerchantId,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Kushki error: ${await res.text()}`)
  const data = await res.json() as any

  if (!data.redirectURL && !data.payment_url) {
    throw new Error('Kushki no devolvió URL de pago')
  }

  if (!data.ticketNumber) throw new Error('Kushki no devolvió ticketNumber')
  await recordCheckout('kushki', data.ticketNumber, gymId, userId, plan)

  return { url: data.redirectURL || data.payment_url, chargeToken: data.ticketNumber }
}

/**
 * Valida el header x-kushki-token enviado por Kushki en callbacks.
 * Es un JWT firmado por Kushki. En MVP:
 * 1. Verificamos que el header existe.
 * 2. Verificamos que tiene formato JWT (tres segmentos base64url).
 * 3. Decodificamos el payload y verificamos que el merchantId coincide.
 * La verificación criptográfica completa requiere la clave pública de Kushki
 * (no expuesta en docs públicos para sandbox) — queda como TODO para producción.
 */
export function validateKushkiToken(
  xKushkiToken: string | undefined,
  expectedMerchantId: string,
): void {
  if (!xKushkiToken) throw new Error('Falta header x-kushki-token')

  const parts = xKushkiToken.split('.')
  if (parts.length !== 3) throw new Error('Header x-kushki-token no tiene formato JWT')

  // Decodificar payload (segunda parte) sin verificar firma
  let payload: any
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
  } catch {
    throw new Error('Header x-kushki-token: payload JWT inválido')
  }

  // Verificar merchantId en el payload del JWT
  const tokenMerchantId: string | undefined = payload?.merchantId ?? payload?.merchant_id
  if (!tokenMerchantId) throw new Error('x-kushki-token no contiene merchantId')
  if (tokenMerchantId !== expectedMerchantId) {
    throw new Error('x-kushki-token: merchantId no coincide con la configuración')
  }
}

export async function handleKushkiCallback(body: any, xKushkiToken?: string) {
  const { ticketNumber, transactionStatus } = body ?? {}
  const checkout = await findCheckout('kushki', ticketNumber)

  const gym = await getGym(checkout.gymId)
  const cfg = (gym.paymentGateways as any)?.kushki
  if (!cfg?.enabled) throw new Error('Pasarela Kushki no habilitada para este gimnasio')
  // Sin privateMerchantId no hay con qué validar el token: se rechaza (fail-closed)
  if (!cfg.privateMerchantId) throw new Error('Kushki sin privateMerchantId configurado')
  validateKushkiToken(xKushkiToken, cfg.privateMerchantId)

  // El estado es obligatorio: antes, un callback sin transactionStatus activaba la membresía
  if (transactionStatus !== 'APPROVAL') {
    throw new Error(`Pago Kushki no aprobado (${transactionStatus ?? 'sin estado'})`)
  }
  assertPaidAmount(checkout, body?.amount?.subtotalIva0 ?? body?.totalAmount)

  // PENDIENTE: validateKushkiToken no verifica la firma del JWT (solo el merchantId del
  // payload). Confirmar el pago contra la API de Kushki según su documentación oficial.
  return completeCheckout(checkout, 'kushki', `kushki:${ticketNumber}`)
}

// ─── OpenPay (México / Colombia) ──────────────────────────────────────────────

export async function createOpenPayCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'openpay')

  const baseUrl = cfg.sandbox
    ? `https://sandbox-api.openpay.mx/v1/${cfg.merchantId}`
    : `https://api.openpay.mx/v1/${cfg.merchantId}`

  const orderId = `${gymId.slice(0, 8)}-${Date.now()}`
  const credentials = Buffer.from(`${cfg.privateKey}:`).toString('base64')

  const body = {
    method: 'card',
    amount: plan.priceCents / 100,
    currency: plan.currency.toUpperCase(),
    description: plan.name,
    order_id: orderId,
    redirect_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/callback/openpay?orderId=${orderId}`,
    customer: {
      name: user.name,
      email: user.email,
    },
  }

  const res = await fetch(`${baseUrl}/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`OpenPay error: ${await res.text()}`)
  const data = await res.json() as any

  const paymentUrl = data.payment_method?.url || data.redirect_url
  if (!paymentUrl) throw new Error('OpenPay no devolvió URL de pago')

  await recordCheckout('openpay', orderId, gymId, userId, plan)
  return { url: paymentUrl, transactionId: data.id, orderId }
}

export async function handleOpenPayCallback(query: any) {
  const orderId = query?.orderId
  const checkout = await findCheckout('openpay', orderId)
  const cfg = gatewayConfig(await getGym(checkout.gymId), 'openpay')

  const baseUrl = cfg.sandbox
    ? `https://sandbox-api.openpay.mx/v1/${cfg.merchantId}`
    : `https://api.openpay.mx/v1/${cfg.merchantId}`

  const credentials = Buffer.from(`${cfg.privateKey}:`).toString('base64')

  // Verify charge by orderId
  const res = await fetch(`${baseUrl}/charges?order_id=${orderId}`, {
    headers: { 'Authorization': `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error('Error verificando pago OpenPay')

  const charges = await res.json() as any
  const charge = Array.isArray(charges) ? charges[0] : charges

  if (!charge || charge.status !== 'completed') {
    throw new Error(`Pago OpenPay no completado (${charge?.status})`)
  }
  assertPaidAmount(checkout, charge.amount)

  return completeCheckout(checkout, 'openpay', `openpay:${charge.id}`)
}

// ─── Manual / existing ───────────────────────────────────────────────────────

// ─── MACH Business (Chile) ────────────────────────────────────────────────────

const MACH_API = 'https://biz.soymach.com/api/v1'

export async function createMachCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan, user] = await Promise.all([getGym(gymId), getPlan(planId, gymId), getUser(userId, gymId)])
  const cfg = gatewayConfig(gym, 'mach')

  const externalId = `${gymId.slice(0, 8)}-${planId.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now()}`
  const amountCLP = Math.round(plan.priceCents / 100)

  const body = {
    amount: amountCLP,
    currency: 'CLP',
    description: `${plan.name} — ${MEMBERSHIP_DAYS} días`,
    external_id: externalId,
    payer_email: user.email,
    callback_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/webhook/mach`,
    redirect_url: `${process.env.FRONTEND_URL}/payment/success`,
  }

  const res = await fetch(`${MACH_API}/payment-links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`MACH Business error: ${err}`)
  }

  const data = await res.json() as any

  // Store pending reference for webhook matching
  // external_id format: gymId8-planId8-userId8-timestamp
  return { url: data.payment_url || data.url, externalId, linkId: data.id }
}

/**
 * Valida el webhook entrante de MACH Business.
 * MACH Business no expone un mecanismo de firma HMAC en su documentación pública.
 * Según comportamiento observado en sandbox: el webhook llega con un header
 * Authorization: Bearer <webhookSecret> configurado al crear el payment link.
 * MVP: verificar que el Bearer token del header coincide con el webhookSecret del gym.
 * Comparación de tiempo constante para evitar timing attacks.
 */
export function validateMachWebhookToken(
  authorizationHeader: string | undefined,
  webhookSecret: string,
): void {
  if (!authorizationHeader) throw new Error('Falta header Authorization en webhook MACH')

  const token = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice(7)
    : authorizationHeader

  // Comparación de tiempo constante
  const secretBuf = Buffer.from(webhookSecret)
  const tokenBuf = Buffer.from(token)
  if (
    secretBuf.length !== tokenBuf.length ||
    !crypto.timingSafeEqual(secretBuf, tokenBuf)
  ) {
    throw new Error('Token de webhook MACH inválido')
  }
}

export async function handleMachWebhook(body: any, authorizationHeader?: string) {
  // MACH notifies with { status, external_id, payment_id, amount }
  const { status, external_id, payment_id, amount } = body

  if (status !== 'PAID' && status !== 'COMPLETED') return { received: true }
  if (!external_id) return { received: true }

  // Parse external_id: gymId8-planId8-userId8-timestamp
  // We need to look up full IDs by prefix
  const parts = external_id.split('-')
  if (parts.length < 3) return { received: true }

  const gymPrefix = parts[0]
  const planPrefix = parts[1]
  const userPrefix = parts[2]

  // Find gym by prefix
  const gym = await prisma.gym.findFirst({
    where: { id: { startsWith: gymPrefix } },
  })
  if (!gym) return { received: true }

  // Verify with MACH API using gym's apiKey
  const cfg = (gym.paymentGateways as any)?.mach
  if (!cfg?.enabled || !cfg?.apiKey) return { received: true }

  // Validar token si el gym tiene webhookSecret configurado
  if (cfg.webhookSecret) {
    validateMachWebhookToken(authorizationHeader, cfg.webhookSecret)
  }

  // Idempotency check
  const existing = await prisma.membership.findFirst({
    where: { paymentNotes: `mach:${payment_id}` },
  })
  if (existing) return { received: true, membershipId: existing.id }

  // Find plan and user by prefix
  const plan = await prisma.plan.findFirst({
    where: { gymId: gym.id, id: { startsWith: planPrefix } },
  })
  const user = await prisma.user.findFirst({
    where: { gymId: gym.id, id: { startsWith: userPrefix } },
  })
  if (!plan || !user) return { received: true }

  const membership = await activateMembership(user.id, plan.id, 'mach', {
    paymentNotes: `mach:${payment_id}`,
  })

  sendPaymentConfirmation(gym.id, {
    memberName: user.name, memberEmail: user.email, planName: plan.name,
    amount: plan.priceCents, currency: plan.currency, paymentMethod: 'mach', endsAt: membership.endsAt,
  }).catch(err => console.error('[Email] MACH:', err))

  return { received: true, membershipId: membership.id }
}

export async function registerManualPayment(
  gymId: string, userId: string, planId: string,
  paymentMethod: string, paymentNotes?: string,
  invoiceType?: string, receiverRut?: string, receiverName?: string,
) {
  const user = await getUser(userId, gymId)
  const plan = await getPlan(planId, gymId)
  const gym = await getGym(gymId)

  const existingManual = await prisma.membership.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'desc' },
  })
  const startsAt = existingManual ? existingManual.endsAt : new Date()
  const endsAt = new Date(startsAt)
  endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS)

  await prisma.membership.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
    data: { status: 'INACTIVE' },
  })

  let invoicePdfUrl: string | null = null
  let invoiceNumber: number | null = null
  let finalInvoiceType: string | null = invoiceType || null

  if (invoiceType === 'boleta' || invoiceType === 'factura') {
    const dteInput: DteInput = {
      invoiceType: invoiceType as 'boleta' | 'factura',
      priceCents: plan.priceCents,
      currency: plan.currency,
      planName: plan.name,
      planDays: MEMBERSHIP_DAYS,
      receiverRut,
      receiverName,
      receiverEmail: user.email,
    }
    const dteResult = await emitirDTE(gym, dteInput)
    if (dteResult) {
      invoicePdfUrl = dteResult.invoicePdfUrl
      invoiceNumber = dteResult.invoiceNumber
    }
  }

  const membership = await prisma.membership.create({
    data: {
      userId, planId,
      status: 'ACTIVE', startsAt, endsAt,
      pricePaid: plan.priceCents, currency: plan.currency,
      paidAt: new Date(), paymentMethod,
      paymentNotes: paymentNotes || null,
      invoiceType: finalInvoiceType, invoicePdfUrl, invoiceNumber,
      invoiceReceiverRut: receiverRut || null, invoiceReceiverName: receiverName || null,
    },
    include: {
      plan: { select: { name: true, durationDays: true } },
      user: { select: { name: true, email: true } },
    },
  })

  sendPaymentConfirmation(gymId, {
    memberName: user.name, memberEmail: user.email, planName: plan.name,
    amount: plan.priceCents, currency: plan.currency, paymentMethod, endsAt,
    invoicePdfUrl, invoiceType: finalInvoiceType, invoiceNumber,
  }).catch(err => console.error('[Email] Manual:', err))

  return membership
}

export async function getPaymentHistory(gymId: string) {
  return prisma.membership.findMany({
    where: { user: { gymId }, paidAt: { not: null } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      plan: { select: { name: true } },
    },
    orderBy: { paidAt: 'desc' },
    take: 100,
  })
}

export async function getMemberMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    include: { plan: { select: { name: true, durationDays: true, priceCents: true, currency: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getRevenueStats(gymId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [todayPayments, monthPayments, allPayments] = await Promise.all([
    prisma.membership.findMany({ where: { user: { gymId }, paidAt: { gte: startOfDay } }, select: { pricePaid: true } }),
    prisma.membership.findMany({ where: { user: { gymId }, paidAt: { gte: startOfMonth } }, select: { pricePaid: true } }),
    prisma.membership.findMany({ where: { user: { gymId }, paidAt: { not: null } }, select: { pricePaid: true } }),
  ])

  const sum = (p: { pricePaid: number }[]) => p.reduce((a, x) => a + x.pricePaid, 0)

  return {
    today: { total: sum(todayPayments), count: todayPayments.length },
    month: { total: sum(monthPayments), count: monthPayments.length },
    allTime: { total: sum(allPayments), count: allPayments.length },
  }
}

// ─── Transferencia bancaria — flujo alumno/admin ───────────────────────────

export async function submitTransferReceipt(gymId: string, userId: string, planId: string, receiptUrl: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, gymId } })
  if (!plan) throw new Error('Plan no encontrado')

  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  // Desactivar membresías activas anteriores
  await prisma.membership.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
    data: { status: 'INACTIVE' },
  })

  const startsAt = new Date()
  const endsAt = new Date()
  endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS)

  return prisma.membership.create({
    data: {
      userId, planId,
      status: 'INACTIVE',           // queda inactivo hasta que admin confirme
      startsAt, endsAt,
      pricePaid: plan.priceCents,
      currency: plan.currency,
      paymentMethod: 'transfer',
      transferReceiptUrl: receiptUrl,
      transferStatus: 'PENDING_REVIEW',
    },
    include: { plan: { select: { name: true, durationDays: true } } },
  })
}

export async function getPendingTransfers(gymId: string) {
  return prisma.membership.findMany({
    where: {
      transferStatus: 'PENDING_REVIEW',
      user: { gymId },
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      plan: { select: { name: true, durationDays: true, priceCents: true, currency: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function confirmTransfer(gymId: string, membershipId: string, notes?: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, user: { gymId } },
    include: { user: true, plan: true },
  })
  if (!membership) throw new Error('Membresía no encontrada')
  if (membership.transferStatus !== 'PENDING_REVIEW') throw new Error('Esta transferencia ya fue procesada')

  // Extender desde membresía vigente si la hay (o desde la fecha original del comprobante)
  const existingTransfer = await prisma.membership.findFirst({
    where: { userId: membership.userId, id: { not: membershipId }, status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'desc' },
  })
  const baseDate = existingTransfer ? existingTransfer.endsAt : new Date()
  const endsAt = new Date(baseDate)
  endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS)

  const updated = await prisma.membership.update({
    where: { id: membershipId },
    data: {
      status: 'ACTIVE',
      transferStatus: 'CONFIRMED',
      paidAt: new Date(),
      endsAt,
      ...(notes && { paymentNotes: notes }),
    },
  })

  // Notificación email al alumno
  const { user, plan } = membership
  sendPaymentConfirmation(gymId, {
    memberName: user.name,
    memberEmail: user.email,
    planName: plan.name,
    amount: plan.priceCents,
    currency: plan.currency,
    paymentMethod: 'transfer',
    endsAt,
  }).catch(() => {})

  return updated
}

export async function rejectTransfer(gymId: string, membershipId: string, reason?: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, user: { gymId } },
  })
  if (!membership) throw new Error('Membresía no encontrada')
  if (membership.transferStatus !== 'PENDING_REVIEW') throw new Error('Esta transferencia ya fue procesada')

  return prisma.membership.update({
    where: { id: membershipId },
    data: {
      status: 'INACTIVE',
      transferStatus: 'REJECTED',
      ...(reason && { paymentNotes: reason }),
    },
  })
}

// ─── Gym Platform Subscription Checkout ──────────────────────────────────────

export async function createGymSubscriptionCheckout(gymId: string, planId: string) {
  const [gym, fitPlan] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId } }),
    prisma.fitAppPlan.findUnique({ where: { id: planId } }),
  ])
  if (!gym) throw new Error('Gimnasio no encontrado')
  if (!fitPlan) throw new Error('Plan no encontrado')

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

  // Crear o recuperar Stripe Customer para el gym
  let stripeCustomerId = gym.stripeCustomerId
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: gym.name,
      email: gym.ownerEmail || undefined,
      metadata: { gymId: gym.id },
    })
    stripeCustomerId = customer.id
    await prisma.gym.update({ where: { id: gymId }, data: { stripeCustomerId } })
  }

  // Crear GymSubscription pendiente si no existe una activa/trial
  let subscription = await prisma.gymSubscription.findFirst({
    where: { gymId, status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!subscription) {
    const now = new Date()
    subscription = await prisma.gymSubscription.create({
      data: { gymId, planId, status: 'EXPIRED', startsAt: now, endsAt: now },
    })
  }

  // Precio: CLP es zero-decimal en Stripe (no multiplicar x100), USD sí
  const isZeroDecimal = ['CLP', 'JPY', 'KRW'].includes('CLP')
  const unitAmount = isZeroDecimal ? fitPlan.priceCLP : fitPlan.priceUSD * 100

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId,
    line_items: [{
      price_data: {
        currency: 'clp',
        product_data: {
          name: `FitApp ${fitPlan.name}`,
          description: `Suscripción plataforma — ${fitPlan.durationDays} días`,
        },
        unit_amount: unitAmount,
      },
      quantity: 1,
    }],
    metadata: {
      type: 'gym_subscription',
      gymId,
      subscriptionId: subscription.id,
      planId,
    },
    success_url: `${frontendUrl}/dashboard?subscription=success`,
    cancel_url: `${frontendUrl}/dashboard?subscription=cancelled`,
  })

  // Guardar el checkout session id
  await prisma.gymSubscription.update({
    where: { id: subscription.id },
    data: { stripeCheckoutSessionId: session.id },
  })

  return { checkoutUrl: session.url, sessionId: session.id }
}

export async function getGymSubscriptionStatus(gymId: string) {
  const [gym, subscription] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, name: true, status: true } }),
    prisma.gymSubscription.findFirst({
      where: { gymId, status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED'] } },
      include: { plan: { select: { id: true, name: true, slug: true, priceCLP: true, durationDays: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  if (!gym) throw new Error('Gimnasio no encontrado')

  const now = new Date()
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((subscription.endsAt.getTime() - now.getTime()) / 86400000))
    : 0

  return { gym, subscription, daysLeft, isExpired: !subscription || subscription.endsAt < now }
}

// ─── Fintoc — Conciliación bancaria ──────────────────────────────────────────

export async function saveFintocLink(
  gymId: string,
  linkToken: string,
  accountId: string,
  optional: {
    accountNumber?: string
    bankName?: string
    holderName?: string
    holderRut?: string
  } = {},
) {
  return prisma.fintocLink.upsert({
    where: { gymId },
    create: {
      gymId,
      linkToken,
      accountId,
      accountNumber: optional.accountNumber ?? null,
      bankName: optional.bankName ?? null,
      holderName: optional.holderName ?? null,
      holderRut: optional.holderRut ?? null,
      status: 'ACTIVE',
    },
    update: {
      linkToken,
      accountId,
      accountNumber: optional.accountNumber ?? null,
      bankName: optional.bankName ?? null,
      holderName: optional.holderName ?? null,
      holderRut: optional.holderRut ?? null,
      status: 'ACTIVE',
      updatedAt: new Date(),
    },
  })
}

export async function getFintocStatus(gymId: string) {
  const link = await prisma.fintocLink.findUnique({ where: { gymId } })
  const pendingCount = link
    ? await prisma.bankMovement.count({
        where: { gymId, reconciliationStatus: 'PENDING' },
      })
    : 0
  const matchedCount = link
    ? await prisma.bankMovement.count({
        where: { gymId, reconciliationStatus: 'MATCHED' },
      })
    : 0
  return { connected: !!link, link: link ?? null, pendingCount, matchedCount }
}

export async function importFintocMovements(
  gymId: string,
  rawMovements: Array<{
    id: string
    amount: number
    currency?: string
    post_date: string
    description?: string
    sender_rut?: string
    sender_name?: string
    reference_code?: string
  }>,
) {
  const link = await prisma.fintocLink.findUnique({ where: { gymId } })
  if (!link) throw new Error('No hay link Fintoc configurado para este gimnasio')

  // Una query para detectar existentes + un createMany (antes: 2 queries por movimiento).
  // Un id repetido dentro del mismo lote cuenta como skipped, igual que antes.
  const existing = await prisma.bankMovement.findMany({
    where: { fintocMovementId: { in: rawMovements.map(m => m.id) } },
    select: { fintocMovementId: true },
  })
  const seen = new Set(existing.map(m => m.fintocMovementId))
  const imported: string[] = []
  const skipped: string[] = []
  const toCreate = rawMovements.filter(raw => {
    if (seen.has(raw.id)) { skipped.push(raw.id); return false }
    seen.add(raw.id)
    imported.push(raw.id)
    return true
  })

  if (toCreate.length) {
    await prisma.bankMovement.createMany({
      data: toCreate.map(raw => ({
        gymId,
        fintocLinkId: link.id,
        fintocMovementId: raw.id,
        amount: raw.amount,
        currency: raw.currency ?? 'CLP',
        postedAt: new Date(raw.post_date),
        description: raw.description ?? null,
        senderRut: raw.sender_rut ?? null,
        senderName: raw.sender_name ?? null,
        referenceCode: raw.reference_code ?? null,
        reconciliationStatus: 'PENDING' as const,
      })),
      skipDuplicates: true, // carrera con otro import concurrente
    })
  }

  // Update lastSyncAt
  await prisma.fintocLink.update({
    where: { gymId },
    data: { lastSyncAt: new Date() },
  })

  // Run matcher on newly imported movements
  const matchResult = await runMatcher(gymId, imported)

  return {
    imported: imported.length,
    skipped: skipped.length,
    matched: matchResult.matched,
    confirmed: matchResult.confirmed,
  }
}

/**
 * Matcher de conciliación bancaria.
 * Fase 1 (exact_rut): si el movimiento tiene senderRut y hay una membresía PENDING_REVIEW
 *   cuyo usuario.rut coincide y el monto coincide → confirmar automáticamente.
 * Fase 2 (amount_only): si hay una membresía PENDING_REVIEW con el mismo monto dentro
 *   de ±72h de su createdAt → marcar como MATCHED (requiere revisión manual).
 */
export async function runMatcher(
  gymId: string,
  movementIds: string[],
): Promise<{ matched: number; confirmed: number }> {
  if (movementIds.length === 0) return { matched: 0, confirmed: 0 }

  const movements = await prisma.bankMovement.findMany({
    where: {
      gymId,
      fintocMovementId: { in: movementIds },
      reconciliationStatus: 'PENDING',
    },
  })

  let matched = 0
  let confirmed = 0

  for (const movement of movements) {
    // Candidatos: membresías PENDING_REVIEW con mismo monto, del mismo gym
    const candidates = await prisma.membership.findMany({
      where: {
        transferStatus: 'PENDING_REVIEW',
        pricePaid: movement.amount,
        user: { gymId },
      },
      include: { user: { select: { id: true, rut: true } } },
      orderBy: { createdAt: 'asc' },
    })

    if (candidates.length === 0) continue

    // Fase 1: match exacto por RUT
    if (movement.senderRut) {
      const rutMatch = candidates.find(
        c => c.user.rut && c.user.rut === movement.senderRut,
      )
      if (rutMatch) {
        // Confirmar automáticamente
        await confirmTransfer(gymId, rutMatch.id)
        await prisma.bankMovement.update({
          where: { id: movement.id },
          data: {
            reconciliationStatus: 'CONFIRMED',
            membershipId: rutMatch.id,
            matchConfidence: 'exact_rut',
          },
        })
        confirmed++
        continue
      }
    }

    // Fase 2: match por monto dentro de ±72h
    const windowMs = 72 * 60 * 60 * 1000
    const windowMatch = candidates.find(c => {
      const diff = Math.abs(movement.postedAt.getTime() - c.createdAt.getTime())
      return diff <= windowMs
    })
    if (windowMatch) {
      await prisma.bankMovement.update({
        where: { id: movement.id },
        data: {
          reconciliationStatus: 'MATCHED',
          membershipId: windowMatch.id,
          matchConfidence: 'amount_only',
        },
      })
      matched++
    }
  }

  return { matched, confirmed }
}

export async function listBankMovements(
  gymId: string,
  filters: {
    status?: string
    limit?: number
    offset?: number
  } = {},
) {
  const { status, limit = 50, offset = 0 } = filters

  const where: any = { gymId }
  if (status) where.reconciliationStatus = status

  const [movements, total] = await Promise.all([
    prisma.bankMovement.findMany({
      where,
      include: {
        membership: {
          select: {
            id: true,
            transferStatus: true,
            user: { select: { id: true, name: true, email: true } },
            plan: { select: { name: true } },
          },
        },
      },
      orderBy: { postedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.bankMovement.count({ where }),
  ])

  return { movements, total, limit, offset }
}

export async function confirmBankMovement(
  gymId: string,
  movementId: string,
  membershipId: string,
  reviewedBy: string,
) {
  const movement = await prisma.bankMovement.findFirst({
    where: { id: movementId, gymId },
  })
  if (!movement) throw new Error('Movimiento bancario no encontrado')
  if (
    movement.reconciliationStatus === 'CONFIRMED' ||
    movement.reconciliationStatus === 'REJECTED'
  ) {
    throw new Error('Este movimiento ya fue procesado')
  }

  // Confirm the associated transfer membership
  await confirmTransfer(gymId, membershipId)

  return prisma.bankMovement.update({
    where: { id: movementId },
    data: {
      reconciliationStatus: 'CONFIRMED',
      membershipId,
      matchConfidence: movement.matchConfidence ?? 'manual',
      reviewedBy,
      reviewedAt: new Date(),
    },
  })
}

export async function rejectBankMovement(
  gymId: string,
  movementId: string,
  reviewedBy: string,
  reason?: string,
) {
  const movement = await prisma.bankMovement.findFirst({
    where: { id: movementId, gymId },
  })
  if (!movement) throw new Error('Movimiento bancario no encontrado')
  if (
    movement.reconciliationStatus === 'CONFIRMED' ||
    movement.reconciliationStatus === 'REJECTED'
  ) {
    throw new Error('Este movimiento ya fue procesado')
  }

  return prisma.bankMovement.update({
    where: { id: movementId },
    data: {
      reconciliationStatus: 'REJECTED',
      reviewedBy,
      reviewedAt: new Date(),
      ...(reason ? { description: `[RECHAZADO] ${reason}` } : {}),
    },
  })
}

// ─── Fintoc Payments (Pay by Bank) ───────────────────────────────────────────

export async function createFintocPayCheckout(gymId: string, planId: string, userId: string) {
  const [gym, plan] = await Promise.all([getGym(gymId), getPlan(planId, gymId)])
  const cfg = gatewayConfig(gym, 'fintocPayments')

  const res = await fetch('https://api.fintoc.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.secretKey}`,
    },
    body: JSON.stringify({
      amount: plan.priceCents,
      currency: cfg.currency ?? 'CLP',
      metadata: { gymId, planId, userId },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Fintoc Pay error: ${err}`)
  }

  const data = await res.json() as any

  await prisma.fintocPaymentIntent.create({
    data: {
      gymId,
      userId,
      planId,
      fintocIntentId: data.id,
      widgetUrl: data.widget_url,
      status: 'PENDING',
      amountCents: plan.priceCents,
      metadata: data,
    },
  })

  return { widgetUrl: data.widget_url, paymentIntentId: data.id }
}

export async function getFintocPayStatus(paymentIntentId: string, userId: string) {
  const record = await prisma.fintocPaymentIntent.findUnique({
    where: { fintocIntentId: paymentIntentId },
  })
  if (!record || record.userId !== userId) return null
  return { status: record.status, membershipId: record.membershipId }
}

// Compara una firma HMAC-SHA256 hex en tiempo constante (evita timing attacks)
export function isValidHmacSha256(body: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(body).digest('hex'))
  const received = Buffer.from(signature)
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

export async function handleFintocPayWebhook(body: any, rawBody: Buffer | string, fintocSignatureHeader: string | undefined) {
  const gymId: string | undefined = body?.data?.metadata?.gymId
  if (!gymId) throw new Error('gymId no encontrado en metadata del webhook')

  const gym = await getGym(gymId)
  const cfg = (gym.paymentGateways as any)?.fintocPayments
  if (!cfg?.webhookSecret) throw new Error('webhookSecret de Fintoc Payments no configurado')

  // Validar firma HMAC-SHA256 igual que validateKhipuSignature
  if (!fintocSignatureHeader) throw new Error('Firma inválida')
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString() : rawBody
  if (!isValidHmacSha256(bodyStr, cfg.webhookSecret, fintocSignatureHeader)) throw new Error('Firma inválida')

  if (body.type === 'payment_intent.succeeded') {
    const fintocIntentId: string = body.data.id
    const intent = await prisma.fintocPaymentIntent.findUnique({
      where: { fintocIntentId },
    })
    if (!intent) return { received: true }

    // Idempotencia
    if (intent.status === 'SUCCEEDED') return { received: true }

    const membership = await activateMembership(intent.userId, intent.planId, 'fintoc_pay', {
      paymentNotes: `fintoc_pay:${fintocIntentId}`,
    })

    await prisma.fintocPaymentIntent.update({
      where: { fintocIntentId },
      data: { status: 'SUCCEEDED', membershipId: membership.id },
    })

    const user = await prisma.user.findUnique({ where: { id: intent.userId } })
    const plan = await prisma.plan.findUnique({ where: { id: intent.planId } })
    if (user && plan) {
      sendPaymentConfirmation(gymId, {
        memberName: user.name, memberEmail: user.email, planName: plan.name,
        amount: plan.priceCents, currency: plan.currency, paymentMethod: 'fintoc_pay', endsAt: membership.endsAt,
      }).catch(err => console.error('[Email] Fintoc Pay:', err))
    }
  }

  if (body.type === 'payment_intent.failed') {
    const fintocIntentId: string = body.data.id
    await prisma.fintocPaymentIntent.updateMany({
      where: { fintocIntentId },
      data: { status: 'FAILED' },
    })
  }

  return { received: true }
}

export async function handleFintocWebhook(
  gymId: string,
  rawMovements: Array<{
    id: string
    amount: number
    currency?: string
    post_date: string
    description?: string
    sender_rut?: string
    sender_name?: string
    reference_code?: string
  }>,
) {
  return importFintocMovements(gymId, rawMovements)
}

export async function activateGymSubscriptionFromStripe(
  gymId: string,
  subscriptionId: string,
  planId: string,
  stripeSessionId: string,
) {
  const fitPlan = await prisma.fitAppPlan.findUnique({ where: { id: planId } })
  if (!fitPlan) return

  const now = new Date()

  // Si hay suscripción vigente, extender desde su vencimiento
  const currentSub = await prisma.gymSubscription.findFirst({
    where: { gymId, status: { in: ['TRIAL', 'ACTIVE'] }, endsAt: { gt: now }, id: { not: subscriptionId } },
    orderBy: { endsAt: 'desc' },
  })
  const baseDate = currentSub ? currentSub.endsAt : now
  const endsAt = new Date(baseDate)
  endsAt.setDate(endsAt.getDate() + fitPlan.durationDays)

  // Cancelar suscripciones anteriores activas
  await prisma.gymSubscription.updateMany({
    where: { gymId, status: { in: ['TRIAL', 'ACTIVE'] }, id: { not: subscriptionId } },
    data: { status: 'CANCELLED' },
  })

  // Activar la suscripción pagada
  await prisma.gymSubscription.update({
    where: { id: subscriptionId },
    data: { status: 'ACTIVE', startsAt: baseDate, endsAt, stripeCheckoutSessionId: stripeSessionId },
  })

  // Activar el gym
  await prisma.gym.update({ where: { id: gymId }, data: { status: 'ACTIVE' } })

  // Registrar el pago
  await prisma.gymSubscriptionPayment.create({
    data: {
      gymId,
      subscriptionId,
      planId,
      amount: fitPlan.priceCLP,
      currency: 'CLP',
      gateway: 'stripe',
      gatewayOrderId: stripeSessionId,
      status: 'PAID',
      paidAt: now,
    },
  })
}
