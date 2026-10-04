import { FastifyInstance } from 'fastify'
import { authenticate, requireAdmin, requireCoachOrAdmin } from '../../middlewares/auth.middleware'
import { createClassTypeSchema, createClassSchema, bookingSchema, updateClassAllowedPlansSchema } from './classes.schema'
import { listClassTypes, createClassType, updateClassType, deleteClassType, listClasses, getClassById, createClass, bookClass, cancelBooking, confirmWaitlistBooking, getAttendanceBySchedule, assignUserToClass, removeStudentByAdmin, assertPlansBelongToGym } from './classes.service'
import { prisma } from '../../lib/prisma'
import { prismaErrorMessage } from '../../lib/prismaError'
import { HttpError } from '../../lib/http-error'

export async function classRoutes(app: FastifyInstance) {
  app.get('/class-types', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    return reply.send(await listClassTypes(user.gymId))
  })

  app.post('/class-types', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const parsed = createClassTypeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    return reply.status(201).send(await createClassType(user.gymId, parsed.data))
  })

  app.put('/class-types/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const parsed = createClassTypeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      return reply.send(await updateClassType(user.gymId, id, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.delete('/class-types/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    try {
      await deleteClassType(user.gymId, id)
      return reply.status(204).send()
    } catch (err: any) {
      if (err instanceof HttpError) throw err // handlePrismaError: mensaje y status ya correctos (p.ej. 409 por FK)
      return reply.status(400).send({ error: err.message })
    }
  })

  app.get('/classes', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { from, to } = request.query as any
    const classes = await listClasses(user.gymId, from, to)
    const myBookings = await prisma.booking.findMany({
      where: { userId: user.userId, class: { gymId: user.gymId }, status: { in: ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'] } },
      select: { classId: true, status: true },
    })
    const bookedClassIds = new Set(myBookings.map(b => b.classId))
    return reply.send(classes.map(cls => ({
      ...cls,
      myBookingStatus: bookedClassIds.has(cls.id) ? myBookings.find(b => b.classId === cls.id)?.status : null,
    })))
  })

  app.get('/classes/attendance', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
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
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      return reply.status(201).send(await createClass(user.gymId, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Update allowed plans for a class (set replaces current list; empty array removes all restrictions)
  app.put('/classes/:id/allowed-plans', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as { id: string }
    const parsed = updateClassAllowedPlansSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    const cls = await prisma.class.findFirst({ where: { id, gymId: user.gymId } })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })
    try {
      await assertPlansBelongToGym(user.gymId, parsed.data.allowedPlanIds)
      const updated = await prisma.class.update({
        where: { id },
        data: { allowedPlans: { set: parsed.data.allowedPlanIds.map(planId => ({ id: planId })) } },
        include: { allowedPlans: { select: { id: true, name: true } } },
      })
      return reply.send(updated)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Mis reservas (alumno autenticado)
  app.get('/bookings/me', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const bookings = await prisma.booking.findMany({
      where: { userId: user.userId, class: { gymId: user.gymId } },
      include: {
        class: {
          include: { classType: true, coach: { select: { id: true, name: true } } },
        },
      },
      orderBy: { class: { startsAt: 'asc' } },
    })
    return reply.send(bookings.map((b: any) => ({
      id: b.id,
      classId: b.classId,
      status: b.status,
      confirmDeadline: b.confirmDeadline,
      startsAt: b.class.startsAt,
      endsAt: b.class.endsAt,
      classType: b.class.classType,
      coach: b.class.coach,
    })))
  })

  app.post('/bookings', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const parsed = bookingSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })
    try {
      return reply.status(201).send(await bookClass(user.gymId, user.userId, parsed.data))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.post('/bookings/assign', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const admin = request.user as any
    const { classId, userId } = request.body as any
    if (!classId || !userId) return reply.status(400).send({ error: 'classId y userId son requeridos' })
    try {
      return reply.status(201).send(await assignUserToClass(admin.gymId, userId, classId))
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
      return reply.status(400).send({ error: err.message })
    }
  })

  // Admin/Coach elimina a un alumno de una clase (libera el cupo y promueve lista de espera)
  app.delete('/bookings/:bookingId/admin', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { bookingId } = request.params as any
    try {
      await removeStudentByAdmin(user.gymId, bookingId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // Alumno confirma su lugar (desde PENDING_CONFIRM → CONFIRMED)
  app.post('/bookings/:bookingId/confirm', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { bookingId } = request.params as any
    try {
      return reply.send(await confirmWaitlistBooking(user.gymId, user.userId, bookingId))
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  app.patch('/classes/:id', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const body = request.body as any
    const cls = await prisma.class.findFirst({ where: { id, gymId: user.gymId } })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })

    // Verificar que coachId pertenece al mismo gym (previene asignación cross-tenant)
    if (body.coachId) {
      const coach = await prisma.user.findFirst({
        where: { id: body.coachId, gymId: user.gymId, role: { in: ['COACH', 'ADMIN'] } },
        select: { id: true },
      })
      if (!coach) return reply.status(400).send({ error: 'El coach no pertenece a este gimnasio' })
    }

    // Verificar que classTypeId pertenece al mismo gym
    if (body.classTypeId) {
      const ct = await prisma.classType.findFirst({
        where: { id: body.classTypeId, gymId: user.gymId },
        select: { id: true },
      })
      if (!ct) return reply.status(400).send({ error: 'El tipo de clase no pertenece a este gimnasio' })
    }

    if (body.allowedPlanIds !== undefined) {
      try {
        await assertPlansBelongToGym(user.gymId, body.allowedPlanIds as string[])
      } catch (err: any) {
        return reply.status(400).send({ error: err.message })
      }
    }

    // Si el PATCH toca startsAt y/o endsAt, validar el par resultante (el que no se
    // envía mantiene su valor actual) — sin esto se puede dejar una clase con el fin
    // antes del inicio, invisible en el calendario (FullCalendar descarta end<=start).
    if (body.startsAt || body.endsAt) {
      const effectiveStartsAt = body.startsAt ? new Date(body.startsAt) : cls.startsAt
      const effectiveEndsAt = body.endsAt ? new Date(body.endsAt) : cls.endsAt
      if (effectiveEndsAt.getTime() <= effectiveStartsAt.getTime()) {
        return reply.status(400).send({ error: 'La hora de término debe ser posterior a la de inicio' })
      }
    }

    try {
      const updated = await prisma.class.update({
        where: { id },
        data: {
          ...(body.startsAt && { startsAt: new Date(body.startsAt) }),
          ...(body.endsAt && { endsAt: new Date(body.endsAt) }),
          ...(body.capacity && { capacity: Number(body.capacity) }),
          ...(body.coachId && { coachId: body.coachId }),
          ...(body.classTypeId && { classTypeId: body.classTypeId }),
          ...(body.allowedPlanIds !== undefined && {
            allowedPlans: { set: (body.allowedPlanIds as string[]).map(planId => ({ id: planId })) },
          }),
        },
        include: { allowedPlans: { select: { id: true, name: true } } },
      })
      return reply.send(updated)
    } catch (err) {
      const msg = prismaErrorMessage(err)
      return reply.status(400).send({ error: msg ?? 'Error al actualizar clase' })
    }
  })

  app.delete('/classes/bulk', { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user as any
    const { ids } = request.body as any
    if (!Array.isArray(ids) || ids.length === 0) return reply.status(400).send({ error: 'Debe proporcionar ids' })
    // WODs are shared by classType+day — don't auto-delete them when removing class slots
    await prisma.booking.deleteMany({ where: { classId: { in: ids }, class: { gymId: user.gymId } } })
    const result = await prisma.class.deleteMany({ where: { id: { in: ids }, gymId: user.gymId } })
    return reply.send({ deleted: result.count })
  })

  app.delete('/classes/:id', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id } = request.params as any
    const cls = await prisma.class.findFirst({ where: { id, gymId: user.gymId } })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })
    // Note: WODs are shared by classType+day, not deleted when a single class slot is removed
    await prisma.booking.deleteMany({ where: { classId: id } })
    await prisma.class.delete({ where: { id } })
    return reply.send({ message: 'Clase eliminada' })
  })

  // Marca (o desmarca con { attended: false }) la asistencia de una reserva
  app.patch('/bookings/:bookingId/attend', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { bookingId } = request.params as any
    const attended = (request.body as { attended?: unknown } | undefined)?.attended ?? true
    if (typeof attended !== 'boolean') return reply.status(400).send({ error: 'attended debe ser boolean' })
    try {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, class: { gymId: user.gymId } },
      })
      if (!booking) return reply.status(404).send({ error: 'Reserva no encontrada' })
      try {
        const updated = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            attended,
            attendedAt: attended ? new Date() : null,
            status: attended ? 'ATTENDED' : 'CONFIRMED',
          },
        })
        return reply.send(updated)
      } catch (err) {
        const msg = prismaErrorMessage(err)
        return reply.status(400).send({ error: msg ?? 'Error al registrar asistencia' })
      }
    } catch (err: any) {
      throw err // lo responde el error handler global (oculta detalles 5xx en producción)
    }
  })

  // ─── Asistencia: manual bulk (coach marca lista) ──────────────────────────
  app.patch('/classes/:classId/attendance', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const { userIds } = request.body as any  // array de userIds presentes
    if (!Array.isArray(userIds)) return reply.status(400).send({ error: 'userIds debe ser un array' })

    const cls = await prisma.class.findFirst({ where: { id: classId, gymId: user.gymId } })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })

    // Marcar ATTENDED a los que están en la lista
    await prisma.booking.updateMany({
      where: { classId, userId: { in: userIds }, status: { in: ['CONFIRMED', 'WAITLIST'] } },
      data: { status: 'ATTENDED', attended: true, attendedAt: new Date() },
    })
    // Los confirmados que NO están: quedan como estaban (no se descuentan)
    return reply.send({ ok: true, marked: userIds.length })
  })

  // ─── Asistencia: QR — coach escanea QR del alumno ─────────────────────────
  app.post('/classes/:classId/attendance/qr', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const { userId } = request.body as any
    if (!userId) return reply.status(400).send({ error: 'userId requerido' })

    const cls = await prisma.class.findFirst({ where: { id: classId, gymId: user.gymId } })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })

    // Verificar que el gym usa modo qr
    const gym = await prisma.gym.findUnique({ where: { id: user.gymId }, select: { attendanceMode: true } })
    if (gym?.attendanceMode !== 'qr') return reply.status(400).send({ error: 'Este gym no usa modo QR' })

    const booking = await prisma.booking.findUnique({
      where: { userId_classId: { userId, classId } },
      include: { user: { select: { name: true } } },
    })
    if (!booking) return reply.status(404).send({ error: 'El alumno no tiene reserva en esta clase' })
    if (booking.status === 'ATTENDED') return reply.send({ ok: true, alreadyAttended: true, name: (booking as any).user.name })
    if (booking.status === 'CANCELLED') return reply.status(400).send({ error: 'La reserva fue cancelada' })

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'ATTENDED', attended: true, attendedAt: new Date() } })
    return reply.send({ ok: true, name: (booking as any).user.name })
  })

  // ─── Asistencia: geo — alumno hace self check-in con coordenadas ──────────
  app.post('/classes/:classId/attendance/geo', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const { classId } = request.params as any
    const { lat, lng } = request.body as any
    if (lat == null || lng == null) return reply.status(400).send({ error: 'lat y lng requeridos' })

    const [cls, gym] = await Promise.all([
      prisma.class.findFirst({ where: { id: classId, gymId: user.gymId } }),
      prisma.gym.findUnique({ where: { id: user.gymId }, select: { attendanceMode: true, gymLat: true, gymLng: true, gymRadiusMeters: true } }),
    ])
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })
    if (gym?.attendanceMode !== 'geo') return reply.status(400).send({ error: 'Este gym no usa modo geolocalización' })
    if (!gym.gymLat || !gym.gymLng) return reply.status(400).send({ error: 'El gym no tiene ubicación configurada' })

    // Haversine distance en metros
    const R = 6371000
    const dLat = (lat - gym.gymLat) * Math.PI / 180
    const dLng = (lng - gym.gymLng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(gym.gymLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const radius = gym.gymRadiusMeters ?? 200

    if (distance > radius) {
      return reply.status(403).send({ error: `Estás a ${Math.round(distance)}m del gym. Debes estar a menos de ${radius}m para registrar asistencia.`, distance: Math.round(distance) })
    }

    // Verificar que la clase esté en curso (±30 min)
    const now = new Date()
    const windowStart = new Date(cls.startsAt.getTime() - 30 * 60000)
    const windowEnd = new Date(cls.endsAt.getTime() + 15 * 60000)
    if (now < windowStart || now > windowEnd) {
      return reply.status(400).send({ error: 'El check-in geo solo está disponible 30 min antes y hasta 15 min después del fin de la clase' })
    }

    const booking = await prisma.booking.findUnique({
      where: { userId_classId: { userId: user.userId, classId } },
    })
    if (!booking) return reply.status(404).send({ error: 'No tienes reserva en esta clase' })
    if (booking.status === 'ATTENDED') return reply.send({ ok: true, alreadyAttended: true })
    if (booking.status === 'CANCELLED') return reply.status(400).send({ error: 'Tu reserva fue cancelada' })

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'ATTENDED', attended: true, attendedAt: new Date() } })
    return reply.send({ ok: true, distance: Math.round(distance) })
  })

  // ─── Asistencia: lista completa de reservas/asistencia de una clase ──────────
  app.get('/classes/:id/attendees', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
    const user = request.user as any
    const { id: classId } = request.params as { id: string }

    const cls = await prisma.class.findFirst({
      where: { id: classId, gymId: user.gymId },
      include: {
        bookings: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
          orderBy: { user: { name: 'asc' } },
        },
      },
    })
    if (!cls) return reply.status(404).send({ error: 'Clase no encontrada' })

    return reply.send({
      classId,
      total: cls.bookings.length,
      attended: cls.bookings.filter((b: any) => b.attended).length,
      bookings: cls.bookings.map((b: any) => ({
        userId: b.userId,
        userName: b.user.name,
        userEmail: b.user.email,
        userAvatar: b.user.avatarUrl,
        status: b.status,
        attended: b.attended,
        attendedAt: b.attendedAt,
        bookedAt: b.createdAt,
      })),
    })
  })

  app.get('/my-bookings', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as any
    const bookings = await prisma.booking.findMany({
      where: {
        userId: user.userId,
        status: { in: ['CONFIRMED', 'WAITLIST', 'ATTENDED', 'PENDING_CONFIRM'] },
        class: { gymId: user.gymId },
      },
      include: {
        class: {
          include: {
            classType: { select: { id: true, name: true, color: true, discipline: true } },
            bookings: {
              where: { status: { in: ['CONFIRMED', 'ATTENDED', 'WAITLIST', 'PENDING_CONFIRM'] } },
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