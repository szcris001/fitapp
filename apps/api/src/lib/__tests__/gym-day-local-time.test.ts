import { describe, it, expect } from 'vitest'
import { atGymLocalTime, gymLocalTime, localWeekday, addLocalDays } from '../gym-day'

const TZ = 'America/Santiago'

describe('gym-day: hora local', () => {
  it('atGymLocalTime respeta la hora local en invierno (UTC-4) y verano (UTC-3)', () => {
    expect(atGymLocalTime('2026-07-06', 21, 30, TZ).toISOString()).toBe('2026-07-07T01:30:00.000Z')
    expect(atGymLocalTime('2026-10-05', 21, 30, TZ).toISOString()).toBe('2026-10-06T00:30:00.000Z')
  })

  it('el día del cambio de horario (2026-09-06, 00:00 → 01:00) mantiene la hora local', () => {
    const t = atGymLocalTime('2026-09-06', 21, 30, TZ)
    expect(gymLocalTime(t, TZ)).toEqual({ hour: 21, minute: 30 })
  })

  it('localWeekday usa el día local, no el UTC', () => {
    expect(localWeekday('2026-09-28')).toBe(1) // lunes
    expect(addLocalDays('2026-09-28', 3)).toBe('2026-10-01')
  })
})
