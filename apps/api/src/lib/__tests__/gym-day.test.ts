import { describe, it, expect } from 'vitest'
import { gymLocalDate, startOfGymDay, gymDayRange, gymDayRangeFromToday } from '../gym-day'

const SCL = 'America/Santiago' // UTC-3 en verano (sep–abr), UTC-4 en invierno

describe('gym-day', () => {
  it('fecha local de un instante según la zona del gym, no del servidor', () => {
    // 23:30 del 28-sep en Santiago = 02:30 UTC del 29-sep
    expect(gymLocalDate(new Date('2026-09-29T02:30:00Z'), SCL)).toBe('2026-09-28')
    expect(gymLocalDate(new Date('2026-09-29T02:30:00Z'), 'UTC')).toBe('2026-09-29')
  })

  it('un string solo-fecha es la fecha local tal cual (no medianoche UTC)', () => {
    expect(gymLocalDate('2026-09-28', SCL)).toBe('2026-09-28')
  })

  it('inicio del día local en horario de verano (UTC-3) e invierno (UTC-4)', () => {
    expect(startOfGymDay('2026-09-28', SCL).toISOString()).toBe('2026-09-28T03:00:00.000Z')
    expect(startOfGymDay('2026-06-15', SCL).toISOString()).toBe('2026-06-15T04:00:00.000Z')
  })

  it('el día que se adelanta la hora dura 23 h (la medianoche local no existe)', () => {
    // 2026-09-06: a las 00:00 locales el reloj salta a 01:00 (UTC-4 → UTC-3)
    const r = gymDayRange('2026-09-06', SCL)
    expect(r.gte.toISOString()).toBe('2026-09-06T04:00:00.000Z')
    expect((r.lt.getTime() - r.gte.getTime()) / 3_600_000).toBe(23)
  })

  it('el día que se atrasa la hora dura 25 h', () => {
    const fallBack = [...Array(120)].map((_, i) => new Date(Date.UTC(2026, 2, 1) + i * 86_400_000))
      .map(d => d.toISOString().slice(0, 10))
      .find(day => { const r = gymDayRange(day, SCL); return r.lt.getTime() - r.gte.getTime() === 25 * 3_600_000 })
    expect(fallBack).toBeDefined()
  })

  it('una clase a las 22:00 locales cae en su día local aunque en UTC ya sea el siguiente', () => {
    const classStart = new Date('2026-09-29T01:00:00Z') // 22:00 del 28 en Santiago
    const r = gymDayRange(classStart, SCL)
    expect(r.gte.toISOString()).toBe('2026-09-28T03:00:00.000Z')
    expect(r.lt.toISOString()).toBe('2026-09-29T03:00:00.000Z')
    // Un WOD guardado como el inicio del día local 28 cae dentro del rango
    const wodDate = startOfGymDay('2026-09-28', SCL)
    expect(wodDate >= r.gte && wodDate < r.lt).toBe(true)
  })

  it('rango de "hoy + N días" en la zona del gym', () => {
    const now = new Date('2026-09-29T02:30:00Z') // aún 28-sep en Santiago
    expect(gymDayRangeFromToday(SCL, 0, now).gte.toISOString()).toBe('2026-09-28T03:00:00.000Z')
    expect(gymDayRangeFromToday(SCL, 3, now).gte.toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })
})
