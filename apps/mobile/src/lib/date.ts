/**
 * Fecha local 'YYYY-MM-DD' del dispositivo. `new Date().toISOString().split('T')[0]`
 * da la fecha en UTC, no la local — en Chile (UTC-3/-4) eso muestra el día
 * equivocado desde las ~21:00 hasta medianoche, justo el horario pico del gym.
 */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
