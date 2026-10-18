import { prisma } from '../../lib/prisma'

// Reusa la misma ventana semestral que ConsistencyBadge (1 ene / 1 jul) — es una función
// pura sin nada específico de constancia, no vale la pena duplicarla acá.
import type { SemesterWindow } from '../consistency/consistency.service'
export type { SemesterWindow }

// ─── Config por tipo de pilar ───────────────────────────────────────────────

export type StrengthConfig = { minMovements: number; minImprovementPct: number }
export type AttendanceConfig = { minClassesAttended: number }
export type GymnasticsConfig = { minMilestonesUnlocked: number }
export type TenureConfig = { milestonesMonths: number[] }

export const DEFAULT_PILLAR_CONFIG: Record<string, unknown> = {
  STRENGTH: { minMovements: 3, minImprovementPct: 10 } satisfies StrengthConfig,
  ATTENDANCE: { minClassesAttended: 60 } satisfies AttendanceConfig,
  GYMNASTICS: { minMilestonesUnlocked: 3 } satisfies GymnasticsConfig,
  TENURE: { milestonesMonths: [6, 12, 24, 36, 60] } satisfies TenureConfig,
  MANUAL: {},
}

// ─── Cálculo puro por pilar (sin side-effects) ──────────────────────────────

/** Compara, por movimiento, el primer vs. último registro de RM dentro de la ventana. */
export async function calculateStrength(userId: string, window: SemesterWindow, config: StrengthConfig) {
  const records = await prisma.rmRecord.findMany({
    where: { userId, recordedAt: { gte: window.periodStart, lt: window.periodEnd } },
    orderBy: { recordedAt: 'asc' },
  })

  const byMovement = new Map<string, typeof records>()
  for (const r of records) {
    const list = byMovement.get(r.movementName)
    if (list) list.push(r)
    else byMovement.set(r.movementName, [r])
  }

  const improved: { movementName: string; fromKg: number; toKg: number; improvementPct: number }[] = []
  for (const [movementName, history] of byMovement) {
    if (history.length < 2) continue // sin 2 registros en la ventana no hay mejora que medir
    const fromKg = history[0].weightKg
    const toKg = history[history.length - 1].weightKg
    const improvementPct = +(((toKg - fromKg) / fromKg) * 100).toFixed(1)
    if (improvementPct >= config.minImprovementPct) improved.push({ movementName, fromKg, toKg, improvementPct })
  }

  return { improved, qualifies: improved.length >= config.minMovements }
}

/** Clases ATTENDED dentro de la ventana, del gym (vía la clase, Booking no tiene gymId propio). */
export async function calculateAttendance(gymId: string, userId: string, window: SemesterWindow, config: AttendanceConfig) {
  const classesAttended = await prisma.booking.count({
    where: { userId, status: 'ATTENDED', class: { gymId, startsAt: { gte: window.periodStart, lt: window.periodEnd } } },
  })
  return { classesAttended, qualifies: classesAttended >= config.minClassesAttended }
}

/** Hitos de gimnasia marcados dentro de la ventana. */
export async function calculateGymnastics(userId: string, window: SemesterWindow, config: GymnasticsConfig) {
  const unlocked = await prisma.gymnasticProgress.findMany({
    where: { userId, achievedAt: { gte: window.periodStart, lt: window.periodEnd } },
    orderBy: { achievedAt: 'asc' },
  })
  return { unlocked, qualifies: unlocked.length >= config.minMilestonesUnlocked }
}

/** Hitos de antigüedad ya vencidos (createdAt + months <= today) — tolerante a que el
 * cron se haya atrasado, no exige que el hito caiga justo hoy. El caller filtra los que
 * ya tienen award (vía el @@unique de PillarAward). */
export function dueTenureMilestones(createdAt: Date, milestonesMonths: number[], today: Date) {
  return milestonesMonths
    .map(months => {
      const thresholdDate = new Date(createdAt)
      thresholdDate.setUTCMonth(thresholdDate.getUTCMonth() + months)
      return { months, thresholdDate }
    })
    .filter(({ thresholdDate }) => thresholdDate <= today)
}

// ─── Snapshot de metadata por tipo (lo que explica por qué se ganó el award) ─

