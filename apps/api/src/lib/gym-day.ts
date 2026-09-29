/**
 * Días calendario en la zona horaria del gym (Gym.timezone, p. ej. America/Santiago).
 *
 * Un WOD o un "hoy" es un día local del gym, no del servidor: con setHours(0) el
 * resultado cambiaba según la TZ del proceso (Chile en dev, UTC en Docker).
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// Minutos que la zona horaria está adelantada respecto de UTC en ese instante
function offsetMinutes(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/** Fecha local 'YYYY-MM-DD'. Un string solo-fecha se toma tal cual (ya es fecha local). */
export function gymLocalDate(input: Date | string, timezone: string): string {
  if (typeof input === 'string' && DATE_ONLY.test(input)) return input
  return new Date(input).toLocaleDateString('sv', { timeZone: timezone })
}

/**
 * Instante en que empieza la fecha local 'YYYY-MM-DD' en la zona del gym (00:00 local,
 * o el primer instante del día si esa medianoche no existe por el cambio de horario).
 */
export function startOfGymDay(localDate: string, timezone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number)
  const utcMidnight = Date.UTC(y, m - 1, d)
  // Candidatos con el offset vigente al inicio y al final del día; el correcto es el
  // primero que efectivamente cae en esa fecha local
  const candidates = [utcMidnight, utcMidnight + 86_400_000]
    .map(ref => utcMidnight - offsetMinutes(new Date(ref), timezone) * 60_000)
    .filter(t => gymLocalDate(new Date(t), timezone) === localDate)
  return new Date(Math.min(...candidates))
}

/** Suma días a una fecha local 'YYYY-MM-DD' */
export function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Rango [inicio del día local, inicio del día siguiente) para filtros de Prisma */
export function gymDayRange(input: Date | string, timezone: string): { gte: Date; lt: Date } {
  const day = gymLocalDate(input, timezone)
  return { gte: startOfGymDay(day, timezone), lt: startOfGymDay(addLocalDays(day, 1), timezone) }
}

/** Rango del día local que está a `daysAhead` días de hoy en la zona del gym */
export function gymDayRangeFromToday(timezone: string, daysAhead = 0, now = new Date()): { gte: Date; lt: Date } {
  return gymDayRange(addLocalDays(gymLocalDate(now, timezone), daysAhead), timezone)
}

export const DEFAULT_GYM_TIMEZONE = 'America/Santiago'

/** Día canónico de un WOD: inicio del día local del gym para una fecha o un instante */
export function gymDayStart(input: Date | string, timezone: string): Date {
  return startOfGymDay(gymLocalDate(input, timezone), timezone)
}

/** Día de la semana (0 = domingo) de una fecha local 'YYYY-MM-DD' */
export function localWeekday(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay()
}

/** Hora y minuto locales de un instante en la zona del gym */
export function gymLocalTime(instant: Date, timezone: string): { hour: number; minute: number } {
  const [hour, minute] = instant
    .toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .split(':').map(Number)
  return { hour, minute }
}

/**
 * Instante de la hora local hh:mm del día local 'YYYY-MM-DD'. Si ese día cambia el horario
 * antes de esa hora, se corrige con el offset vigente a esa hora.
 */
export function atGymLocalTime(localDate: string, hour: number, minute: number, timezone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  // Primera aproximación con el offset de ese reloj de pared y corrección con el offset
  // vigente en el instante resultante (difieren solo cerca de un cambio de horario)
  const first = wall - offsetMinutes(new Date(wall), timezone) * 60_000
  return new Date(wall - offsetMinutes(new Date(first), timezone) * 60_000)
}

/** Zona horaria configurada del gym (Gym.timezone) */
export async function getGymTimezone(gymId: string): Promise<string> {
  const { prisma } = await import('./prisma')
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { timezone: true } })
  return gym?.timezone || DEFAULT_GYM_TIMEZONE
}
