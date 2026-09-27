import { prisma } from '../../lib/prisma'
import { UpdateGymInput } from './gyms.schema'
import { handlePrismaError } from '../../lib/prismaError'
import { gymDayRangeFromToday, getGymTimezone } from '../../lib/gym-day'

export async function getGym(gymId: string) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      brandColors: true,
      bookingWindowDays: true,
      bookingCutoffMins: true,
      cancelCutoffMins: true,
      address: true,
      phone: true,
      email: true,
      instagram: true,
      facebook: true,
      termsAndConditions: true,
      createdAt: true,
      // Notificaciones
      expiryReminderDays: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpFrom: true,
      // Plantillas de correo
      emailExpirySubject: true,
      emailExpiryBody: true,
      emailPaymentSubject: true,
      emailPaymentBody: true,
      // DTE Bsale
      bsaleToken: true,
      bsaleOfficeId: true,
      bsalePriceListId: true,
      bsaleBoletaTypeId: true,
      bsaleFacturaTypeId: true,
      dteRut: true,
      dteRazonSocial: true,
      dteGiro: true,
      dteDireccion: true,
      dteComuna: true,
      dteCiudad: true,
      // Configuración de pesos
      weightRounding: true,
      status: true,
      attendanceMode: true,
      bankAccount: true,
      movementLibrary: true,
      timezone: true,
      waitlistConfirmEnabled: true,
      waitlistConfirmMins: true,
      sportTheme: true,
    },
  })
  if (!gym) throw new Error('Gimnasio no encontrado')
  return gym
}

export async function updateGym(gymId: string, data: UpdateGymInput) {
  try {
    return await prisma.gym.update({
      where: { id: gymId },
      data,
    })
  } catch (err) {
    handlePrismaError(err)
  }
}

type OccupancyPeriod = '7d' | '30d' | '3m' | '6m' | '1y'

function periodFrom(period: OccupancyPeriod): Date {
  const now = new Date()
  switch (period) {
    case '7d':  { const d = new Date(now); d.setDate(d.getDate() - 7);         return d }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 30);        return d }
    case '3m':  { const d = new Date(now); d.setMonth(d.getMonth() - 3);       return d }
    case '6m':  { const d = new Date(now); d.setMonth(d.getMonth() - 6);       return d }
    case '1y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d }
  }
}

function groupBuckets(classes: { startsAt: Date; capacity: number; _count: { bookings: number } }[], period: OccupancyPeriod) {
  const isDaily = period === '7d' || period === '30d'
  const buckets = new Map<string, { label: string; bookings: number; capacity: number }>()

  for (const cls of classes) {
    const d = new Date(cls.startsAt)
    const key = isDaily
      ? d.toISOString().split('T')[0]
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = isDaily
      ? d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
      : d.toLocaleDateString('es-CL', { month: 'short', ...(period === '1y' ? { year: '2-digit' } : {}) })

    const prev = buckets.get(key) ?? { label, bookings: 0, capacity: 0 }
    prev.bookings  += cls._count.bookings
    prev.capacity  += cls.capacity
    buckets.set(key, prev)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      label: v.label,
      pct: v.capacity > 0 ? Math.round((v.bookings / v.capacity) * 100) : 0,
      bookings: v.bookings,
      capacity: v.capacity,
    }))
}

function topByKey<T extends { bookings: number; capacity: number }>(
  map: Map<string, T & { label: string; classes: number }>
) {
  let best: (T & { label: string; classes: number; key: string }) | null = null
  let bestPct = -1
  for (const [key, v] of map) {
    const pct = v.capacity > 0 ? (v.bookings / v.capacity) * 100 : 0
    if (pct > bestPct) { bestPct = pct; best = { ...v, key } }
  }
  return best ? { ...best, pct: Math.round(bestPct) } : null
}

