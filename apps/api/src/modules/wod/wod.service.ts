import { prisma } from '../../lib/prisma'
import { calculateLoad } from './wod.utils'
import { gymDayRange, DEFAULT_GYM_TIMEZONE } from '../../lib/gym-day'

export const includeBlocks = {
  blocks: {
    orderBy: { order: 'asc' as const },
    include: { movements: { orderBy: { order: 'asc' as const } } },
  },
}

// RM del movimiento: nombre igual (sin mayúsculas/espacios); si no hay, el más reciente
// que lo contenga. `rms` viene ordenado por fecha descendente.
function findRm<T extends { movementName: string }>(rms: T[], movementName: string): T | undefined {
  const name = movementName.trim().toLowerCase()
  return rms.find(r => r.movementName.trim().toLowerCase() === name)
    ?? rms.find(r => r.movementName.toLowerCase().includes(name))
}

/**
 * Cargas del alumno para el WOD de una clase (lista plana de movimientos).
 * - calculatedKg: % del RM del alumno, si el movimiento tiene % y el alumno tiene RM
 * - recommendedKg: calculatedKg o, si no hay, el peso prescrito según género (Rx → Scale → Rookie)
 */
export async function getMyLoads(gymId: string, classId: string, userId: string) {
  const [cls, user, gym] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, gymId }, select: { classTypeId: true, startsAt: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { gender: true } }),
    prisma.gym.findUnique({ where: { id: gymId }, select: { weightRounding: true, timezone: true } }),
  ])
  if (!cls) return []

  const wod = await prisma.wod.findFirst({
    where: { gymId, classTypeId: cls.classTypeId, date: gymDayRange(cls.startsAt, gym?.timezone || DEFAULT_GYM_TIMEZONE) },
    include: includeBlocks,
    orderBy: { date: 'desc' },
  })
  if (!wod) return []

  const rms = await prisma.rmRecord.findMany({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
    select: { movementName: true, weightKg: true },
  })
  const rounding = gym?.weightRounding ?? 2.5
  const isFemale = user?.gender?.toUpperCase() === 'F'

  return wod.blocks.flatMap(b => b.movements).map(m => {
    const rm = findRm(rms, m.movementName)
    const calculatedKg = rm && m.percentage ? calculateLoad(rm.weightKg, m.percentage, rounding) : null
    const prescribed = isFemale
      ? (m.weightRxF ?? m.weightScaleF ?? m.weightRookieF ?? null)
      : (m.weightRxM ?? m.weightScaleM ?? m.weightRookieM ?? null)
    const recommendedKg = calculatedKg ?? (prescribed !== null ? calculateLoad(prescribed, 100, rounding) : null)
    return { ...m, rmKg: rm?.weightKg || null, calculatedKg, recommendedKg }
  })
}
