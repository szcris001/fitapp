import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { CreateUserInput, UpdateUserInput } from './users.schema'
import { handlePrismaError } from '../../lib/prismaError'

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
      // Membresía actual para la lista: la última que no sea una transferencia en revisión
      // (el plan vigente sigue activo mientras el admin revisa el comprobante)
      memberships: {
        where: { OR: [{ transferStatus: null }, { transferStatus: { not: 'PENDING_REVIEW' } }] },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const filtered = status && status !== 'all'
    ? users.filter(u => u.memberships[0]?.status === status)
    : users

  return filtered // passwordHash lo omite el cliente de Prisma (lib/prisma.ts)
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
      bookings: {
        where: { status: 'ATTENDED' },
        orderBy: { attendedAt: 'desc' },
        take: 20,
        select: {
          id: true, attendedAt: true,
          class: { select: { startsAt: true, classType: { select: { name: true } } } },
        },
      },
      _count: { select: { bookings: { where: { status: 'ATTENDED' } } } },
    },
  })
  if (!user) throw new Error('Usuario no encontrado')
  return user
}

export async function createUser(gymId: string | null, data: CreateUserInput) {
  if (!gymId) throw new Error('Operación no permitida: el usuario no tiene un gimnasio asignado')

  const roleLabel: Record<string, string> = { MEMBER: 'alumno', COACH: 'coach', ADMIN: 'administrador' }

  const existingEmail = await prisma.user.findFirst({ where: { gymId, email: data.email } })
  if (existingEmail) {
    const label = roleLabel[existingEmail.role] ?? existingEmail.role
    throw new Error(`El email ya está registrado en este gimnasio como ${label}`)
  }

  if (data.rut) {
    const existingRut = await prisma.user.findFirst({ where: { gymId, rut: data.rut } })
    if (existingRut) {
      const label = roleLabel[existingRut.role] ?? existingRut.role
      throw new Error(`El RUT ya está registrado en este gimnasio como ${label} (${existingRut.name})`)
    }
  }

  const passwordHash = await bcrypt.hash(data.password, 10)

  try {
    const created = await prisma.user.create({
      data: {
        gymId,
        name: data.name,
        email: data.email,
        passwordHash,
        phone: data.phone,
        gender: data.gender,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        source: data.source,
        role: data.role || 'MEMBER',
        rut: data.rut || null,
      },
    })
    return created
  } catch (err) {
    handlePrismaError(err)
  }
}

// Cuenta los ADMIN del gym sin contar a userId — usado antes de bajarle el rol a un
// ADMIN o de borrar su cuenta, para no dejar el gym sin nadie que lo administre.
export async function countOtherAdmins(gymId: string, userId: string) {
  return prisma.user.count({ where: { gymId, role: 'ADMIN', NOT: { id: userId } } })
}

export async function updateUser(gymId: string | null, userId: string, data: UpdateUserInput) {
  if (!gymId) throw new Error('Operación no permitida: el usuario no tiene un gimnasio asignado')

  const user = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!user) throw new Error('Usuario no encontrado')

  if (user.role === 'ADMIN' && data.role && data.role !== 'ADMIN') {
    if (await countOtherAdmins(gymId, userId) === 0) {
      throw new Error('No puedes quitarle el rol de administrador: es el único administrador del gimnasio')
    }
  }

  if (data.email) {
    const existing = await prisma.user.findFirst({ where: { gymId, email: data.email, NOT: { id: userId } } })
    if (existing) throw new Error('El email ya está en uso en este gimnasio')
  }

  if (data.rut) {
    const existingRut = await prisma.user.findFirst({ where: { gymId, rut: data.rut, NOT: { id: userId } } })
    if (existingRut) throw new Error(`El RUT ya está registrado en este gimnasio (${existingRut.name})`)
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        gender: data.gender,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        source: data.source,
        role: data.role,
        ...(data.rut !== undefined && { rut: data.rut || null }),
      },
    })
    return updated
  } catch (err) {
    handlePrismaError(err)
  }
}
