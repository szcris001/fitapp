import { prisma } from '../../lib/prisma'
import { CreateClassTypeInput, CreateClassInput, BookingInput } from './classes.schema'

export async function listClassTypes(gymId: string) {
  return prisma.classType.findMany({ where: { gymId }, orderBy: { name: 'asc' } })
}

export async function createClassType(gymId: string, data: CreateClassTypeInput) {
  return prisma.classType.create({ data: { ...data, gymId } })
}

export async function listClasses(gymId: string, from?: string, to?: string) {
  const startsAt: any = {}
  if (from) startsAt.gte = new Date(from)
  if (to) {
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    startsAt.lte = toDate
  }

  return prisma.class.findMany({
    where: { gymId, ...(Object.keys(startsAt).length && { startsAt }) },
    include: {
      classType: { select: { id: true, name: true, color: true } },
      _count: { select: { bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED'] } } } } },
    },
    orderBy: { startsAt: 'asc' },
  })
}

export async function getClassById(gymId: string, classId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, gymId },
    include: {
      classType: true,
      bookings: {
        include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      wods: { include: { movements: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!cls) throw new Error('Clase no encontrada')
  return cls
}

export async function createClass(gymId: string, data: CreateClassInput) {
  const classType = await prisma.classType.findFirst({ where: { id: data.classTypeId, gymId } })
  if (!classType) throw new Error('Tipo de clase no encontrado')

  if (data.frequency === 'ONCE' || !data.recurringDays?.length) {
    return prisma.class.create({
      data: {
        gymId, classTypeId: data.classTypeId, coachId: data.coachId,
        startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
        capacity: data.capacity, frequency: data.frequency,
      },
    })
  }

  const baseStart = new Date(data.startsAt)
  const baseEnd = new Date(data.endsAt)
  const duration = baseEnd.getTime() - baseStart.getTime()
  const until = data.recurringUntil ? new Date(data.recurringUntil) : new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)
  const classes = []

  const current = new Date(baseStart)
  while (current <= until) {
    if (data.recurringDays.includes(current.getDay())) {
      const classStart = new Date(current)
      classStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0)
      const classEnd = new Date(classStart.getTime() + duration)
      classes.push({
        gymId, classTypeId: data.classTypeId, coachId: data.coachId,
        startsAt: classStart, endsAt: classEnd,
        capacity: data.capacity, frequency: 'RECURRING' as const,
      })
    }
    current.setDate(current.getDate() + 1)
  }

  await prisma.class.createMany({ data: classes })
  return { created: classes.length, message: `${classes.length} clases recurrentes creadas` }
}

export async function bookClass(gymId: string, userId: string, data: BookingInput) {
  const cls = await prisma.class.findFirst({
    where: { id: data.classId, gymId },
    include: { gym: true },
  })
  if (!cls) throw new Error('Clase no encontrada')

  const now = new Date()
  const cutoffMins = cls.gym?.bookingCutoffMins ?? 60
  const windowDays = cls.gym?.bookingWindowDays ?? 1

  const maxBookingDate = new Date()
  maxBookingDate.setDate(maxBookingDate.getDate() + windowDays)
  if (cls.startsAt > maxBookingDate) {
    throw new Error(`Solo puedes reservar con ${windowDays} día(s) de anticipación`)
  }

  const cutoffTime = new Date(cls.startsAt.getTime() - cutoffMins * 60 * 1000)
  if (now > cutoffTime) {
    throw new Error(`No puedes reservar con menos de ${cutoffMins} minutos de anticipación`)
  }

  const activeMembership = await prisma.membership.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { gte: now } },
  })
  if (!activeMembership) throw new Error('No tienes una membresía activa')

  const existing = await prisma.booking.findUnique({
    where: { userId_classId: { userId, classId: data.classId } },
  })
  if (existing) {
    if (existing.status === 'CONFIRMED' || existing.status === 'WAITLIST') {
      throw new Error(existing.status === 'WAITLIST' ? 'Ya estás en lista de espera' : 'Ya tienes reserva en esta clase')
    }
    return prisma.booking.update({ where: { id: existing.id }, data: { status: 'CONFIRMED' } })
  }

  const confirmedCount = await prisma.booking.count({
    where: { classId: data.classId, status: { in: ['CONFIRMED', 'ATTENDED'] } },
  })

  if (confirmedCount >= cls.capacity) {
    return prisma.booking.create({
      data: { userId, classId: data.classId, status: 'WAITLIST' },
    })
  }

  return prisma.booking.create({
    data: { userId, classId: data.classId, status: 'CONFIRMED' },
  })
}

export async function cancelBooking(gymId: string, userId: string, classId: string) {
  const booking = await prisma.booking.findFirst({
    where: { userId, classId, class: { gymId } },
    include: { class: { include: { gym: true } } },
  })
  if (!booking) throw new Error('Reserva no encontrada')

  const now = new Date()
  const cancelCutoffMins = booking.class.gym?.cancelCutoffMins ?? 30
  const cancelCutoff = new Date(booking.class.startsAt.getTime() - cancelCutoffMins * 60 * 1000)

  if (now > cancelCutoff) {
    throw new Error(`No puedes cancelar con menos de ${cancelCutoffMins} minutos de anticipación`)
  }

  await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })

  if (booking.status === 'CONFIRMED') {
    const nextWaitlist = await prisma.booking.findFirst({
      where: { classId, status: 'WAITLIST' },
      orderBy: { createdAt: 'asc' },
    })
    if (nextWaitlist) {
      await prisma.booking.update({ where: { id: nextWaitlist.id }, data: { status: 'CONFIRMED' } })
    }
  }

  return { message: 'Reserva cancelada' }
}

export async function getAttendanceBySchedule(gymId: string) {
  const classes = await prisma.class.findMany({
    where: { gymId },
    include: { _count: { select: { bookings: true } }, classType: { select: { name: true } } },
  })

  const byHour: Record<string, { total: number; bookings: number }> = {}
  for (const cls of classes) {
    const hour = new Date(cls.startsAt).getHours()
    const key = `${String(hour).padStart(2, '0')}:00`
    if (!byHour[key]) byHour[key] = { total: 0, bookings: 0 }
    byHour[key].total++
    byHour[key].bookings += cls._count.bookings
  }

  return Object.entries(byHour)
    .map(([hour, data]) => ({ hour, ...data, avgOccupancy: data.total ? Math.round(data.bookings / data.total) : 0 }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
}
