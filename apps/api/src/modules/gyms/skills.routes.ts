import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'

const DEFAULT_SKILLS = [
  {
    name: 'Handstand Walk',
    milestones: ['Wall walk', 'Kick to wall', 'Handstand hold 10s', 'Handstand walk 5m', 'Handstand walk 10m']
  },
  {
    name: 'Double Under',
    milestones: ['Single under x50', 'Double under x1', 'Double under x10', 'Double under x30', 'Double under x50']
  },
  {
    name: 'HSPU',
    milestones: ['Pike push up', 'HSPU con banda', 'HSPU negativo', 'HSPU estricto x1', 'HSPU kipping x5']
  },
  {
    name: 'Toes to Bar',
    milestones: ['Hanging knee raise', 'Toes to bar x1', 'TTB x5', 'TTB x10', 'TTB en serie x15']
  },
  {
    name: 'Rope Climb',
    milestones: ['Rope hang 30s', 'Legless pull', 'Rope climb 1 vuelta', 'Rope climb sin piernas', 'Rope climb x3']
  },
  {
    name: 'Bar Muscle Up',
    milestones: ['Pull up estricto x5', 'C2B pull up', 'BMU negativo', 'BMU kipping x1', 'BMU en serie x3']
  },
]

export async function skillRoutes(app: FastifyInstance) {
  app.get('/skills', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    // Check total (including inactive) to avoid re-seeding after deactivation
    const total = await prisma.gymSkill.count({ where: { gymId: user.gymId } })
    if (total === 0) {
      for (let i = 0; i < DEFAULT_SKILLS.length; i++) {
        const s = DEFAULT_SKILLS[i]
        await prisma.gymSkill.create({
          data: {
            gymId: user.gymId, name: s.name, order: i,
            milestones: {
              create: s.milestones.map((m, j) => ({ name: m, order: j }))
            }
          },
        })
      }
    }
    const skills = await prisma.gymSkill.findMany({
      where: { gymId: user.gymId, isActive: true },
      include: { milestones: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    })
    return reply.send(skills)
  })

  app.post('/skills', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { name, description, milestones } = request.body as any
    if (!name) return reply.status(400).send({ error: 'Nombre requerido' })
    const count = await prisma.gymSkill.count({ where: { gymId: user.gymId } })
    const skill = await prisma.gymSkill.create({
      data: {
        gymId: user.gymId, name, description, order: count,
        milestones: {
          create: (milestones || []).map((m: string, i: number) => ({ name: m, order: i }))
        }
      },
      include: { milestones: { orderBy: { order: 'asc' } } }
    })
    return reply.status(201).send(skill)
  })

  app.put('/skills/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const { name, description, isActive, milestones } = request.body as any
    const skill = await prisma.gymSkill.findFirst({ where: { id, gymId: user.gymId } })
    if (!skill) return reply.status(404).send({ error: 'Habilidad no encontrada' })
    const updated = await prisma.gymSkill.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { milestones: { orderBy: { order: 'asc' } } }
    })
    if (milestones) {
      await prisma.gymSkillMilestone.deleteMany({ where: { skillId: id } })
      await prisma.gymSkillMilestone.createMany({
        data: milestones.map((m: string, i: number) => ({ skillId: id, name: m, order: i }))
      })
    }
    return reply.send(updated)
  })

  app.delete('/skills/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const skill = await prisma.gymSkill.findFirst({ where: { id, gymId: user.gymId } })
    if (!skill) return reply.status(404).send({ error: 'Habilidad no encontrada' })
    await prisma.gymSkill.update({ where: { id }, data: { isActive: false } })
    return reply.send({ message: 'Habilidad desactivada' })
  })
}
