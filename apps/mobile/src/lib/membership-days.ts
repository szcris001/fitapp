/**
 * Días calendario que faltan hasta `target`, en la hora local del dispositivo (igual que el
 * resto de la app — ningún otro `toLocaleDateString` de mobile fija `timeZone` explícito).
 *
 * Restar milisegundos y dividir por 86 400 000 (`Math.ceil`) se corre 1 día si el período
 * cruza un cambio de horario real entre hoy y `target`: comparar solo las fechas calendario
 * (sin hora) es inmune a eso. Mismo hallazgo que el "31d restantes" del dashboard web
 * (QA 2026-10-14) — ver daysUntilGymLocal en apps/web/lib/gym-timezone.ts.
 */
export function daysUntilLocal(target: Date | string): number {
  const toLocalMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((toLocalMidnight(new Date(target)) - toLocalMidnight(new Date())) / 86_400_000)
}
