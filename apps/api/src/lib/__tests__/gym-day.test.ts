import { describe, it, expect } from 'vitest'
import { gymLocalDate, startOfGymDay, gymDayRange, gymDayRangeFromToday, addGymLocalDays, daysBetweenGymLocal } from '../gym-day'

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

  // QA producción 2026-10-14: nextMembershipPeriod() usaba Date.setDate(), que preserva la
  // hora de pared del proceso donde corre el servidor (nunca fijado a Chile). Si el período
  // de 30 días cruzaba un cambio de horario en ESA zona (que en CI/sandbox puede no ser la
  // de Chile), endsAt quedaba 30 días ± 1h en vez de 30 exactos, y el contador de "días
  // restantes" en el dashboard mostraba 31 en vez de 30.
  describe('addGymLocalDays / daysBetweenGymLocal — fix del bug de "31d restantes"', () => {
    it('30 días calendario sin cruzar cambio de horario: exactos, no 30±1h', () => {
      const start = new Date('2026-10-14T05:24:46.920Z') // 02:24:46 en Santiago (UTC-3)
      const end = addGymLocalDays(start, 30, SCL)
      expect(gymLocalDate(end, SCL)).toBe('2026-11-13')
      expect((end.getTime() - start.getTime()) / 86_400_000).toBe(30) // exacto, sin el +1h del bug
    })

    it('el resultado no depende de la TZ ambiente del proceso, solo de la del gym', () => {
      // Mismo instante de inicio, dos zonas de gym distintas → resultados distintos pero
      // cada uno correcto para SU zona — la función nunca mira process.env.TZ.
      const start = new Date('2026-10-14T05:24:46.920Z')
      const chile = addGymLocalDays(start, 30, SCL)
      const utc = addGymLocalDays(start, 30, 'UTC')
      expect(gymLocalDate(chile, SCL)).toBe('2026-11-13')
      expect(gymLocalDate(utc, 'UTC')).toBe('2026-11-13')
    })

    it('30 días que SÍ cruzan un cambio de horario real en Chile: sigue siendo 30 días calendario', () => {
      // 2026-09-06 es cuando Santiago adelanta el reloj (ver test de arriba) — un período
      // que arranca antes y cruza esa fecha dura 29h menos en milisegundos reales, pero
      // sigue siendo "30 días" en el calendario de Chile, que es lo que debe mostrar la UI.
      const start = new Date('2026-08-20T15:00:00Z') // 12:00 en Santiago, invierno (UTC-4)
      const end = addGymLocalDays(start, 30, SCL)
      expect(gymLocalDate(start, SCL)).toBe('2026-08-20')
      expect(gymLocalDate(end, SCL)).toBe('2026-09-19')
      // En milisegundos NO son exactos 30 días (se perdió 1h al adelantar el reloj) —
      // comportamiento correcto, es lo que "días restantes" debe ignorar.
      expect((end.getTime() - start.getTime()) / 86_400_000).not.toBe(30)
      expect(daysBetweenGymLocal(start, end, SCL)).toBe(30)
    })

    it('daysBetweenGymLocal cuenta días calendario, no milisegundos/86400000', () => {
      const now = new Date('2026-10-14T05:24:46.920Z')
      const endsAt = addGymLocalDays(now, 30, SCL)
      // El bug original: Math.ceil((endsAt-now)/86400000) con endsAt desplazado 1h daba 31
      expect(daysBetweenGymLocal(now, endsAt, SCL)).toBe(30)
    })
  })
})
