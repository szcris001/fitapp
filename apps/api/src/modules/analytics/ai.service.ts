import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prisma'
import { HttpError } from '../../lib/http-error'
import { atRiskMembersWhere } from './retention'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export async function getRetentionAlerts(gymId: string) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const [membersAtRisk, expiringSoon, inactiveMembers] = await Promise.all([
    prisma.user.findMany({
      where: atRiskMembersWhere(gymId),
      select: {
        id: true,
        name: true,
        email: true,
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        memberships: {
          where: { status: 'ACTIVE' },
          select: { endsAt: true },
          take: 1,
        },
      },
    }),
    prisma.membership.findMany({
      where: {
        user: { gymId },
        status: 'ACTIVE',
        endsAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        gymId,
        role: 'MEMBER',
        memberships: { none: { status: 'ACTIVE' } },
        updatedAt: { gte: fourteenDaysAgo },
      },
      select: { id: true, name: true, email: true },
      take: 20,
    }),
  ])

  return {
    atRisk: membersAtRisk.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      lastBooking: m.bookings[0]?.createdAt || null,
      membershipEndsAt: m.memberships[0]?.endsAt || null,
      alert: 'Sin reservas en los últimos 7 días',
    })),
    expiringSoon: expiringSoon.map(m => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      plan: m.plan.name,
      endsAt: m.endsAt,
      daysLeft: Math.ceil((m.endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    })),
    inactive: inactiveMembers,
  }
}

export async function getAiInsights(gymId: string) {
  const [stats, topMovements, recentBookings] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      where: { gymId },
      _count: true,
    }),
    prisma.rmRecord.groupBy({
      by: ['movementName'],
      where: { user: { gymId } },
      _count: true,
      orderBy: { _count: { movementName: 'desc' } },
      take: 5,
    }),
    prisma.booking.count({
      where: {
        class: { gymId },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  const totalMembers = stats.find(s => s.role === 'MEMBER')?._count || 0

  const prompt = `Eres un asistente de gestión para un box de CrossFit en LATAM. 
Analiza estos datos y da 3 recomendaciones concretas y accionables en español:

- Total de miembros: ${totalMembers}
- Reservas últimos 30 días: ${recentBookings}
- Movimientos más registrados: ${topMovements.map(m => m.movementName).join(', ')}
- Promedio reservas por miembro: ${totalMembers ? (recentBookings / totalMembers).toFixed(1) : 0}

Responde en formato JSON con esta estructura exacta:
{
  "insights": [
    {"title": "título corto", "description": "descripción accionable", "priority": "high|medium|low"},
    {"title": "título corto", "description": "descripción accionable", "priority": "high|medium|low"},
    {"title": "título corto", "description": "descripción accionable", "priority": "high|medium|low"}
  ],
  "summary": "resumen ejecutivo en 2 oraciones"
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Respuesta inesperada de IA')

  try {
    const clean = content.text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { raw: content.text }
  }
}

export async function getAthleteProjection(gymId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new HttpError(404, 'Usuario no encontrado')

  const [rmRecords, gymnasticProgress, attendanceCount] = await Promise.all([
    prisma.rmRecord.findMany({
      where: { userId },
      orderBy: { recordedAt: 'asc' },
    }),
    prisma.gymnasticProgress.findMany({
      where: { userId },
      orderBy: { achievedAt: 'desc' },
    }),
    prisma.booking.count({
      where: {
        userId,
        status: 'ATTENDED',
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  const rmSummary = Object.entries(
    rmRecords.reduce((acc: Record<string, number[]>, r) => {
      if (!acc[r.movementName]) acc[r.movementName] = []
      acc[r.movementName].push(r.weightKg)
      return acc
    }, {})
  ).map(([movement, weights]) => ({
    movement,
    initial: weights[0],
    current: weights[weights.length - 1],
    improvement: +(weights[weights.length - 1] - weights[0]).toFixed(1),
  }))

  const prompt = `Eres un coach de CrossFit experto. Analiza el progreso de este atleta y da proyecciones personalizadas en español.

Atleta: ${user.name}
Clases asistidas (últimos 90 días): ${attendanceCount}
Progreso en levantamientos:
${rmSummary.map(r => `- ${r.movement}: inició en ${r.initial}kg, actualmente ${r.current}kg (+${r.improvement}kg)`).join('\n')}
Habilidades gimnásticas logradas:
${gymnasticProgress.map(g => `- ${g.skillName}: ${g.milestone}`).join('\n') || '- Sin registros aún'}

Responde en JSON con esta estructura exacta:
{
  "projections": [
    {"movement": "nombre", "currentKg": 0, "projectedKg": 0, "weeksToGoal": 0, "confidence": "high|medium|low"}
  ],
  "nextMilestones": [
    {"skill": "nombre habilidad", "nextMilestone": "próximo hito sugerido", "estimatedWeeks": 0}
  ],
  "coachTip": "consejo personalizado de 2-3 oraciones para este atleta"
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Respuesta inesperada de IA')

  try {
    const clean = content.text.replace(/```json|```/g, '').trim()
    return { athlete: user.name, ...JSON.parse(clean) }
  } catch {
    return { athlete: user.name, raw: content.text }
  }
}