export async function getClassOccupancy(gymId: string, period: OccupancyPeriod = '7d') {
  const from = periodFrom(period)
  const now  = new Date()

  const classes = await prisma.class.findMany({
    where: { gymId, startsAt: { gte: from, lte: now } },
    select: {
      startsAt: true, capacity: true,
      classType: { select: { name: true, color: true } },
      _count: { select: { bookings: true } },
    },
  })

  if (classes.length === 0) {
    return { avgOccupancy: 0, totalClasses: 0, totalBookings: 0, totalCapacity: 0, history: [], topType: null, topSlot: null }
  }

  const totalBookings = classes.reduce((s, c) => s + c._count.bookings, 0)
  const totalCapacity = classes.reduce((s, c) => s + c.capacity, 0)
  const avgOccupancy  = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0
  const history       = groupBuckets(classes, period)

  // Top por tipo de clase
  const byType = new Map<string, { label: string; color: string | null; bookings: number; capacity: number; classes: number }>()
  for (const c of classes) {
    const key = c.classType.name
    const prev = byType.get(key) ?? { label: key, color: c.classType.color, bookings: 0, capacity: 0, classes: 0 }
    prev.bookings += c._count.bookings
    prev.capacity += c.capacity
    prev.classes  += 1
    byType.set(key, prev)
  }
  const rawTopType = topByKey(byType)
  const topType = rawTopType ? { name: rawTopType.label, color: rawTopType.color, pct: rawTopType.pct, classes: rawTopType.classes } : null

  // Top por horario (hora de inicio)
  const bySlot = new Map<string, { label: string; bookings: number; capacity: number; classes: number }>()
  for (const c of classes) {
    const h   = new Date(c.startsAt).getHours()
    const key = String(h).padStart(2, '0') + ':00'
    const prev = bySlot.get(key) ?? { label: key, bookings: 0, capacity: 0, classes: 0 }
    prev.bookings += c._count.bookings
    prev.capacity += c.capacity
    prev.classes  += 1
    bySlot.set(key, prev)
  }
  const rawTopSlot = topByKey(bySlot)
  const topSlot = rawTopSlot ? { hour: rawTopSlot.label, pct: rawTopSlot.pct, classes: rawTopSlot.classes } : null

  return { avgOccupancy, totalClasses: classes.length, totalBookings, totalCapacity, history, topType, topSlot }
}

export async function getGymStats(gymId: string) {
  const [
    totalMembers, activeMembers, trialMembers, inactiveMembers, todayClasses,
    maleMembers, femaleMembers,
  ] = await Promise.all([
    prisma.user.count({ where: { gymId, role: 'MEMBER' } }),
    prisma.user.count({ where: { gymId, role: 'MEMBER', memberships: { some: { status: 'ACTIVE' } } } }),
    prisma.user.count({ where: { gymId, role: 'MEMBER', memberships: { some: { status: 'TRIAL' } }, NOT: { memberships: { some: { status: 'ACTIVE' } } } } }),
    prisma.user.count({ where: { gymId, role: 'MEMBER', memberships: { none: { status: { in: ['ACTIVE', 'TRIAL'] } } } } }),
    prisma.class.count({
      where: {
        gymId,
        startsAt: gymDayRangeFromToday(await getGymTimezone(gymId)), // hoy en la zona del gym
      },
    }),
    prisma.user.count({ where: { gymId, role: 'MEMBER', gender: 'M' } }),
    prisma.user.count({ where: { gymId, role: 'MEMBER', gender: 'F' } }),
  ])

  const [expiringMemberships, inactiveMembers_list] = await Promise.all([
    prisma.membership.findMany({
      where: {
        user: { gymId },
        status: 'ACTIVE',
        endsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true } },
      },
      orderBy: { endsAt: 'asc' },
    }),
    // Alumnos sin membresía activa (inactivos)
    prisma.user.findMany({
      where: {
        gymId,
        role: 'MEMBER',
        memberships: { none: { status: { in: ['ACTIVE', 'TRIAL'] } } },
      },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  return {
    members: {
      total: totalMembers,
      active: activeMembers,
      trial: trialMembers,
      inactive: inactiveMembers,
      male: maleMembers,
      female: femaleMembers,
      other: totalMembers - maleMembers - femaleMembers,
    },
    todayClasses,
    expiringMemberships,
    inactiveMembers: inactiveMembers_list,
  }
}
