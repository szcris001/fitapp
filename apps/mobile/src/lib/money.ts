/**
 * Montos en unidad mínima ISO 4217, igual que la API y la web (apps/api/src/lib/money.ts).
 * CLP no tiene decimales: 40000 = $40.000. USD/MXN/COP/PEN: centavos.
 * Nunca dividir por 100 a mano.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'PYG', 'JPY', 'KRW', 'VND', 'ISK', 'UGX', 'XAF', 'XOF'])

export function currencyExponent(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2
}

export function toMajorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency)
}

export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyExponent(currency))
}

/** "40.000 CLP", "19,99 USD" */
export function formatMoney(minor: number, currency = 'CLP'): string {
  return `${toMajorUnits(minor, currency).toLocaleString('es-CL')} ${currency}`
}
