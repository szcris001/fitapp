import { prisma } from '../../lib/prisma'
import { CreateRmInput, CreateGymnasticProgressInput } from './rm.schema'
import { handlePrismaError } from '../../lib/prismaError'

export async function getRmsByUser(userId: string, gymId: string) {
  const targetUser = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!targetUser) return null

  const records = await prisma.rmRecord.findMany({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
  })

  const byMovement = new Map<string, typeof records>()
  for (const r of records) {
    if (!byMovement.has(r.movementName)) byMovement.set(r.movementName, [])
    byMovement.get(r.movementName)!.push(r)
  }

  return Array.from(byMovement.entries()).map(([movementName, history]) => ({
    movementName,
    currentRm: history[0].weightKg,
    history: history.map(r => ({
      id: r.id,
      weightKg: r.weightKg,
      recordedAt: r.recordedAt,
      notes: r.notes,
    })),
    improvement: history.length > 1
      ? +(history[0].weightKg - history[history.length - 1].weightKg).toFixed(1)
      : 0,
  }))
}

export async function createRm(userId: string, gymId: string, data: CreateRmInput) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  try {
    return await prisma.rmRecord.create({
      data: {
        userId,
        movementName: data.movementName,
        weightKg: data.weightKg,
        notes: data.notes,
        recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
      },
    })
  } catch (err) {
    handlePrismaError(err)
  }
}

export async function getGymRmEvolution(gymId: string) {
  const records = await prisma.rmRecord.findMany({
    where: { user: { gymId } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { recordedAt: 'asc' },
  })

  const byMovement = new Map<string, any[]>()
  for (const r of records) {
    if (!byMovement.has(r.movementName)) byMovement.set(r.movementName, [])
    byMovement.get(r.movementName)!.push({
      userId: r.user.id,
      userName: r.user.name,
      weightKg: r.weightKg,
      recordedAt: r.recordedAt,
    })
  }

  return Array.from(byMovement.entries()).map(([movementName, records]) => ({
    movementName,
    totalRecords: records.length,
    avgKg: +(records.reduce((s: number, r: any) => s + r.weightKg, 0) / records.length).toFixed(1),
    maxKg: Math.max(...records.map((r: any) => r.weightKg)),
    records,
  }))
}

export async function getGymnasticProgressByUser(userId: string, gymId: string) {
  const targetUser = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!targetUser) return null

  const records = await prisma.gymnasticProgress.findMany({
    where: { userId },
    orderBy: { achievedAt: 'desc' },
  })

  const bySkill = new Map<string, typeof records>()
  for (const r of records) {
    if (!bySkill.has(r.skillName)) bySkill.set(r.skillName, [])
    bySkill.get(r.skillName)!.push(r)
  }

  return Array.from(bySkill.entries()).map(([skillName, milestones]) => ({
    skillName,
    milestonesAchieved: milestones.length,
    latestMilestone: milestones[0].milestone,
    latestAchievedAt: milestones[0].achievedAt,
    history: milestones,
  }))
}

export async function createGymnasticProgress(
  userId: string,
  gymId: string,
  data: CreateGymnasticProgressInput,
) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  try {
    return await prisma.gymnasticProgress.create({
      data: {
        userId,
        skillName: data.skillName,
        milestone: data.milestone,
        notes: data.notes,
        achievedAt: data.achievedAt ? new Date(data.achievedAt) : new Date(),
      },
    })
  } catch (err) {
    handlePrismaError(err)
  }
}
