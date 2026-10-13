import { prisma } from './prisma'

// Duración por defecto para un plan nuevo que no especifique la suya (createPlanSchema la
// usa como default). Desde 2026-10-13 cada plan tiene su propia durationDays — antes todas
// las membresías duraban esto fijo sin importar el plan (decisión 2026-06-13, confirmada
// 2026-09-27 y 2026-10-06, revertida 2026-10-13 a pedido explícito — ver memoria
// project_plan_duration_backlog).
export const MEMBERSHIP_DAYS = 30

/**
 * Período de una membresía nueva: si el alumno tiene una vigente, empieza cuando esa vence
 * (renovar antes no hace perder días); si no, empieza hoy. Dura `durationDays` (del plan que
 * se está activando/renovando — el caller ya tiene el plan cargado, se lo pasa).
 * `excludeId` deja fuera la propia membresía que se está activando (transferencia pendiente).
 */
export async function nextMembershipPeriod(userId: string, durationDays: number, { excludeId }: { excludeId?: string } = {}) {
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
  endsAt.setDate(endsAt.getDate() + durationDays)
  return { startsAt, endsAt }
}
