import { prisma } from '../../lib/prisma'
import { BookingStatus } from '../../generated/prisma'
import { CreateClassTypeInput, CreateClassInput, BookingInput } from './classes.schema'
import { handlePrismaError } from '../../lib/prismaError'
import { sendPushNotification } from '../../lib/push'
import {
  gymDayRange, getGymTimezone, DEFAULT_GYM_TIMEZONE, startOfGymDay, gymLocalDate, gymLocalTime,
  addLocalDays, atGymLocalTime, localWeekday,
} from '../../lib/gym-day'

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
  try {
    await prisma.classType.delete({ where: { id: classTypeId } })
  } catch (err) {
    handlePrismaError(err)
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Clases entre `from` y `to`. Una fecha sin hora ('YYYY-MM-DD') es un día local del gym:
 * `to` incluye todo ese día. Antes se tomaba como día UTC y en Chile, desde las 21:00,
 * "hoy" mostraba clases de mañana y perdía las de la noche.
 */
export async function listClasses(gymId: string, from?: string, to?: string) {
  const startsAt: { gte?: Date; lt?: Date; lte?: Date } = {}
  const tz = (from && DATE_ONLY.test(from)) || (to && DATE_ONLY.test(to)) ? await getGymTimezone(gymId) : ''
  if (from) startsAt.gte = DATE_ONLY.test(from) ? startOfGymDay(from, tz) : new Date(from)
  if (to) {
    if (DATE_ONLY.test(to)) startsAt.lt = gymDayRange(to, tz).lt
    else startsAt.lte = new Date(to)
  }

  return prisma.class.findMany({
    where: { gymId, ...(Object.keys(startsAt).length && { startsAt }) },
    include: {
      classType: { select: { id: true, name: true, color: true, discipline: true } },
      // PENDING_CONFIRM ocupa cupo igual que CONFIRMED — todavía no confirmó, pero
      // el lugar sigue reservado para esa persona hasta que confirme o expire.
      _count: { select: { bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'] } } } } },
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

  // WOD compartido del mismo tipo de clase en el mismo día local del gym
  const wod = await prisma.wod.findFirst({
    where: { gymId, classTypeId: cls.classTypeId, date: gymDayRange(cls.startsAt, await getGymTimezone(gymId)) },
    include: {
      blocks: {
        orderBy: { order: 'asc' },
        include: { movements: { orderBy: { order: 'asc' } } },
      },
    },
  })

  return { ...cls, wods: wod ? [wod] : [] }
}

// Los planes llegan como IDs en el body: verificar que TODOS sean del gym del token
export async function assertPlansBelongToGym(gymId: string, planIds: string[]) {
  const uniqueIds = [...new Set(planIds)]
  if (!uniqueIds.length) return
  const count = await prisma.plan.count({ where: { gymId, id: { in: uniqueIds } } })
  if (count !== uniqueIds.length) throw new Error('Uno o más planes no pertenecen a este gimnasio')
}

export async function createClass(gymId: string, data: CreateClassInput & { allowedPlanIds?: string[] }) {
  const classType = await prisma.classType.findFirst({ where: { id: data.classTypeId, gymId } })
  if (!classType) throw new Error('Tipo de clase no encontrado')

  const coach = await prisma.user.findFirst({
    where: { id: data.coachId, gymId, role: { in: ['COACH', 'ADMIN'] } },
    select: { id: true },
  })
  if (!coach) throw new Error('El coach no pertenece a este gimnasio')

  await assertPlansBelongToGym(gymId, data.allowedPlanIds ?? [])

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
  const classes = []

  // Días y hora en la zona del gym: los recurringDays son días locales (una clase del lunes
  // a las 21:30 en Chile es martes en UTC) y la hora local se mantiene aunque cambie el horario
  const tz = await getGymTimezone(gymId)
  const { hour, minute } = gymLocalTime(baseStart, tz)
  const firstDay = gymLocalDate(baseStart, tz)
  const lastDay = data.recurringUntil ? gymLocalDate(data.recurringUntil, tz) : addLocalDays(firstDay, 28)

  for (let day = firstDay; day <= lastDay; day = addLocalDays(day, 1)) {
    if (!data.recurringDays.includes(localWeekday(day))) continue
    const classStart = atGymLocalTime(day, hour, minute, tz)
    classes.push({
      gymId, classTypeId: data.classTypeId, coachId: data.coachId,
      startsAt: classStart, endsAt: new Date(classStart.getTime() + duration),
      capacity: data.capacity, frequency: 'RECURRING' as const,
    })
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

// Decide si un plan puede reservar una clase. La restricción puntual de la clase
// (Class.allowedPlans) manda cuando está seteada — pensada para casos especiales (ej.
// un taller solo para Premium). Si no está seteada, se cae a los tipos de clase que
// incluye el plan (Plan.classTypes) — y si el plan tampoco tiene ninguno seteado, sin
// restricción, para no romper gyms existentes que nunca configuraron nada de esto.
function canAccessClass(
  cls: { classTypeId: string; allowedPlans: { id: string }[] },
  planId: string,
  planClassTypes: { id: string }[],
): boolean {
  if (cls.allowedPlans.length > 0) return cls.allowedPlans.some(p => p.id === planId)
  if (planClassTypes.length > 0) return planClassTypes.some(ct => ct.id === cls.classTypeId)
  return true
}

// Una reserva del propio alumno (no la del coach, assignUserToClass) no queda
// CONFIRMED de una si todavía faltan más de `preClassConfirmHours` para la clase —
// el alumno debe confirmar manualmente antes de ese momento (mismo mecanismo que la
// confirmación de lista de espera: PENDING_CONFIRM + confirmDeadline,
// confirmBooking, runPendingConfirmExpiryJob). Si ya falta menos tiempo que
// eso al reservar, no tiene sentido pedir confirmación — queda CONFIRMED directo,
// como siempre.
function nextBookingStatus(
  cls: { startsAt: Date; gym: { preClassConfirmHours: number } | null },
  now: Date,
): { status: 'CONFIRMED' | 'PENDING_CONFIRM'; confirmDeadline: Date | null } {
  const hours = cls.gym?.preClassConfirmHours ?? 2
  const confirmDeadline = new Date(cls.startsAt.getTime() - hours * 60 * 60 * 1000)
  if (confirmDeadline <= now) return { status: 'CONFIRMED', confirmDeadline: null }
  return { status: 'PENDING_CONFIRM', confirmDeadline }
}

// maxClasses: para planes normales, tope de clases por DÍA (cualquier tipo, no solo
// el mismo que la clase que se está reservando), que se repite día a día mientras
// dure la membresía — no un total acumulado para todo el período (Cristian,
// 2026-10-16: revierte la decisión de 2026-10-05 de contarlo por período completo —
// esa vez el problema era un plan "2 incluidas" reservable 2 veces CADA día; ahora
// el problema era el inverso, un plan mensual "1 incluida" solo dejaba reservar 1
// clase en los 30 días en vez de 1 por día). Para planes Trial se mantiene el tope
// TOTAL del período: no conviene regalar más clases por día en un plan gratuito
// solo porque dura varios días.
async function planAllowsMaxClasses(
  userId: string,
  activeMembership: { startsAt: Date; endsAt: Date; plan: { maxClasses: number | null; isTrial: boolean } },
  dayStart: Date,
  dayEnd: Date,
  activeStatuses: BookingStatus[],
): Promise<boolean> {
  const { maxClasses, isTrial } = activeMembership.plan
  if (!maxClasses) return true
  const count = await prisma.booking.count({
    where: {
      userId,
      status: { in: activeStatuses },
      class: isTrial
        ? { startsAt: { gte: activeMembership.startsAt, lt: activeMembership.endsAt } }
        : { startsAt: { gte: dayStart, lt: dayEnd } },
    },
  })
  return count < maxClasses
}

function maxClassesErrorMessage(
  plan: { maxClasses: number | null; isTrial: boolean },
  subject: 'self' | 'student',
): string {
  if (plan.isTrial) {
    return subject === 'self'
      ? 'Has alcanzado el límite de clases de tu plan de prueba'
      : 'El alumno alcanzó el límite de clases de su plan de prueba'
  }
  const n = plan.maxClasses
  return subject === 'self'
    ? `Tu plan permite máximo ${n} clase${n! > 1 ? 's' : ''} por día`
    : `El plan del alumno permite máximo ${n} clase${n! > 1 ? 's' : ''} por día`
}

export async function bookClass(gymId: string, userId: string, data: BookingInput) {
  const cls = await prisma.class.findFirst({
    where: { id: data.classId, gymId },
    include: { gym: true, classType: { select: { name: true } }, allowedPlans: { select: { id: true } } },
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
    include: { plan: { select: { maxClasses: true, isTrial: true, classTypes: { select: { id: true } } } } },
  })
  if (!activeMembership) throw new Error('No tienes una membresía activa')

  if (!canAccessClass(cls, activeMembership.planId, activeMembership.plan.classTypes)) {
    throw new Error('Tu plan no tiene acceso a esta clase')
  }

  // Reservar de nuevo la MISMA clase → mensaje específico, no la regla de "mismo tipo por día"
  const existing = await prisma.booking.findUnique({
    where: { userId_classId: { userId, classId: data.classId } },
  })
  if (existing) {
    if (existing.status === 'CONFIRMED' || existing.status === 'WAITLIST' || existing.status === 'PENDING_CONFIRM') {
      throw new Error(
        existing.status === 'WAITLIST'
          ? 'Ya estás en lista de espera'
          : existing.status === 'PENDING_CONFIRM'
          ? 'Ya tienes una reserva pendiente de confirmar en esta clase'
          : 'Ya tienes reserva en esta clase'
      )
    }
    return prisma.booking.update({ where: { id: existing.id }, data: nextBookingStatus(cls, now) })
  }

  // Rango del día de la clase en la timezone del gym
  const gymTz = cls.gym.timezone || DEFAULT_GYM_TIMEZONE
  const { gte: dayStart, lt: dayEnd } = gymDayRange(cls.startsAt, gymTz)
  const activeStatuses: BookingStatus[] = ['CONFIRMED', 'ATTENDED', 'WAITLIST', 'PENDING_CONFIRM']

  // No se puede reservar el mismo tipo de clase dos veces en el mismo día — regla
  // pareja para todos los planes, con o sin maxClasses (QA, Cristian 2026-10-05: antes
  // solo se aplicaba a planes ilimitados, dejando un hueco en los planes con maxClasses
  // como el trial, que podían reservar p.ej. CrossFit 17:00 y CrossFit 20:00 el mismo día).
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

  // No se puede reservar una clase que se superpone en horario con otra ya
  // reservada, aunque sea de tipo distinto — físicamente no se puede estar en
  // las dos (QA, Cristian 2026-10-07: antes solo se chequeaba mismo tipo/día,
  // dejando reservar p.ej. CrossFit y Halterofilia a la misma hora exacta).
  const overlapping = await prisma.booking.count({
    where: {
      userId,
      status: { in: activeStatuses },
      class: { startsAt: { lt: cls.endsAt }, endsAt: { gt: cls.startsAt } },
    },
  })
  if (overlapping > 0) {
    throw new Error('Ya tienes una clase reservada en ese horario')
  }

  if (!(await planAllowsMaxClasses(userId, activeMembership, dayStart, dayEnd, activeStatuses))) {
    throw new Error(maxClassesErrorMessage(activeMembership.plan, 'self'))
  }

  // PENDING_CONFIRM cuenta para el cupo igual que CONFIRMED — el lugar sigue
  // tomado hasta que la persona confirme o expire (runPendingConfirmExpiryJob),
  // no está libre para que otro lo reserve mientras tanto.
  const confirmedCount = await prisma.booking.count({
    where: { classId: data.classId, status: { in: ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'] } },
  })

  if (confirmedCount >= cls.capacity) {
    return prisma.booking.create({
      data: { userId, classId: data.classId, status: 'WAITLIST' },
    })
  }

  return prisma.booking.create({
    data: { userId, classId: data.classId, ...nextBookingStatus(cls, now) },
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

// Confirma una reserva PENDING_CONFIRM — tanto las promovidas de lista de espera
// como las reservas normales que quedaron pendientes por el umbral de
// preClassConfirmHours (nextBookingStatus). Revalida membresía activa en este
// momento, no solo en el de la reserva original: es justamente el punto de este
// mecanismo — una membresía vencida DESPUÉS de reservar no debe poder confirmar y
// quedarse con el cupo (antes de esto, bookClass solo validaba una vez, al reservar,
// y la reserva quedaba CONFIRMED para siempre sin volver a revisarse).
export async function confirmBooking(gymId: string, userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, class: { gymId } },
  })
  if (!booking) throw new Error('Reserva no encontrada')
  if (booking.status !== 'PENDING_CONFIRM') throw new Error('Esta reserva no requiere confirmación')

  const now = new Date()
  if (booking.confirmDeadline && now > booking.confirmDeadline) {
    throw new Error('El tiempo para confirmar ha expirado')
  }

  const activeMembership = await prisma.membership.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { gte: now } },
  })
  if (!activeMembership) throw new Error('No tienes una membresía activa')

  return prisma.booking.update({
    where: { id: booking.id },
    data: { status: 'CONFIRMED', confirmDeadline: null },
  })
}

export async function assignUserToClass(gymId: string, targetUserId: string, classId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, gymId },
    include: { gym: true, classType: { select: { name: true } }, allowedPlans: { select: { id: true } } },
  })
  if (!cls) throw new Error('Clase no encontrada')

  const targetUser = await prisma.user.findFirst({ where: { id: targetUserId, gymId } })
  if (!targetUser) throw new Error('Usuario no encontrado en este gym')

  const now = new Date()

  // Misma regla que bookClass: sin membresía activa no se puede reservar, ni
  // siquiera si es el coach quien agrega al alumno — evita que alguien siga yendo a
  // clases indefinidamente sin renovar porque el coach lo agrega cada vez a mano
  // (QA H-PROD-MOBILE-02, Cristian 2026-10-14).
  const activeMembership = await prisma.membership.findFirst({
    where: { userId: targetUserId, status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { gte: now } },
    include: { plan: { select: { maxClasses: true, isTrial: true, classTypes: { select: { id: true } } } } },
  })
  if (!activeMembership) throw new Error('El alumno no tiene una membresía activa')

  // Misma regla que bookClass: si la clase restringe por plan (puntual o por tipo de
  // clase incluido en el plan), el plan del alumno debe tener acceso — el coach no
  // puede saltarse esto a mano (mismo hueco que la regla de membresía activa de
  // arriba: si no aplicara parejo, bastaría con pedirle al coach que inscriba en vez
  // de reservar uno mismo para esquivar la restricción de plan).
  if (!canAccessClass(cls, activeMembership.planId, activeMembership.plan.classTypes)) {
    throw new Error('El plan del alumno no tiene acceso a esta clase')
  }

  // El coach puede incorporar a un alumno a una clase en curso (lo agrega "fuera
  // de horario", viéndolo presente ahí mismo) — en ese caso queda ATTENDED de
  // una vez, es el coach confirmando presencia en el momento. Pero si la clase
  // terminó hace rato (más de 15 min, misma ventana que el check-in geo en
  // classes.routes.ts), ya no es "lo tengo enfrente" sino un backfill — queda
  // CONFIRMED normal, para que el coach la marque a mano con el flujo de
  // siempre (PATCH /bookings/:bookingId/attend). Sin este corte, asignar a
  // alguien a una clase de hace días también quedaba auto-marcado, rompiendo
  // el caso de uso de "cargar datos de prueba de una clase vieja para después
  // probar el marcado manual" (QA H-MOBILE-03, docs/QA_MOBILE_MAESTRO.md).
  const alreadyStarted = cls.startsAt <= now
  const recentlyEnded = now <= new Date(cls.endsAt.getTime() + 15 * 60 * 1000)
  const markAttendedNow = alreadyStarted && recentlyEnded
  const attendedData = markAttendedNow ? { attended: true, attendedAt: now } : {}

  const existing = await prisma.booking.findUnique({
    where: { userId_classId: { userId: targetUserId, classId } },
  })
  if (existing) {
    if (existing.status === 'CONFIRMED' || existing.status === 'WAITLIST' || existing.status === 'ATTENDED') {
      throw new Error('El alumno ya tiene una reserva en esta clase')
    }
    return prisma.booking.update({
      where: { id: existing.id },
      data: { status: markAttendedNow ? 'ATTENDED' : 'CONFIRMED', ...attendedData },
    })
  }

  // "Mismo tipo de clase dos veces el mismo día" aplica también cuando es el coach
  // quien agrega al alumno — no es un cutoff de tiempo (esos sí los salta el coach a
  // propósito), es una regla de variedad pareja para todos (QA H-MOBILE-04, Cristian
  // 2026-10-05). "Mover" a un alumno (sacarlo de una clase y meterlo en otra del mismo
  // tipo) sigue funcionando: removeStudentByAdmin borra la reserva vieja antes de este
  // chequeo, así que no choca contra sí misma.
  const gymTz = cls.gym.timezone || DEFAULT_GYM_TIMEZONE
  const { gte: dayStart, lt: dayEnd } = gymDayRange(cls.startsAt, gymTz)
  const activeStatuses: BookingStatus[] = ['CONFIRMED', 'ATTENDED', 'WAITLIST', 'PENDING_CONFIRM']
  const sameTypeOnDay = await prisma.booking.count({
    where: {
      userId: targetUserId,
      status: { in: activeStatuses },
      class: { startsAt: { gte: dayStart, lt: dayEnd }, classTypeId: cls.classTypeId },
    },
  })
  if (sameTypeOnDay > 0) {
    throw new Error(`El alumno ya tiene una clase de ${cls.classType.name} reservada para ese día`)
  }

  // Misma regla de solapamiento de horario que bookClass, también para el coach
  // (QA H-ALUMNO-01, Cristian 2026-10-07: confirmado que aplica parejo, igual que
  // la regla de mismo tipo/día de arriba).
  const overlapping = await prisma.booking.count({
    where: {
      userId: targetUserId,
      status: { in: activeStatuses },
      class: { startsAt: { lt: cls.endsAt }, endsAt: { gt: cls.startsAt } },
    },
  })
  if (overlapping > 0) {
    throw new Error('El alumno ya tiene una clase reservada en ese horario')
  }

  // Mismo tope de maxClasses que bookClass (por día, no por período — ver
  // planAllowsMaxClasses) — sin este chequeo el coach podía inscribir a un alumno
  // por encima del cupo de su plan, algo que el alumno reservando por sí mismo no
  // puede hacer.
  if (!(await planAllowsMaxClasses(targetUserId, activeMembership, dayStart, dayEnd, activeStatuses))) {
    throw new Error(maxClassesErrorMessage(activeMembership.plan, 'student'))
  }

  // Mismo criterio que bookClass: PENDING_CONFIRM también ocupa cupo.
  const confirmedCount = await prisma.booking.count({
    where: { classId, status: { in: ['CONFIRMED', 'ATTENDED', 'PENDING_CONFIRM'] } },
  })

  const status = confirmedCount >= cls.capacity ? 'WAITLIST' : markAttendedNow ? 'ATTENDED' : 'CONFIRMED'
  return prisma.booking.create({ data: { userId: targetUserId, classId, status, ...(status === 'ATTENDED' ? attendedData : {}) } })
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
