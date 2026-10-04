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
