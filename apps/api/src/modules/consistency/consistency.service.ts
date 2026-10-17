import { prisma } from '../../lib/prisma'
import { gymDayStart, getGymTimezone, DEFAULT_GYM_TIMEZONE } from '../../lib/gym-day'

export { DEFAULT_GYM_TIMEZONE }

// Sin un mínimo, un alumno con 1 sola clase+resultado "ganaría" por una muestra
// trivial. ~20 clases es aprox. asistencia semanal durante la mitad de un semestre.
export const MIN_ELIGIBLE_CLASSES = 20

export type SemesterWindow = { periodStart: Date; periodEnd: Date }

export function semesterWindowsForYear(year: number, timezone: string): SemesterWindow[] {
  return [
    { periodStart: gymDayStart(`${year}-01-01`, timezone), periodEnd: gymDayStart(`${year}-07-01`, timezone) },
    { periodStart: gymDayStart(`${year}-07-01`, timezone), periodEnd: gymDayStart(`${year + 1}-01-01`, timezone) },
  ]
}

/**
 * Clases asistidas con WOD planificado ese día (elegibles) vs. cuántas de esas
 * tienen un WodResult del alumno (cargadas). Una clase sin WOD planificado ese
 * día no es elegible — no se le puede pedir a nadie cargar un resultado que no
 * existe, así que no cuenta ni a favor ni en contra.
 */
export async function calculateConsistency(
  gymId: string,
  userId: string,
  { periodStart, periodEnd }: SemesterWindow,
  timezone: string,
) {
  const bookings = await prisma.booking.findMany({
    where: { userId, status: 'ATTENDED', class: { gymId, startsAt: { gte: periodStart, lt: periodEnd } } },
    select: { class: { select: { classTypeId: true, startsAt: true } } },
  })
  if (bookings.length === 0) return { eligibleCount: 0, loggedCount: 0, qualifies: false }

  // Wod.date siempre se guarda vía gymDayStart (ver wod.routes.ts) — matchear
  // classTypeId + día local exacto, sin rangos difusos.
  const wods = await prisma.wod.findMany({
    where: { gymId, date: { gte: periodStart, lt: periodEnd } },
    select: { id: true, classTypeId: true, date: true },
  })
  const wodsByDayType = new Map<string, string[]>()
  for (const w of wods) {
    const key = `${w.classTypeId}|${w.date.toISOString()}`
    wodsByDayType.set(key, [...(wodsByDayType.get(key) ?? []), w.id])
  }

  const eligibleWodIds: string[][] = []
  for (const b of bookings) {
    const key = `${b.class.classTypeId}|${gymDayStart(b.class.startsAt, timezone).toISOString()}`
    const ids = wodsByDayType.get(key)
    if (ids) eligibleWodIds.push(ids)
  }
  const eligibleCount = eligibleWodIds.length
  if (eligibleCount === 0) return { eligibleCount: 0, loggedCount: 0, qualifies: false }

  const allWodIds = [...new Set(eligibleWodIds.flat())]
  const loggedWodIds = new Set(
    (await prisma.wodResult.findMany({ where: { userId, wodId: { in: allWodIds } }, select: { wodId: true } }))
      .map(r => r.wodId),
  )
  const loggedCount = eligibleWodIds.filter(ids => ids.some(id => loggedWodIds.has(id))).length

  return {
    eligibleCount,
    loggedCount,
    qualifies: loggedCount === eligibleCount && eligibleCount >= MIN_ELIGIBLE_CLASSES,
  }
}

/** Calcula y otorga la insignia a cada MEMBER del gym que califique en la ventana dada. */
export async function awardConsistencyBadgesForGym(gymId: string, window: SemesterWindow) {
  const timezone = await getGymTimezone(gymId)
  const members = await prisma.user.findMany({ where: { gymId, role: 'MEMBER' }, select: { id: true } })

  let awarded = 0
  for (const member of members) {
    const result = await calculateConsistency(gymId, member.id, window, timezone)
    if (!result.qualifies) continue
    try {
      await prisma.consistencyBadge.create({
        data: {
          gymId,
          userId: member.id,
          periodStart: window.periodStart,
          periodEnd: window.periodEnd,
          eligibleCount: result.eligibleCount,
          loggedCount: result.loggedCount,
        },
      })
      awarded++
    } catch (err: any) {
      // Ya tenía la insignia de ese período (@@unique) — corrida repetida, no es un error.
      if (err?.code !== 'P2002') throw err
    }
  }
  return awarded
}
