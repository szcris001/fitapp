import { prisma } from './prisma'

// Toda membresía de gym dura 30 días, sin importar el plan (decisión 2026-06-13, confirmada
// 2026-09-27; ver STATE.md). Plan.durationDays se guarda siempre con este valor.
export const MEMBERSHIP_DAYS = 30

/**
 * Período de una membresía nueva: si el alumno tiene una vigente, empieza cuando esa vence
 * (renovar antes no hace perder días); si no, empieza hoy. Dura MEMBERSHIP_DAYS.
 * `excludeId` deja fuera la propia membresía que se está activando (transferencia pendiente).
 */
export async function nextMembershipPeriod(userId: string, { excludeId }: { excludeId?: string } = {}) {
  const current = await prisma.membership.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIAL'] },
      endsAt: { gt: new Date() },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { endsAt: 'desc' },
  })
  const startsAt = current ? current.endsAt : new Date()
  const endsAt = new Date(startsAt)
  endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS)
  return { startsAt, endsAt }
}
