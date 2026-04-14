import { prisma } from '../../lib/prisma'
import { CreateClassTypeInput, CreateClassInput, BookingInput } from './classes.schema'
import { handlePrismaError } from '../../lib/prismaError'
import { sendPushNotification } from '../../lib/push'

export async function listClassTypes(gymId: string) {
  return prisma.classType.findMany({
    where: { gymId },
    include: { blocks: { orderBy: { order: 'asc' } } },
    orderBy: { name: 'asc' },
  })
}

export async function createClassType(gymId: string, data: CreateClassTypeInput) {
  const { blocks, ...rest } = data as any
  try {
    return await prisma.classType.create({
      data: {
        ...rest,
        gymId,
        ...(blocks?.length && {
          blocks: {
            create: blocks.map((b: any, i: number) => ({ ...b, order: i })),
          },
        }),
      },
      include: { blocks: { orderBy: { order: 'asc' } } },
    })
  } catch (err) {
    handlePrismaError(err)
  }
}

export async function updateClassType(gymId: string, classTypeId: string, data: CreateClassTypeInput) {
  const { blocks, ...rest } = data as any
  const existing = await prisma.classType.findFirst({ where: { id: classTypeId, gymId } })
  if (!existing) throw new Error('Tipo de clase no encontrado')

  if (blocks !== undefined) {
    await prisma.classTypeBlock.deleteMany({ where: { classTypeId } })
  }

  return prisma.classType.update({
    where: { id: classTypeId },
    data: {
      ...rest,
      ...(blocks !== undefined && {
        blocks: {
          create: blocks.map((b: any, i: number) => ({ ...b, order: i })),
        },
      }),
    },
    include: { blocks: { orderBy: { order: 'asc' } } },
  })
}

export async function deleteClassType(gymId: string, classTypeId: string) {
  const existing = await prisma.classType.findFirst({ where: { id: classTypeId, gymId } })
  if (!existing) throw new Error('Tipo de clase no encontrado')
  await prisma.classType.delete({ where: { id: classTypeId } })
}

