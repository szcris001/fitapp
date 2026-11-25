/**
 * Bancos autorizados en Chile para recibir la transferencia de suscripción (lista cerrada).
 *
 * Fuente: CMF, https://www.cmfchile.cl/portal/principal/623/w4-article-47003.html
 * (bancos establecidos, Banco del Estado y sucursales de bancos extranjeros vigentes).
 * Revisada: 2026-11-24. Se revisa cada 6 meses (ver docs/MANTENIMIENTO_PRODUCCION.md):
 * fusiones o bajas (p. ej. Banco Security -> BICE, autorizada oct-2025) cambian la lista.
 * No incluye emisores de prepago/cooperativas (Mercado Pago, Coopeuch, etc.): no son bancos CMF.
 */
export const CHILE_BANKS_REVIEWED_AT = '2026-11-24'

export const CHILE_BANKS = [
  'Bank of China (Agencia en Chile)',
  'Banco BICE',
  'Banco BTG Pactual Chile',
  'Banco Consorcio',
  'Banco de Chile',
  'Banco de Crédito e Inversiones (BCI)',
  'Banco Falabella',
  'Banco Internacional',
  'Banco Itaú Chile',
  'Banco Ripley',
  'Banco Santander-Chile',
  'BancoEstado',
  'China Construction Bank (Agencia en Chile)',
  'HSBC Bank (Chile)',
  'JP Morgan Chase Bank',
  'Scotiabank Chile',
  'Tanner Banco Digital',
  'Tenpo Bank Chile',
] as const

export const BANK_ACCOUNT_TYPES = ['Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro'] as const
