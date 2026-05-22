export function calculateLoad(rmKg: number | null, percentage: number, rounding = 2.5): number | null {
  if (rmKg === null) return null
  const raw = rmKg * percentage / 100
  return Math.round(raw / rounding) * rounding
}
