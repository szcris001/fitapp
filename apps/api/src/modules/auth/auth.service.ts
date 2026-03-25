import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { RegisterInput, LoginInput } from './auth.schema'

export async function registerGym(data: RegisterInput) {
  const existingGym = await prisma.gym.findUnique({
    where: { slug: data.gymSlug },
  })
  if (existingGym) throw new Error('El slug del gimnasio ya está en uso')

  const passwordHash = await bcrypt.hash(data.password, 10)

  const gym = await prisma.gym.create({
    data: {
      name: data.gymName,
      slug: data.gymSlug,
      users: {
        create: {
          name: data.adminName,
          email: data.email,
          passwordHash,
          role: 'ADMIN',
        },
      },
    },
    include: { users: true },
  })

  const admin = gym.users[0]
  return { gymId: gym.id, userId: admin.id, email: admin.email, role: admin.role }
}

export async function loginUser(data: LoginInput) {
  const superAdmin = await prisma.user.findFirst({
    where: { email: data.email, role: 'SUPER_ADMIN' },
  })

  if (superAdmin) {
    const valid = await bcrypt.compare(data.password, superAdmin.passwordHash)
    if (!valid) throw new Error('Credenciales inválidas')
    return {
      userId: superAdmin.id,
      gymId: null,
      email: superAdmin.email,
      name: superAdmin.name,
      role: superAdmin.role,
    }
  }

  const gym = await prisma.gym.findUnique({ where: { slug: data.gymSlug } })
  if (!gym) throw new Error('Gimnasio no encontrado')
  if (gym.status === 'SUSPENDED') throw new Error('Este gimnasio está suspendido')

  const user = await prisma.user.findFirst({
    where: { gymId: gym.id, email: data.email },
  })
  if (!user) throw new Error('Credenciales inválidas')

  const valid = await bcrypt.compare(data.password, user.passwordHash)
  if (!valid) throw new Error('Credenciales inválidas')

  return {
    userId: user.id,
    gymId: gym.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }
}
