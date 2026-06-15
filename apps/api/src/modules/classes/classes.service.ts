import { prisma } from '../../lib/prisma'
import { BookingStatus } from '../../generated/prisma'
import { CreateClassTypeInput, CreateClassInput, BookingInput } from './classes.schema'
import { handlePrismaError } from '../../lib/prismaError'
import { sendPushNotification } from '../../lib/push'

// Devuelve el inicio del día (UTC) que corresponde a medianoche en la timezone del gym
function startOfDayUTC(date: Date, timezone: string): Date {
  const localDate = date.toLocaleDateString('sv', { timeZone: timezone }) // 'YYYY-MM-DD'
  const midnightUTC = new Date(`${localDate}T00:00:00.000Z`)
  const h = parseInt(
    new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', hour12: false }).format(midnightUTC),
    10
  ) % 24
  const offsetMs = (h <= 12 ? -h : 24 - h) * 3_600_000
  return new Date(midnightUTC.getTime() + offsetMs)
}

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
      _count: { select: { bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED'] } } } } },
      bookings: { where: { status: 'ATTENDED' }, select: { id: true } },
      allowedPlans: { select: { id: true, name: true } },
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
      allowedPlans: { select: { id: true, name: true } },
    },
  })
  if (!cls) throw new Error('Clase no encontrada')

  // Look up shared WOD for this classType on the same day
  const dayStart = new Date(cls.startsAt)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  const wod = await prisma.wod.findFirst({
    where: { gymId, classTypeId: cls.classTypeId, date: { gte: dayStart, lt: dayEnd } },
    include: {
      blocks: {
        orderBy: { order: 'asc' },
        include: { movements: { orderBy: { order: 'asc' } } },
      },
    },
  })

  return { ...cls, wods: wod ? [wod] : [] }
}

export async function createClass(gymId: string, data: CreateClassInput & { allowedPlanIds?: string[] }) {
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
          ...(data.allowedPlanIds?.length
            ? { allowedPlans: { connect: data.allowedPlanIds.map(id => ({ id })) } }
            : {}),
        },
        include: { allowedPlans: { select: { id: true, name: true } } },
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

  // Connect allowedPlans for recurring classes (createMany doesn't support relations)
  if (data.allowedPlanIds?.length) {
    const createdClasses = await prisma.class.findMany({
      where: { gymId, classTypeId: data.classTypeId, startsAt: { in: uniqueClasses.map(c => c.startsAt) } },
      select: { id: true },
    })
    await Promise.all(createdClasses.map(cls =>
      prisma.class.update({
        where: { id: cls.id },
        data: { allowedPlans: { connect: data.allowedPlanIds!.map(id => ({ id })) } },
      })
    ))
  }

  const msg = skipped > 0
    ? `${uniqueClasses.length} clases creadas (${skipped} omitidas por duplicado)`
    : `${uniqueClasses.length} clases recurrentes creadas`
  return { created: uniqueClasses.length, skipped, message: msg }
}

export async function bookClass(gymId: string, userId: string, data: BookingInput) {
  const cls = await prisma.class.findFirst({
    where: { id: data.classId, gymId },
    include: { gym: true, classType: { select: { name: true } } },
  })
  if (!cls) throw new Error('Clase no encontrada')

  const now = new Date()
  const cutoffMins = cls.gym?.bookingCutoffMins ?? 60
  const windowDays = cls.gym?.bookingWindowDays ?? 1

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
    include: { plan: { select: { maxClasses: true, isTrial: true } } },
  })
  if (!activeMembership) throw new Error('No tienes una membresía activa')

  // Check plan restrictions: if class has allowedPlans, user's plan must be in the list
  const classWithPlans = await prisma.class.findUnique({
    where: { id: data.classId },
    include: { allowedPlans: { select: { id: true } } },
  })
  if (classWithPlans?.allowedPlans && classWithPlans.allowedPlans.length > 0) {
    const allowed = classWithPlans.allowedPlans.some(p => p.id === activeMembership.planId)
    if (!allowed) throw new Error('Tu plan no tiene acceso a esta clase')
  }

  // Rango del día de la clase en la timezone del gym
  const gymTz = cls.gym.timezone || 'America/Santiago'
  const dayStart = startOfDayUTC(cls.startsAt, gymTz)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  const activeStatuses: BookingStatus[] = ['CONFIRMED', 'ATTENDED', 'WAITLIST', 'PENDING_CONFIRM']

  // No se puede reservar el mismo tipo de clase dos veces en el mismo día
  const sameTypeOnDay = await prisma.booking.count({
    where: {
      userId,
      status: { in: activeStatuses },
      class: { startsAt: { gte: dayStart, lt: dayEnd }, classTypeId: cls.classTypeId },
    },
  })
  if (sameTypeOnDay > 0) {
    throw new Error(`Ya tienes una clase de ${cls.classType.name} reservada para ese día`)
  }

  // maxClasses: límite de clases distintas por día según el plan
  if (activeMembership.plan.maxClasses) {
    const classesOnDay = await prisma.booking.count({
      where: {
        userId,
        status: { in: activeStatuses },
        class: { startsAt: { gte: dayStart, lt: dayEnd } },
      },
    })
    if (classesOnDay >= activeMembership.plan.maxClasses) {
      throw new Error(
        `Tu plan permite máximo ${activeMembership.plan.maxClasses} clase${activeMembership.plan.maxClasses > 1 ? 's' : ''} por día`
      )
    }
  }

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
    await promoteFromWaitlist(classId, booking.class.gym!, booking.class.startsAt)
  }

  return { message: 'Reserva cancelada' }
}

export async function removeStudentByAdmin(gymId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, class: { gymId } },
    include: { class: { include: { gym: true } } },
  })
  if (!booking) throw new Error('Reserva no encontrada')
  const wasActive = ['CONFIRMED', 'PENDING_CONFIRM', 'ATTENDED'].includes(booking.status)
  await prisma.booking.delete({ where: { id: bookingId } })
  if (wasActive && booking.class.gym) {
    await promoteFromWaitlist(booking.classId, booking.class.gym, booking.class.startsAt)
  }
}

async function promoteFromWaitlist(
  classId: string,
  gym: { waitlistConfirmEnabled: boolean; waitlistConfirmMins: number },
  classStartsAt: Date,
) {
  const nextWaitlist = await prisma.booking.findFirst({
    where: { classId, status: 'WAITLIST' },
    include: { user: { select: { pushToken: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (!nextWaitlist) return

  const now = new Date()
  const minsUntilClass = (classStartsAt.getTime() - now.getTime()) / 60000
  // Si queda menos tiempo que el plazo de confirmación, confirmar directo
  const needsManualConfirm = gym.waitlistConfirmEnabled && minsUntilClass > gym.waitlistConfirmMins

  if (needsManualConfirm) {
    const confirmDeadline = new Date(now.getTime() + gym.waitlistConfirmMins * 60 * 1000)
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
