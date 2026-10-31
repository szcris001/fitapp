import { describe, it, expect } from 'vitest'
import { formatScore } from '../wod.service'

describe('formatScore', () => {
  it('TIME: segundos a mm:ss', () => {
    expect(formatScore(125, null, 'TIME')).toBe('2:05')
  })

  it('CUSTOM: usa scoreText tal cual', () => {
    expect(formatScore(0, 'Llegó hasta el minuto 8', 'CUSTOM')).toBe('Llegó hasta el minuto 8')
  })

  it('WEIGHT: agrega la unidad "kg" (QA 2026-10-30, hallazgo wods H04)', () => {
    expect(formatScore(82.5, null, 'WEIGHT')).toBe('82.5 kg')
  })

  it('ROUNDS/REPS: número crudo, sin unidad', () => {
    expect(formatScore(14, null, 'ROUNDS')).toBe('14')
    expect(formatScore(220, null, 'REPS')).toBe('220')
  })
})