function metadataFor(type: string, result: any, config: unknown) {
  if (type === 'STRENGTH') return { improved: result.improved, ...(config as object) }
  if (type === 'ATTENDANCE') return { classesAttended: result.classesAttended, ...(config as object) }
  if (type === 'GYMNASTICS') return { milestonesUnlocked: result.unlocked, ...(config as object) }
  return {}
}

// ─── Orquestadores (otorgan, idempotentes vía @@unique) ─────────────────────

/** Pilares STRENGTH/ATTENDANCE/GYMNASTICS activos del gym, para todos sus MEMBER. */
export async function awardSemesterPillarsForGym(gymId: string, window: SemesterWindow) {
  const pillars = await prisma.pillar.findMany({
    where: { gymId, isActive: true, type: { in: ['STRENGTH', 'ATTENDANCE', 'GYMNASTICS'] } },
  })
  if (pillars.length === 0) return 0

  const members = await prisma.user.findMany({ where: { gymId, role: 'MEMBER' }, select: { id: true } })

  let awarded = 0
  for (const member of members) {
    for (const pillar of pillars) {
      const config = pillar.config as any
      const result = pillar.type === 'STRENGTH'
        ? await calculateStrength(member.id, window, config)
        : pillar.type === 'ATTENDANCE'
          ? await calculateAttendance(gymId, member.id, window, config)
          : await calculateGymnastics(member.id, window, config)

      if (!result.qualifies) continue
      try {
        await prisma.pillarAward.create({
          data: {
            gymId,
            userId: member.id,
            pillarId: pillar.id,
            periodStart: window.periodStart,
            periodEnd: window.periodEnd,
            metadata: metadataFor(pillar.type, result, config),
          },
        })
        awarded++
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err // ya otorgado ese período — no-op
      }
    }
  }
  return awarded
}

/** Pilar TENURE activo del gym — corre diario, independiente del corte semestral. */
export async function awardTenurePillarsForGym(gymId: string, today: Date) {
  const pillar = await prisma.pillar.findFirst({ where: { gymId, isActive: true, type: 'TENURE' } })
  if (!pillar) return 0

  const { milestonesMonths } = pillar.config as TenureConfig
  const members = await prisma.user.findMany({ where: { gymId, role: 'MEMBER' }, select: { id: true, createdAt: true } })

  let awarded = 0
  for (const member of members) {
    for (const { months, thresholdDate } of dueTenureMilestones(member.createdAt, milestonesMonths, today)) {
      try {
        await prisma.pillarAward.create({
          data: {
            gymId,
            userId: member.id,
            pillarId: pillar.id,
            periodStart: thresholdDate,
            periodEnd: null,
            metadata: { milestoneMonths: months, memberSince: member.createdAt },
          },
        })
        awarded++
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err
      }
    }
  }
  return awarded
}

// ─── Seed inicial por gym nuevo ──────────────────────────────────────────────

type TxOrPrisma = Pick<typeof prisma, 'pillar'>

/** Idempotente: si el gym ya tiene algún pilar, no hace nada (evita duplicar en reintentos). */
export async function seedDefaultPillarsForGym(gymId: string, tx: TxOrPrisma = prisma) {
  const existing = await tx.pillar.count({ where: { gymId } })
  if (existing > 0) return

  await tx.pillar.createMany({
    data: [
      { gymId, type: 'STRENGTH', name: 'Fuerza', icon: '💪', order: 0, config: DEFAULT_PILLAR_CONFIG.STRENGTH as object },
      { gymId, type: 'ATTENDANCE', name: 'Asistencia', icon: '📅', order: 1, config: DEFAULT_PILLAR_CONFIG.ATTENDANCE as object },
      { gymId, type: 'TENURE', name: 'Antigüedad', icon: '🎖️', order: 2, config: DEFAULT_PILLAR_CONFIG.TENURE as object },
      { gymId, type: 'GYMNASTICS', name: 'Gimnasia', icon: '🤸', order: 3, config: DEFAULT_PILLAR_CONFIG.GYMNASTICS as object },
      { gymId, type: 'MANUAL', name: 'Mejor compañero', icon: '🤝', order: 4, config: {} },
    ],
  })
}
