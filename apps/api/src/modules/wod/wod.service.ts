import { prisma } from '../../lib/prisma'
import { calculateLoad } from './wod.utils'

export const includeBlocks = {
  blocks: {
    orderBy: { order: 'asc' as const },
    include: { movements: { orderBy: { order: 'asc' as const } } },
  },
}

export async function getWodByClass(gymId: string, classId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, gymId } })
  if (!cls) throw new Error('Clase no encontrada')

  const dayStart = new Date(cls.startsAt); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  return prisma.wod.findFirst({
    where: { gymId, classTypeId: cls.classTypeId, date: { gte: dayStart, lt: dayEnd } },
    include: includeBlocks,
    orderBy: { createdAt: 'desc' },
  })
}

export async function getWodWithLoads(gymId: string, classId: string, userId: string) {
  const [cls, user, gym] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, gymId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { gender: true } }),
    prisma.gym.findUnique({ where: { id: gymId }, select: { weightRounding: true } }),
  ])
  if (!cls) throw new Error('Clase no encontrada')

  const dayStart = new Date(cls.startsAt); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  const wod = await prisma.wod.findFirst({
    where: { gymId, classTypeId: cls.classTypeId, date: { gte: dayStart, lt: dayEnd } },
    include: includeBlocks,
    orderBy: { createdAt: 'desc' },
  })
  if (!wod) return null

  const allMovements = wod.blocks.flatMap(b => b.movements)
  const rms = await prisma.rmRecord.findMany({
    where: { userId, movementName: { in: allMovements.map(m => m.movementName) } },
    orderBy: { recordedAt: 'desc' },
    distinct: ['movementName'],
  })
  const rmMap = new Map<string, number>(rms.map(r => [r.movementName, r.weightKg]))

  const isFemale = user?.gender?.toUpperCase() === 'F'
  const rounding = gym?.weightRounding ?? 2.5

  const blocksWithLoads = wod.blocks.map(b => ({
    ...b,
    movements: b.movements.map(m => {
      const rm = rmMap.get(m.movementName) ?? null
      const prescribed = isFemale
        ? (m.weightRxF ?? m.weightScaleF ?? m.weightRookieF ?? null)
        : (m.weightRxM ?? m.weightScaleM ?? m.weightRookieM ?? null)

      // Si el movimiento tiene % y el atleta tiene RM registrado → calcular carga personalizada
      // Si no → usar el peso fijo prescripto (redondeado al ajuste del gym)
      const recommendedKg = (m.percentage && rm !== null)
        ? calculateLoad(rm, m.percentage, rounding)
        : prescribed !== null
          ? calculateLoad(prescribed, 100, rounding)
          : null
      return { ...m, rmKg: rm, recommendedKg }
    }),
  }))

  return { ...wod, blocks: blocksWithLoads }
}

export async function getWodsByDateRange(gymId: string, from: string, to: string) {
  return prisma.wod.findMany({
    where: {
      gymId,
      date: { gte: new Date(from), lte: new Date(to) },
    },
    include: {
      ...includeBlocks,
      classType: { select: { name: true, color: true } },
    },
    orderBy: { date: 'asc' },
  })
}
