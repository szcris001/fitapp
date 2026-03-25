import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { CreateUserInput, UpdateUserInput } from './users.schema'

export async function listUsers(gymId: string, status?: string, role?: string) {
  const where: any = { gymId }

  if (role) {
    const roles = role.split(',').map(r => r.trim())
    where.role = { in: roles }
  } else {
    where.role = 'MEMBER'
  }

  const users = await prisma.user.findMany({
    where,
    include: {
      memberships: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (status && status !== 'all') {
    return users.filter(u => u.memberships[0]?.status === status)
  }

  return users
}

export async function getUserById(gymId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, gymId },
    include: {
      memberships: {
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { name: true, durationDays: true, priceCents: true, currency: true } } },
      },
      rmRecords: { orderBy: { recordedAt: 'desc' } },
      gymnasticProgress: { orderBy: { achievedAt: 'desc' } },
    },
  })
  if (!user) throw new Error('Usuario no encontrado')
  return user
}

export async function createUser(gymId: string, data: CreateUserInput) {
  const existing = await prisma.user.findFirst({ where: { email: data.email } })
  if (existing) throw new Error('El email ya está registrado')

  const passwordHash = await bcrypt.hash(data.password, 10)

  return prisma.user.create({
    data: {
      gymId,
      name: data.name,
      email: data.email,
      passwordHash,
      phone: data.phone,
      gender: data.gender,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      role: data.role || 'MEMBER',
    },
  })
}

export async function updateUser(gymId: string, userId: string, data: UpdateUserInput) {
  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  return prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      phone: data.phone,
      gender: data.gender,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
    },
  })
}