export async function listClasses(gymId: string, from?: string, to?: string) {
  const startsAt: any = {}
  if (from) startsAt.gte = new Date(from)
  if (to) {
    const toDate = new Date(to)
    toDate.setUTCHours(23, 59, 59, 999)
    startsAt.lte = toDate
  }

  return prisma.class.findMany({
    where: { gymId, ...(Object.keys(startsAt).length && { startsAt }) },
    include: {
      classType: { select: { id: true, name: true, color: true } },
      _count: { select: { bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED'] } } }, wods: true } },
    },
    orderBy: { startsAt: 'asc' },
  })
}

export async function getClassById(gymId: string, classId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, gymId },
    include: {
      classType: true,
      coach: { select: { id: true, name: true, email: true, avatarUrl: true } },
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
    const startsAt = new Date(data.startsAt)
    const duplicate = await prisma.class.findFirst({
      where: { gymId, classTypeId: data.classTypeId, startsAt },
    })
    if (duplicate) throw new Error(`Ya existe una clase de este tipo el ${startsAt.toLocaleString('es-CL')}`)

    try {
      return await prisma.class.create({
        data: {
          gymId, classTypeId: data.classTypeId, coachId: data.coachId,
          startsAt, endsAt: new Date(data.endsAt),
          capacity: data.capacity, frequency: data.frequency,
        },
      })
    } catch (err) {
      handlePrismaError(err)
    }
  }

  const baseStart = new Date(data.startsAt)
  const baseEnd = new Date(data.endsAt)
  const duration = baseEnd.getTime() - baseStart.getTime()
  // Use end-of-day UTC so the recurringUntil date itself is included
  const until = data.recurringUntil
    ? new Date(data.recurringUntil + 'T23:59:59Z')
    : new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)
  const classes = []

  // Use UTC methods throughout to avoid server timezone / DST issues
  const utcHour = baseStart.getUTCHours()
  const utcMinute = baseStart.getUTCMinutes()

  const current = new Date(baseStart)
  // Normalize current to start of the UTC day at the same UTC hour
  current.setUTCHours(utcHour, utcMinute, 0, 0)

  while (current <= until) {
    if (data.recurringDays.includes(current.getUTCDay())) {
      const classStart = new Date(current)
      const classEnd = new Date(classStart.getTime() + duration)
      classes.push({
        gymId, classTypeId: data.classTypeId, coachId: data.coachId,
        startsAt: classStart, endsAt: classEnd,
        capacity: data.capacity, frequency: 'RECURRING' as const,
      })
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  // Filter out slots that already have a class of this type at the same time
  const candidateStarts = classes.map(c => c.startsAt)
  const existingClasses = await prisma.class.findMany({
    where: { gymId, classTypeId: data.classTypeId, startsAt: { in: candidateStarts } },
    select: { startsAt: true },
  })
  const existingSet = new Set(existingClasses.map(c => c.startsAt.toISOString()))
  const uniqueClasses = classes.filter(c => !existingSet.has(c.startsAt.toISOString()))
  const skipped = classes.length - uniqueClasses.length

  if (uniqueClasses.length === 0) {
    throw new Error('Todas las clases del período ya existen para este tipo de clase')
  }

  try {
    await prisma.class.createMany({ data: uniqueClasses })
  } catch (err) {
    handlePrismaError(err)
  }
  const msg = skipped > 0
    ? `${uniqueClasses.length} clases creadas (${skipped} omitidas por duplicado)`
    : `${uniqueClasses.length} clases recurrentes creadas`
  return { created: uniqueClasses.length, skipped, message: msg }
}

export async function bookClass(gymId: string, userId: string, data: BookingInput) {
  const cls = await prisma.class.findFirst({
    where: { id: data.classId, gymId },
    include: { gym: true },
  })
  if (!cls) throw new Error('Clase no encontrada')

  const now = new Date()
  const cutoffMins = cls.gym?.bookingCutoffMins ?? 60
  const windowDays = cls.gym?.bookingWindowDays ?? 7

  // Clase ya comenzó
  if (now >= cls.startsAt) {
    throw new Error('Esta clase ya ha comenzado')
  }

  // Clase muy lejana en el futuro
  const maxBookingDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
  if (cls.startsAt > maxBookingDate) {
    throw new Error(`Solo puedes reservar con hasta ${windowDays} día(s) de anticipación`)
  }

  // Demasiado cerca del inicio
  const cutoffTime = new Date(cls.startsAt.getTime() - cutoffMins * 60 * 1000)
  if (now > cutoffTime) {
    const minsLeft = Math.round((cls.startsAt.getTime() - now.getTime()) / 60000)
    throw new Error(`La clase comienza en ${minsLeft} min. El mínimo para reservar es ${cutoffMins} minutos antes`)
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

  if (booking.status === 'CONFIRMED' || booking.status === 'PENDING_CONFIRM') {
    await promoteFromWaitlist(classId, booking.class.gym!)
  }

  return { message: 'Reserva cancelada' }
}

async function promoteFromWaitlist(classId: string, gym: { waitlistConfirmEnabled: boolean; waitlistConfirmMins: number }) {
  const nextWaitlist = await prisma.booking.findFirst({
    where: { classId, status: 'WAITLIST' },
    include: { user: { select: { pushToken: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (!nextWaitlist) return

  if (gym.waitlistConfirmEnabled) {
    const confirmDeadline = new Date(Date.now() + gym.waitlistConfirmMins * 60 * 1000)
    await prisma.booking.update({
      where: { id: nextWaitlist.id },
      data: { status: 'PENDING_CONFIRM', confirmDeadline },
    })
    if (nextWaitlist.user.pushToken) {
      await sendPushNotification(
        nextWaitlist.user.pushToken,
        '¡Hay un lugar disponible!',
        `Tienes ${gym.waitlistConfirmMins} minutos para confirmar tu asistencia.`,
        { type: 'WAITLIST_CONFIRM', classId }
      )
    }
  } else {
    await prisma.booking.update({
      where: { id: nextWaitlist.id },
      data: { status: 'CONFIRMED', confirmDeadline: null },
    })
    if (nextWaitlist.user.pushToken) {
      await sendPushNotification(
        nextWaitlist.user.pushToken,
        '¡Tienes un lugar!',
        'Pasaste de lista de espera a confirmado. Tu lugar está asegurado.',
        { type: 'WAITLIST_PROMOTED', classId }
      )
    }
  }
}

export async function confirmWaitlistBooking(gymId: string, userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, class: { gymId } },
  })
  if (!booking) throw new Error('Reserva no encontrada')
  if (booking.status !== 'PENDING_CONFIRM') throw new Error('Esta reserva no requiere confirmación')

  const now = new Date()
  if (booking.confirmDeadline && now > booking.confirmDeadline) {
    throw new Error('El tiempo para confirmar ha expirado')
  }

  return prisma.booking.update({
    where: { id: booking.id },
    data: { status: 'CONFIRMED', confirmDeadline: null },
  })
}

export async function assignUserToClass(gymId: string, targetUserId: string, classId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, gymId } })
  if (!cls) throw new Error('Clase no encontrada')

  const targetUser = await prisma.user.findFirst({ where: { id: targetUserId, gymId } })
  if (!targetUser) throw new Error('Usuario no encontrado en este gym')

  const existing = await prisma.booking.findUnique({
    where: { userId_classId: { userId: targetUserId, classId } },
  })
  if (existing) {
    if (existing.status === 'CONFIRMED' || existing.status === 'WAITLIST' || existing.status === 'ATTENDED') {
      throw new Error('El alumno ya tiene una reserva en esta clase')
    }
    return prisma.booking.update({ where: { id: existing.id }, data: { status: 'CONFIRMED' } })
  }

  const confirmedCount = await prisma.booking.count({
    where: { classId, status: { in: ['CONFIRMED', 'ATTENDED'] } },
  })

  const status = confirmedCount >= cls.capacity ? 'WAITLIST' : 'CONFIRMED'
  return prisma.booking.create({ data: { userId: targetUserId, classId, status } })
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
