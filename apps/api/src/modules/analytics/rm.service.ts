import { prisma } from '../../lib/prisma'
import { CreateRmInput, CreateGymnasticProgressInput } from './rm.schema'
import { handlePrismaError } from '../../lib/prismaError'

export async function getRmsByUser(userId: string, gymId: string) {
  const targetUser = await prisma.user.findFirst({ where: { id: userId, gymId }, select: { id: true } })
  if (!targetUser) return null

  const records = await prisma.rmRecord.findMany({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
  })

  // Agrupar por nombre normalizado (trim + minúsculas) — sin esto, "Back Squat",
  // "back squat" y "Back Squat " (espacio de más) quedaban como 3 movimientos
  // distintos en vez de 1 historial consolidado (QA 2026-10-30).
  const byMovement = new Map<string, typeof records>()
  for (const r of records) {
    const key = r.movementName.trim().toLowerCase()
    if (!byMovement.has(key)) byMovement.set(key, [])
    byMovement.get(key)!.push(r)
  }

  return Array.from(byMovement.values()).map((history) => {
    // "Récord" es el mejor peso logrado, no el último registrado — con "más
    // reciente" como actual, un día flojo (o una fecha mal puesta) enterraba el
    // PR real sin ningún aviso (QA 2026-10-30). history ya viene ordenado por
    // recordedAt desc (query de arriba), así que el último elemento es el primer
    // registro histórico, usado para medir la mejora total.
    const best = history.reduce((max, r) => (r.weightKg > max.weightKg ? r : max), history[0])
    const oldest = history[history.length - 1]
    return {
      movementName: history[0].movementName,
      currentRm: best.weightKg,
      history: history.map(r => ({
        id: r.id,
        weightKg: r.weightKg,
        recordedAt: r.recordedAt,
        notes: r.notes,
      })),
      improvement: history.length > 1 ? +(best.weightKg - oldest.weightKg).toFixed(1) : 0,
    }
  })
}

export async function createRm(userId: string, gymId: string, data: CreateRmInput) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId }, select: { id: true } })
  if (!user) throw new Error('Usuario no encontrado')

  try {
    return await prisma.rmRecord.create({
      data: {
        userId,
        movementName: data.movementName.trim(),
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
  const targetUser = await prisma.user.findFirst({ where: { id: userId, gymId }, select: { id: true } })
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
  const user = await prisma.user.findFirst({ where: { id: userId, gymId }, select: { id: true } })
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
  } catch (err: any) {
    // Doble tap en mobile disparaba 2 POST casi simultáneos del mismo hito,
    // creando 2 filas idénticas (sin @@unique no había nada que lo evitara) — la
    // ficha del alumno en el panel web contaba filas crudas, inflando el número
    // de hitos logrados (QA 2026-10-30). Idempotente: el segundo toque devuelve
    // el mismo registro en vez de un error.
    if (err?.code === 'P2002') {
      return prisma.gymnasticProgress.findUniqueOrThrow({
        where: { userId_skillName_milestone: { userId, skillName: data.skillName, milestone: data.milestone } },
      })
    }
    handlePrismaError(err)
  }
}
