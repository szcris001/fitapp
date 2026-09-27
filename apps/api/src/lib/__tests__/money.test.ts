import { describe, it, expect } from 'vitest'
import { toMajorUnits, toMinorUnits, currencyExponent } from '../money'

describe('money — unidad mínima ISO 4217', () => {
  it('CLP no tiene decimales: la unidad mínima es el peso', () => {
    expect(currencyExponent('CLP')).toBe(0)
    expect(toMajorUnits(40000, 'CLP')).toBe(40000)
    expect(toMinorUnits(40000, 'clp')).toBe(40000)
  })

  it('USD, MXN, COP, PEN: centavos', () => {
    expect(toMajorUnits(1999, 'USD')).toBe(19.99)
    expect(toMinorUnits(19.99, 'USD')).toBe(1999)
    expect(toMajorUnits(5000000, 'COP')).toBe(50000)
    expect(toMinorUnits(500, 'MXN')).toBe(50000)
  })
})
