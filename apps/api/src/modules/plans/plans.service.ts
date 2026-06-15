import { prisma } from '../../lib/prisma'
import { CreatePlanInput, UpdatePlanInput, CreateMembershipInput } from './plans.schema'
import { handlePrismaError } from '../../lib/prismaError'

export async function listPlans(gymId: string) {
  return prisma.plan.findMany({
    where: { gymId, isActive: true },
    orderBy: { priceCents: 'asc' },
  })
}

export async function createPlan(gymId: string, data: CreatePlanInput) {
  try {
    return await prisma.plan.create({ data: { ...data, gymId } })
  } catch (err) {
    handlePrismaError(err)
  }
}

export async function updatePlan(gymId: string, planId: string, data: UpdatePlanInput) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, gymId } })
  if (!plan) throw new Error('Plan no encontrado')
  try {
    return await prisma.plan.update({
      where: { id: planId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priceCents !== undefined && { priceCents: data.priceCents }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.durationDays !== undefined && { durationDays: data.durationDays }),
        ...(data.maxClasses !== undefined && { maxClasses: data.maxClasses }),
        ...(data.isTrial !== undefined && { isTrial: data.isTrial }),
      },
    })
  } catch (err) {
    handlePrismaError(err)
  }
}

export async function deactivatePlan(gymId: string, planId: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, gymId } })
  if (!plan) throw new Error('Plan no encontrado')
  return prisma.plan.update({ where: { id: planId }, data: { isActive: false } })
}

export async function assignMembership(gymId: string, data: CreateMembershipInput) {
  const user = await prisma.user.findFirst({ where: { id: data.userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  const plan = await prisma.plan.findFirst({ where: { id: data.planId, gymId } })
  if (!plan) throw new Error('Plan no encontrado')

  const startsAt = new Date(data.startsAt)
  const endsAt = new Date(startsAt)
  endsAt.setDate(endsAt.getDate() + 30)

  await prisma.membership.updateMany({
    where: { userId: data.userId, status: { in: ['ACTIVE', 'TRIAL'] } },
    data: { status: 'INACTIVE' },
  })

  const status = plan.isTrial ? 'TRIAL' : data.status
  const pricePaid = plan.isTrial ? 0 : plan.priceCents

  try {
    return await prisma.membership.create({
      data: {
        userId: data.userId,
        planId: data.planId,
        status,
        startsAt,
        endsAt,
        pricePaid,
        currency: plan.currency,
      },
      include: {
        plan: { select: { name: true, durationDays: true } },
        user: { select: { name: true, email: true } },
      },
    })
  } catch (err) {
    handlePrismaError(err)
  }
}

export async function renewMembership(gymId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  const lastMembership = await prisma.membership.findFirst({
    where: { userId, user: { gymId } },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  })
  if (!lastMembership) throw new Error('No hay membresía previa para renovar')

  await prisma.membership.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
    data: { status: 'INACTIVE' },
  })

  const startsAt = new Date()
  const endsAt = new Date()
  endsAt.setDate(endsAt.getDate() + 30)

  try {
    return await prisma.membership.create({
      data: {
        userId,
        planId: lastMembership.planId,
        status: 'ACTIVE',
        startsAt,
        endsAt,
        pricePaid: lastMembership.plan.priceCents,
        currency: lastMembership.plan.currency,
      },
      include: {
        plan: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
    })
  } catch (err) {
    handlePrismaError(err)
  }
}

export async function updateMembership(
  gymId: string,
  membershipId: string,
  data: {
    status?: 'ACTIVE' | 'INACTIVE' | 'TRIAL'
    extendDays?: number
    reversalNotes?: string
  },
) {
  // Verificar que la membresía pertenece a este gym (multi-tenancy)
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, user: { gymId } },
  })
  if (!membership) throw new Error('Membresía no encontrada')

  const updateData: Record<string, unknown> = {}

  if (data.status !== undefined) {
    updateData.status = data.status
  }

  if (data.extendDays && data.extendDays > 0) {
    // Extender desde endsAt actual, o desde ahora si ya venció
    const base = membership.endsAt > new Date() ? membership.endsAt : new Date()
    const newEndsAt = new Date(base)
    newEndsAt.setDate(newEndsAt.getDate() + data.extendDays)
    updateData.endsAt = newEndsAt
    // Si se extiende y no se especificó status explícito, activar automáticamente
    if (data.status === undefined) updateData.status = 'ACTIVE'
  }

  if (data.reversalNotes !== undefined) {
    updateData.paymentNotes = data.reversalNotes
    updateData.status = 'INACTIVE'
  }

  return prisma.membership.update({
    where: { id: membershipId },
    data: updateData,
    include: {
      plan: { select: { name: true, durationDays: true } },
      user: { select: { name: true, email: true } },
    },
  })
}
