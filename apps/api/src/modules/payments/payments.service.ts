import Stripe from 'stripe'
import { prisma } from '../../lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover',
})

export async function createCheckoutSession(gymId: string, planId: string, userId: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, gymId } })
  if (!plan) throw new Error('Plan no encontrado')

  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: plan.currency.toLowerCase(),
        product_data: {
          name: plan.name,
          description: `Membresía ${plan.durationDays} días — ${plan.name}`,
        },
        unit_amount: plan.priceCents,
      },
      quantity: 1,
    }],
    metadata: {
      gymId,
      planId,
      userId,
    },
    success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment/cancelled`,
  })

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
    const { gymId, planId, userId } = session.metadata || {}

    if (!gymId || !planId || !userId) return { received: true }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) return { received: true }

    const startsAt = new Date()
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() + plan.durationDays)

    await prisma.membership.updateMany({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
      data: { status: 'INACTIVE' },
    })

    await prisma.membership.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE',
        startsAt,
        endsAt,
        pricePaid: plan.priceCents,
        currency: plan.currency,
        paidAt: new Date(),
      },
    })
  }

  return { received: true }
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

export async function getRevenueStats(gymId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfDay = new Date(now.setHours(0, 0, 0, 0))

  const [todayPayments, monthPayments, allPayments] = await Promise.all([
    prisma.membership.findMany({
      where: { user: { gymId }, paidAt: { gte: startOfDay } },
      select: { pricePaid: true, currency: true },
    }),
    prisma.membership.findMany({
      where: { user: { gymId }, paidAt: { gte: startOfMonth } },
      select: { pricePaid: true, currency: true },
    }),
    prisma.membership.findMany({
      where: { user: { gymId }, paidAt: { not: null } },
      select: { pricePaid: true, currency: true },
    }),
  ])

  const sum = (payments: { pricePaid: number }[]) =>
    payments.reduce((acc, p) => acc + p.pricePaid, 0)

  return {
    today: { total: sum(todayPayments), count: todayPayments.length },
    month: { total: sum(monthPayments), count: monthPayments.length },
    allTime: { total: sum(allPayments), count: allPayments.length },
  }
}
