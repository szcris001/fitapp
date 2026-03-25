import { prisma } from '../../lib/prisma'
import { CreateWodInput } from './wod.schema'

export async function createWod(gymId: string, data: CreateWodInput) {
  const cls = await prisma.class.findFirst({ where: { id: data.classId, gymId } })
  if (!cls) throw new Error('Clase no encontrada')

  return prisma.wod.create({
    data: {
      classId: data.classId,
      title: data.title,
      description: data.description,
      date: new Date(data.date),
      movements: { create: data.movements },
    },
    include: { movements: true },
  })
}

export async function getWodByClass(gymId: string, classId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, gymId } })
  if (!cls) throw new Error('Clase no encontrada')

  return prisma.wod.findFirst({
    where: { classId },
    include: { movements: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getWodWithLoads(gymId: string, classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, gymId } })
  if (!cls) throw new Error('Clase no encontrada')

  const wod = await prisma.wod.findFirst({
    where: { classId },
    include: { movements: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!wod) return null

  const movementNames = wod.movements
    .filter(m => m.percentage !== null)
    .map(m => m.movementName)

  const rms = await prisma.rmRecord.findMany({
    where: { userId, movementName: { in: movementNames } },
    orderBy: { recordedAt: 'desc' },
    distinct: ['movementName'],
  })

  const rmMap = new Map<string, number>(rms.map(r => [r.movementName, r.weightKg]))

  const movementsWithLoads = wod.movements.map(movement => {
    const rm = rmMap.get(movement.movementName) ?? null
    const recommendedKg =
      rm !== null && movement.percentage !== null
        ? Math.round((rm * movement.percentage) / 100 * 2) / 2
        : null

    return {
      ...movement,
      rmKg: rm,
      recommendedKg,
      hasRm: rm !== null,
    }
  })

  return { ...wod, movements: movementsWithLoads }
}

export async function importWods(gymId: string, wods: any[]) {
  let created = 0
  const errors: string[] = []

  for (const wodData of wods) {
    const cls = await prisma.class.findFirst({ where: { id: wodData.classId, gymId } })
    if (!cls) {
      errors.push(`Clase ${wodData.classId} no encontrada`)
      continue
    }
    await prisma.wod.create({
      data: {
        classId: wodData.classId,
        title: wodData.title,
        description: wodData.description,
        date: new Date(wodData.date),
        movements: { create: wodData.movements || [] },
      },
    })
    created++
  }

  return { created, errors }
}

export async function getWodsByDateRange(gymId: string, from: string, to: string) {
  return prisma.wod.findMany({
    where: {
      date: { gte: new Date(from), lte: new Date(to) },
      class: { gymId },
    },
    include: {
      movements: true,
      class: { include: { classType: { select: { name: true, color: true } } } },
    },
    orderBy: { date: 'asc' },
  })
}
