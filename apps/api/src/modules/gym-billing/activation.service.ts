/**
 * Activación compartida de la suscripción de plataforma de un gym a partir de un pago PAID.
 * (Archivo aparte para que payments.service pueda usarla sin import circular.)
 */
import { prisma, type AppPrismaClient } from '../../lib/prisma'
import { HttpError } from '../../lib/http-error'

// Cliente de transacción interactiva del prisma extendido (no es Prisma.TransactionClient)
export type Tx = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]
const DAY_MS = 86_400_000

/**
 * Activa la suscripción del gym a partir de un GymSubscriptionPayment ya PAID.
 * Crea una fila GymSubscription NUEVA (corrige: renovar no cambiaba planId y perdía días):
 * base = max(ahora, endsAt de la TRIAL/ACTIVE vigente); las anteriores pasan a CANCELLED;
 * el gym queda ACTIVE y el pago se enlaza a la nueva suscripción.
 * Doble llamada: si el pago ya tiene subscriptionId devuelve esa sin duplicar.
 */
export async function activateGymSubscriptionInTx(tx: Tx, paymentId: string) {
  const payment = await tx.gymSubscriptionPayment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new HttpError(404, 'Pago no encontrado')
  if (payment.status !== 'PAID') throw new HttpError(409, 'El pago no está aprobado')
  if (payment.subscriptionId) {
    return tx.gymSubscription.findUniqueOrThrow({ where: { id: payment.subscriptionId } })
  }

  const plan = await tx.fitAppPlan.findUnique({ where: { id: payment.planId } })
  if (!plan) throw new HttpError(404, 'Plan no encontrado')

  const now = new Date()
  const current = await tx.gymSubscription.findFirst({
    where: { gymId: payment.gymId, status: { in: ['TRIAL', 'ACTIVE'] }, endsAt: { gt: now } },
    orderBy: { endsAt: 'desc' },
  })
  const base = current && current.endsAt > now ? current.endsAt : now
  const endsAt = new Date(base.getTime() + plan.durationDays * DAY_MS)

  await tx.gymSubscription.updateMany({
    where: { gymId: payment.gymId, status: { in: ['TRIAL', 'ACTIVE'] } },
    data: { status: 'CANCELLED' },
  })
  const sub = await tx.gymSubscription.create({
    data: { gymId: payment.gymId, planId: plan.id, status: 'ACTIVE', startsAt: base, endsAt },
  })
  // Barrera extra: si otra transacción ya enlazó el pago, abortar (rollback) sin duplicar
  const linked = await tx.gymSubscriptionPayment.updateMany({
    where: { id: payment.id, subscriptionId: null },
    data: { subscriptionId: sub.id },
  })
  if (linked.count !== 1) throw new HttpError(409, 'El pago ya fue activado')
  await tx.gym.update({ where: { id: payment.gymId }, data: { status: 'ACTIVE' } })
  return sub
}

export async function activateGymSubscriptionFromPayment(paymentId: string) {
  return prisma.$transaction(tx => activateGymSubscriptionInTx(tx, paymentId))
}

