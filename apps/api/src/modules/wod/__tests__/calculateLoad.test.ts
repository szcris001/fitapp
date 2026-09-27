import { describe, it, expect } from 'vitest'
import { calculateLoad } from '../wod.utils'

describe('calculateLoad', () => {
  // -------------------------------------------------------------------------
  // Alumno sin RM registrado
  // -------------------------------------------------------------------------
  describe('alumno sin RM', () => {
    it('rmKg null → devuelve null (frontend muestra placeholder)', () => {
      expect(calculateLoad(null, 75)).toBeNull()
    })

    it('rmKg null con cualquier porcentaje → siempre null', () => {
      expect(calculateLoad(null, 0)).toBeNull()
      expect(calculateLoad(null, 100)).toBeNull()
      expect(calculateLoad(null, 110)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Casos felices con redondeo por defecto (2.5 kg)
  // -------------------------------------------------------------------------
  describe('casos felices — redondeo por defecto 2.5 kg', () => {
    it('porcentaje 0% → 0 kg (entrada de calor sin carga)', () => {
      expect(calculateLoad(100, 0)).toBe(0)
    })

    it('100 kg al 50% → 50 kg', () => {
      expect(calculateLoad(100, 50)).toBe(50)
    })

    it('100 kg al 75% → 75 kg (múltiplo exacto de 2.5)', () => {
      expect(calculateLoad(100, 75)).toBe(75)
    })

    it('100 kg al 80% → 80 kg (múltiplo exacto de 2.5)', () => {
      expect(calculateLoad(100, 80)).toBe(80)
    })

    it('100 kg al 100% → 100 kg (al RM exacto)', () => {
      expect(calculateLoad(100, 100)).toBe(100)
    })

    it('100 kg al 110% → 110 kg (sobre el RM, válido en programación)', () => {
      expect(calculateLoad(100, 110)).toBe(110)
    })
  })

  // -------------------------------------------------------------------------
  // Redondeo real con 2.5 kg
  // -------------------------------------------------------------------------
  describe('redondeo al múltiplo de 2.5 más cercano', () => {
    it('100 kg al 73% = 73 kg → redondea a 72.5 kg (29.2 → round → 29 → ×2.5)', () => {
      // 100 * 73 / 100 = 73 → 73 / 2.5 = 29.2 → round(29.2) = 29 → 29 * 2.5 = 72.5
      expect(calculateLoad(100, 73)).toBe(72.5)
    })

    it('100 kg al 76% = 76 kg → redondea a 75 kg (30.4 → round → 30 → ×2.5)', () => {
      // 76 / 2.5 = 30.4 → round = 30 → 30 * 2.5 = 75
      expect(calculateLoad(100, 76)).toBe(75)
    })

    it('100 kg al 77% = 77 kg → redondea a 77.5 kg (30.8 → round → 31 → ×2.5)', () => {
      // 77 / 2.5 = 30.8 → round = 31 → 31 * 2.5 = 77.5
      expect(calculateLoad(100, 77)).toBe(77.5)
    })

    it('87 kg al 65% = 56.55 kg → redondea a 57.5 kg (22.62 → round → 23 → ×2.5)', () => {
      // 87 * 65 / 100 = 56.55 → 56.55 / 2.5 = 22.62 → round(22.62) = 23 → 23 * 2.5 = 57.5
      expect(calculateLoad(87, 65, 2.5)).toBe(57.5)
    })

    it('50 kg al 60% = 30 kg → es múltiplo exacto, sin cambio', () => {
      expect(calculateLoad(50, 60, 2.5)).toBe(30)
    })
  })

  // -------------------------------------------------------------------------
  // Redondeo personalizado: 1 kg
  // -------------------------------------------------------------------------
  describe('redondeo personalizado 1 kg', () => {
    it('100 kg al 73% con rounding=1 → 73 kg (sin fracción)', () => {
      expect(calculateLoad(100, 73, 1)).toBe(73)
    })

    it('100 kg al 76% con rounding=1 → 76 kg', () => {
      expect(calculateLoad(100, 76, 1)).toBe(76)
    })

    it('87 kg al 65% con rounding=1 → 57 kg (56.55 → round → 57)', () => {
      expect(calculateLoad(87, 65, 1)).toBe(57)
    })
  })

  // -------------------------------------------------------------------------
  // Redondeo personalizado: 0.5 kg
  // -------------------------------------------------------------------------
  describe('redondeo personalizado 0.5 kg', () => {
    it('100 kg al 73% con rounding=0.5 → 73 kg (73 / 0.5 = 146, round = 146, × 0.5 = 73)', () => {
      expect(calculateLoad(100, 73, 0.5)).toBe(73)
    })

    it('100 kg al 73% con rounding=0.5 no devuelve fracción cuando raw es entero', () => {
      // 73 es divisible exactamente por 0.5, debe mantenerse
      expect(calculateLoad(100, 73, 0.5)).toBe(73)
    })
  })

  // -------------------------------------------------------------------------
  // Redondeo personalizado: 5 kg
  // -------------------------------------------------------------------------
  describe('redondeo personalizado 5 kg', () => {
    it('100 kg al 73% con rounding=5 → 75 kg (73 / 5 = 14.6 → round → 15 → × 5 = 75)', () => {
      expect(calculateLoad(100, 73, 5)).toBe(75)
    })

    it('100 kg al 70% con rounding=5 → 70 kg (múltiplo exacto)', () => {
      expect(calculateLoad(100, 70, 5)).toBe(70)
    })

    it('100 kg al 72% con rounding=5 → 70 kg (72 / 5 = 14.4 → round → 14 → × 5 = 70)', () => {
      expect(calculateLoad(100, 72, 5)).toBe(70)
    })
  })

  // -------------------------------------------------------------------------
  // Valores de borde
  // -------------------------------------------------------------------------
  describe('valores de borde', () => {
    it('rmKg=0 con cualquier porcentaje → 0 kg', () => {
      expect(calculateLoad(0, 75)).toBe(0)
      expect(calculateLoad(0, 100)).toBe(0)
    })

    it('porcentaje decimal 75.5% con rounding=2.5 → 75 kg', () => {
      // 100 * 75.5 / 100 = 75.5 → 75.5 / 2.5 = 30.2 → round = 30 → 30 * 2.5 = 75
      expect(calculateLoad(100, 75.5, 2.5)).toBe(75)
    })

    it('RM decimal: 102.5 kg al 80% con rounding=2.5 → 82.5 kg', () => {
      // 102.5 * 80 / 100 = 82 → 82 / 2.5 = 32.8 → round = 33 → 33 * 2.5 = 82.5
      expect(calculateLoad(102.5, 80, 2.5)).toBe(82.5)
    })
  })

  // -------------------------------------------------------------------------
  // Precisión de punto flotante
  // -------------------------------------------------------------------------
  describe('precisión flotante', () => {
    it('33.333 kg al 30% con rounding=0.5 → 10 kg (no acumula errores de float)', () => {
      // 33.333 * 30 / 100 = 9.9999 → / 0.5 = 19.9998 → round = 20 → * 0.5 = 10
      expect(calculateLoad(33.333, 30, 0.5)).toBe(10)
    })

    it('resultado correcto con RM que genera representación binaria imprecisa', () => {
      // 90 * 33.33... → evita NaN o Infinity
      const result = calculateLoad(90, 33, 2.5)
      expect(result).not.toBeNaN()
      expect(typeof result).toBe('number')
    })
  })
})
