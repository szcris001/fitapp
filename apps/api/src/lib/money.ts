/**
 * Montos en unidad mínima ISO 4217 (Plan.priceCents, Membership.pricePaid, …).
 * CLP no tiene decimales: la unidad mínima es el peso (40000 = $40.000), igual que
 * en Stripe y Mercado Pago. USD, MXN, COP, PEN, ARS, BRL: centavos (×100).
 * Nunca dividir por 100 a mano: usar toMajorUnits/toMinorUnits.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'PYG', 'JPY', 'KRW', 'VND', 'ISK', 'UGX', 'XAF', 'XOF'])

export function currencyExponent(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2
}

/** Unidad mínima → monto que ve la persona / envían las pasarelas (p. ej. 1999 USD → 19.99) */
export function toMajorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency)
}

/** Monto ingresado por la persona → unidad mínima (p. ej. 19.99 USD → 1999; 40000 CLP → 40000) */
export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyExponent(currency))
}
