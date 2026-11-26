/**
 * Instituciones que pueden recibir la transferencia (lista cerrada): bancos, cooperativas
 * de ahorro y crédito y emisores de tarjetas de pago con provisión de fondos no bancarios
 * (cuentas vista/prepago tipo Mercado Pago o Tenpo). Todas fiscalizadas por la CMF.
 *
 * Fuentes (tablas "Vigentes"), revisadas el 2026-11-24:
 *  - Bancos: https://www.cmfchile.cl/portal/principal/623/w4-article-47003.html
 *  - Cooperativas: https://www.cmfchile.cl/institucional/mercados/consulta.php?mercado=B&entidad=BCCOO&Estado=VI
 *  - Emisores de prepago: https://www.cmfchile.cl/institucional/mercados/consulta.php?mercado=B&Estado=VI&entidad=TPEEM
 *
 * Se revisa cada 6 meses (ver docs/MANTENIMIENTO_PRODUCCION.md): fusiones o bajas cambian la
 * lista. Banco Security queda fuera a propósito: la CMF ya no lo lista como banco vigente
 * (fusión con BICE autorizada en oct-2025).
 * Los nombres son los de la CMF sin forma societaria (S.A., Ltda.). Los emisores de prepago
 * incluyen algunos de perfil B2B (infraestructura de emisión): están porque la CMF los
 * registra como vigentes, no porque todos ofrezcan cuenta a personas.
 */
export const CHILE_BANKS_REVIEWED_AT = '2026-11-24'

const BANKS = [
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

const COOPERATIVES = [
  'Ahorrocoop Diego Portales',
  'Coopeuch',
  'Cooperativa El Detallista',
  'Cooperativa Nacional para la Familia',
  'Cooperativa Oriente',
  'Cooperativa Talagante',
  'Cooperativa Unión Aérea',
] as const

const PREPAID_ISSUERS = [
  'Compañía Emisora de Medios de Pago Digitales',
  'Fintoc Pagos',
  'Fintual Prepago',
  'Global Card',
  'Haulmer Prepago',
  'Inversiones LP',
  'Los Andes Tarjetas de Prepago',
  'Mercado Pago Emisora',
  'Metro Emisora de Medios de Pago',
  'Pomelo Tech Chile',
  'Prex Chile',
  'Sociedad Emisora de Tarjetas Los Héroes',
  'SumUp Chile Blue',
  'Tenpo Payments',
  'Tricard',
] as const

// Se mantiene el nombre CHILE_BANKS (lo usan la validación y los endpoints); incluye las tres
// categorías. Orden alfabético para el desplegable.
export const CHILE_BANKS = [...BANKS, ...COOPERATIVES, ...PREPAID_ISSUERS]
  .sort((a, b) => a.localeCompare(b, 'es')) as unknown as readonly [string, ...string[]]

export const BANK_ACCOUNT_TYPES = ['Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro'] as const
