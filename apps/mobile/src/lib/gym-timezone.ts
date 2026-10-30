const FALLBACK_TIMEZONE = 'America/Santiago'

let cached: string | null = null

export function setGymTimezone(tz: string | null | undefined) {
  if (tz) cached = tz
}

// Zona horaria del gym para mostrar horarios de clase — sin esto, toLocaleTimeString/
// toLocaleDateString usan la zona del DISPOSITIVO: un alumno viajando o con el reloj
// mal configurado ve horarios de clase incorrectos sin ningún indicio y puede perder
// la clase o reservar la equivocada (hallazgo QA mobile-web, 2026-10-30; mismo
// problema ya corregido en el panel web, ver apps/web/lib/gym-timezone.ts).
// Se cachea en memoria tras el primer GET /gyms/me de la sesión (HomeScreen/
// ClassesScreen llaman setGymTimezone); FALLBACK_TIMEZONE de resguardo mientras
// esa respuesta no llegó todavía.
export function getGymTimezone(): string {
  return cached ?? FALLBACK_TIMEZONE
}

// 'YYYY-MM-DD' en la zona del gym, no en UTC — compararlo contra "hoy" con
// `.toISOString().split('T')[0]` (UTC) hace que una clase cerca de medianoche quede
// marcada "HOY" o no según la hora UTC, no la hora real del gym (mismo error de
// fondo que el "today" del calendario web, ya corregido ahí con toGymFloatingIso).
export function gymDayStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: getGymTimezone() })
}
