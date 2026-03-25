import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createClassTypeSchema, createClassSchema, bookingSchema } from './classes.schema'
import { listClassTypes, createClassType, listClasses, getClassById, createClass, bookClass, cancelBooking, getAttendanceBySchedule } from './classes.service'
import { prisma } from '../../lib/prisma'

export async function classRoutes(app: FastifyInstance) {
  app.get('/class-types', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await listClassTypes(user.gymId))
  })

  app.post('/class-types', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createClassTypeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    return reply.status(201).send(await createClassType(user.gymId, parsed.data))
  })

  app.get('/classes', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { from, to } = request.query as any
    const classes = await listClasses(user.gymId, from, to)
    const myBookings = await prisma.booking.findMany({
      where: { userId: user.userId, class: { gymId: user.gymId }, status: { in: ['CONFIRMED', 'ATTENDED'] } },
      select: { classId: true, status: true },
    })
    const bookedClassIds = new Set(myBookings.map(b => b.classId))
    return reply.send(classes.map(cls => ({
      ...cls,
      myBookingStatus: bookedClassIds.has(cls.id) ? myBookings.find(b => b.classId === cls.id)?.status : null,
    })))
  })

  app.get('/classes/attendance', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await getAttendanceBySchedule(user.gymId))
  })

  app.get('/classes/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    try {
      return reply.send(await getClassById(user.gymId, id))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.post('/classes', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createClassSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.status(201).send(await createClass(user.gymId, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/bookings', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = bookingSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      return reply.status(201).send(await bookClass(user.gymId, user.userId, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.delete('/bookings/:classId', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    try {
      return reply.send(await cancelBooking(user.gymId, user.userId, classId))
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  app.patch('/bookings/:bookingId/attend', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { bookingId } = request.params as any
    try {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, class: { gymId: user.gymId } },
      })
      if (!booking) return reply.status(404).send({ error: 'Reserva no encontrada' })
      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'ATTENDED' },
      })
      return reply.send(updated)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  app.get('/my-bookings', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const bookings = await prisma.booking.findMany({
      where: {
        userId: user.userId,
        status: { in: ['CONFIRMED', 'WAITLIST', 'ATTENDED'] },
        class: { gymId: user.gymId },
      },
      include: {
        class: {
          include: {
            classType: { select: { id: true, name: true, color: true } },
            bookings: {
              where: { status: { in: ['CONFIRMED', 'ATTENDED', 'WAITLIST'] } },
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: { class: { startsAt: 'asc' } },
    })
    return reply.send(bookings)
  })
}