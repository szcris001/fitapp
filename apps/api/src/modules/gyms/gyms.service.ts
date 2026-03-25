import { prisma } from '../../lib/prisma'
import { UpdateGymInput } from './gyms.schema'

export async function getGym(gymId: string) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      brandColors: true,
      bookingWindowDays: true,
      address: true,
      phone: true,
      email: true,
      instagram: true,
      facebook: true,
      termsAndConditions: true,
      createdAt: true,
    },
  })
  if (!gym) throw new Error('Gimnasio no encontrado')
  return gym
}

export async function updateGym(gymId: string, data: UpdateGymInput) {
  return prisma.gym.update({
    where: { id: gymId },
    data,
  })
}

export async function getGymStats(gymId: string) {
  const [totalMembers, activeMembers, trialMembers, inactiveMembers, todayClasses] =
    await Promise.all([
      prisma.user.count({ where: { gymId, role: 'MEMBER' } }),
      prisma.membership.count({
        where: { user: { gymId }, status: 'ACTIVE' },
      }),
      prisma.membership.count({
        where: { user: { gymId }, status: 'TRIAL' },
      }),
      prisma.membership.count({
        where: { user: { gymId }, status: 'INACTIVE' },
      }),
      prisma.class.count({
        where: {
          gymId,
          startsAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
    ])

  const expiringMemberships = await prisma.membership.findMany({
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
    orderBy: { endsAt: 'asc' },
  })

  return {
    members: { total: totalMembers, active: activeMembers, trial: trialMembers, inactive: inactiveMembers },
    todayClasses,
    expiringMemberships,
  }
}
