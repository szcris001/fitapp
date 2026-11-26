import { describe, it, expect } from 'vitest'
import { CHILE_BANKS, BANK_ACCOUNT_TYPES } from '../chile-banks'

describe('chile-banks — lista cerrada de instituciones', () => {
  it('sin duplicados ni vacíos, y en orden alfabético', () => {
    expect(new Set(CHILE_BANKS).size).toBe(CHILE_BANKS.length)
    expect(CHILE_BANKS.every(b => b.trim() === b && b.length > 0)).toBe(true)
    expect([...CHILE_BANKS]).toEqual([...CHILE_BANKS].sort((a, b) => a.localeCompare(b, 'es')))
  })

  it('incluye bancos, cooperativas y emisores de prepago (CMF)', () => {
    expect(CHILE_BANKS).toContain('BancoEstado')
    expect(CHILE_BANKS).toContain('Coopeuch')
    expect(CHILE_BANKS).toContain('Mercado Pago Emisora')
    expect(CHILE_BANKS).toContain('Tenpo Payments')
  })

  it('Banco Security queda fuera (la CMF ya no lo lista como vigente; fusión con BICE)', () => {
    expect(CHILE_BANKS.some(b => /security/i.test(b))).toBe(false)
  })

  it('tipos de cuenta esperados', () => {
    expect([...BANK_ACCOUNT_TYPES]).toEqual(['Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro'])
  })
})
