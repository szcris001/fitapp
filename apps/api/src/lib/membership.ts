import { prisma } from './prisma'
import { addGymLocalDays, getGymTimezone } from './gym-day'

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
 *
 * `endsAt` se calcula sumando `durationDays` a la fecha calendario de `startsAt` **en la zona
 * horaria del gym**, no en la del proceso donde corre el servidor (nunca se fija `TZ`
 * explícitamente). Con `setDate()` directo sobre el `Date`, 30 "días" terminaba siendo 30
 * días ± 1h cada vez que ese período cruzaba un cambio de horario en la zona ambiente del
 * proceso — que en CI/sandbox puede ser cualquier TZ, no la de Chile. Eso corría el contador
 * de "días restantes" a 31 en vez de 30 (hallazgo QA 2026-10-14, ver
 * project_dst_membership_date_bug).
 */
export async function nextMembershipPeriod(gymId: string, userId: string, durationDays: number, { excludeId }: { excludeId?: string } = {}) {
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

  const timezone = await getGymTimezone(gymId)
  const endsAt = addGymLocalDays(startsAt, durationDays, timezone)

  return { startsAt, endsAt }
}
