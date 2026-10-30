// Zona horaria del gym — hoy mismo hardcodeada (no hay un solo gym en producción
// fuera de Chile todavía); si eso cambia, esto debería venir de gym.timezone
// (ver DEFAULT_GYM_TIMEZONE en apps/api/src/lib/gym-day.ts, la misma idea del lado API).
export const GYM_TIMEZONE = 'America/Santiago'

/**
 * Convierte una fecha+hora "de pared" en la zona del gym (p. ej. día "2026-10-05",
 * hora "19:00") al instante UTC correcto, en formato ISO.
 *
 * `new Date("2026-10-05T19:00:00")` NO sirve para esto: sin sufijo de zona, el motor
 * de JS la interpreta en la zona horaria del navegador/servidor que ejecuta el código,
 * no en la del gym — así que la misma clase se crea en una hora real distinta según
 * el reloj de quien la crea. Esta función siempre da el mismo instante sin importar
 * en qué zona horaria corra el proceso que la llama.
 */
export function gymLocalToIso(day: string, hhmm: string, timezone: string = GYM_TIMEZONE): string {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wanted = Date.UTC(y, m - 1, d, h, mi)
  let t = wanted
  // Converge en pocas iteraciones: cada vuelta corrige el instante por la diferencia
  // entre la hora de pared obtenida y la que se pidió, incluyendo el caso límite de
  // cruzar un cambio de horario de verano entre el instante de partida y el corregido.
  for (let i = 0; i < 3; i++) {
    const asLocal = new Date(t).toLocaleString('sv', { timeZone: timezone })
    const [ld, lt] = asLocal.split(' ')
    const [ly, lm, ldd] = ld.split('-').map(Number)
    const [lh, lmi] = lt.split(':').map(Number)
    t += wanted - Date.UTC(ly, lm - 1, ldd, lh, lmi)
  }
  return new Date(t).toISOString()
}

/**
 * Día calendario de `d` en la zona del gym, como medianoche UTC de ese día — para que
 * el resto del código pueda sumar/comparar días con setUTCDate/getUTCDate sin que la
 * zona horaria de quien ejecuta el código (navegador o proceso) lo corra un día. Sin
 * esto, "hoy" calculado con `new Date()` del navegador queda un día adelantado al de
 * Chile entre las 00:00 y las 03:00 UTC, que todavía es "ayer" en Chile (hallazgo QA:
 * la pantalla de nueva clase armaba la semana equivocada en ese horario).
 */
export function gymCalendarDate(d: Date | string = new Date(), timezone: string = GYM_TIMEZONE): Date {
  const [y, m, day] = new Date(d).toLocaleDateString('sv', { timeZone: timezone }).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

/**
 * Convierte un instante UTC a su hora de pared en la zona del gym, como string
 * "flotante" sin offset ("2026-10-26T07:00:00"). FullCalendar, sin el plugin de
 * moment-timezone/luxon, no sabe convertir a una zona IANA nombrada — pasarle
 * `timeZone="America/Santiago"` directamente no hace nada y termina mostrando el
 * instante crudo en UTC (hallazgo QA 2026-10-30, qa/reports/2026-10-30-0046/clases.md).
 * La forma que sí funciona sin plugin extra: convertir nosotros a hora de Chile y
 * entregarle a FullCalendar un string sin zona — lo muestra tal cual, sea cual sea
 * la del navegador (su comportamiento default, `timeZone="local"`, para fechas sin offset).
 */
export function toGymFloatingIso(iso: string, timezone: string = GYM_TIMEZONE): string {
  return new Date(iso).toLocaleString('sv', { timeZone: timezone }).replace(' ', 'T')
}

/**
 * Días calendario que faltan hasta `target`, contados en la zona del gym (no la del
 * navegador). Restar milisegundos y dividir por 86 400 000 (como antes) se corre 1 día
 * cada vez que el período cruza un cambio de horario — real en Chile, o el de la TZ
 * donde corra el proceso si `nextMembershipPeriod` no estuviera fijado a la del gym.
 * Contar días calendario en vez de milisegundos es inmune a ambos casos (hallazgo QA
 * 2026-10-14, "31d restantes" en vez de "30d").
 */
export function daysUntilGymLocal(target: Date | string, timezone: string = GYM_TIMEZONE): number {
  return Math.round(
    (gymCalendarDate(target, timezone).getTime() - gymCalendarDate(new Date(), timezone).getTime()) / 86_400_000
  )
}
