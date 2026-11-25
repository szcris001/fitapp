/**
 * Resolver de pasarelas de cobro Tribu-Box -> gyms.
 *
 * ÚNICO punto de lectura/escritura de `PlatformSettings.billingGateways` (las credenciales
 * viven ahí). Se guardan cifradas en reposo (AES-256-GCM, ver lib/field-crypto.ts); aquí se
 * cifra al escribir y se descifra al leer, así el resto del código ve siempre el JSON claro.
 *
 * `getBillingGatewayConfig` devuelve credenciales completas: SOLO para services del
 * servidor, nunca para serializar en una respuesta.
 */
import { prisma } from '../../lib/prisma'
import { BILLING_PUBLIC_FIELDS, maskGateways, maskSecret } from '../../lib/secrets'
import { decryptJson, encryptJson } from '../../lib/field-crypto'
import { BANK_ACCOUNT_TYPES, CHILE_BANKS } from './chile-banks'

const SETTINGS_ID = 'system'
const CACHE_TTL_MS = 30_000

export type BillingGatewayName = 'flow' | 'stripe' | 'transfer'
export type ConfigSource = 'db' | 'env' | 'none'
type Raw = Record<string, Record<string, unknown>>

let cache: { at: number; value: Raw | null } | null = null

export function invalidateBillingConfigCache() { cache = null }

/** Lee el JSON crudo (con secretos) de la DB. Null = nunca configurado. */
export async function readBillingGateways(opts: { fresh?: boolean } = {}): Promise<Raw | null> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const row = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID }, select: { billingGateways: true } })
  const value = decryptJson<Raw>(row?.billingGateways)
  cache = { at: Date.now(), value }
  return value
}

/** Escribe el JSON completo y invalida la caché. */
export async function writeBillingGateways(value: Raw): Promise<void> {
  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, billingGateways: encryptJson(value) as any },
    update: { billingGateways: encryptJson(value) as any },
  })
  invalidateBillingConfigCache()
}

export const FLOW_URL_SANDBOX = 'https://sandbox.flow.cl/api'
export const FLOW_URL_PROD = 'https://www.flow.cl/api'

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

export interface FlowConfig {
  enabled: boolean; sandbox: boolean; apiKey?: string; secretKey?: string; apiUrl: string; source: ConfigSource
}
export interface StripeConfig { enabled: boolean; secretKey?: string; webhookSecret?: string; source: ConfigSource }
export interface TransferConfig {
  enabled: boolean; source: ConfigSource
  bankName?: string; accountType?: string; accountNumber?: string; holderName?: string
  holderRut?: string; contactEmail?: string; instructions?: string
}

export const TRANSFER_REQUIRED = ['bankName', 'accountNumber', 'holderName', 'holderRut'] as const
export const FLOW_REQUIRED = ['apiKey', 'secretKey'] as const

export function flowConfigFromRaw(raw: Record<string, unknown> | undefined): FlowConfig | null {
  if (raw) {
    const apiKey = str(raw.apiKey), secretKey = str(raw.secretKey)
    const sandbox = raw.sandbox !== false
    return {
      enabled: raw.enabled === true && !!apiKey && !!secretKey,
      sandbox, apiKey, secretKey,
      apiUrl: sandbox ? FLOW_URL_SANDBOX : FLOW_URL_PROD,
      source: 'db',
    }
  }
  return null
}

async function resolveFlow(): Promise<FlowConfig> {
  const fromDb = flowConfigFromRaw((await readBillingGateways())?.flow)
  if (fromDb) return fromDb
  const apiKey = str(process.env.FLOW_API_KEY), secretKey = str(process.env.FLOW_SECRET_KEY)
  if (apiKey && secretKey) {
    // Sin FLOW_API_URL se asume sandbox (comportamiento histórico del código)
    const url = process.env.FLOW_API_URL || FLOW_URL_SANDBOX
    return { enabled: true, sandbox: url.includes('sandbox'), apiKey, secretKey, apiUrl: url, source: 'env' }
  }
  return { enabled: false, sandbox: true, apiUrl: FLOW_URL_SANDBOX, source: 'none' }
}

// Stripe: SOLO env (decisión D2, mientras no esté activo en Chile)
function resolveStripe(): StripeConfig {
  const secretKey = str(process.env.STRIPE_SECRET_KEY)
  return secretKey
    ? { enabled: true, secretKey, webhookSecret: str(process.env.STRIPE_WEBHOOK_SECRET), source: 'env' }
    : { enabled: false, source: 'none' }
}

async function resolveTransfer(): Promise<TransferConfig> {
  const raw = (await readBillingGateways())?.transfer
  if (!raw) return { enabled: false, source: 'none' }
  const cfg: TransferConfig = {
    enabled: false, source: 'db',
    bankName: str(raw.bankName), accountType: str(raw.accountType), accountNumber: str(raw.accountNumber),
    holderName: str(raw.holderName), holderRut: str(raw.holderRut),
    contactEmail: str(raw.contactEmail), instructions: str(raw.instructions),
  }
  cfg.enabled = raw.enabled === true && TRANSFER_REQUIRED.every(k => !!cfg[k])
  return cfg
}

export async function getBillingGatewayConfig(name: 'flow'): Promise<FlowConfig>
export async function getBillingGatewayConfig(name: 'stripe'): Promise<StripeConfig>
export async function getBillingGatewayConfig(name: 'transfer'): Promise<TransferConfig>
export async function getBillingGatewayConfig(name: BillingGatewayName): Promise<FlowConfig | StripeConfig | TransferConfig> {
  if (name === 'flow') return resolveFlow()
  if (name === 'stripe') return resolveStripe()
  return resolveTransfer()
}

/** Pasarelas habilitadas para un país. Flow solo CL. */
export async function listEnabledBillingGateways(country: string): Promise<BillingGatewayName[]> {
  const [flow, stripe, transfer] = await Promise.all([
    resolveFlow(), Promise.resolve(resolveStripe()), resolveTransfer(),
  ])
  const out: BillingGatewayName[] = []
  if (flow.enabled && country === 'CL') out.push('flow')
  if (stripe.enabled) out.push('stripe')
  if (transfer.enabled) out.push('transfer')
  return out
}

const FLOW_FIELDS = ['enabled', 'sandbox', 'apiKey', 'secretKey']
const TRANSFER_FIELDS = ['enabled', 'bankName', 'accountType', 'accountNumber', 'holderName', 'holderRut', 'contactEmail', 'instructions']
const pick = (o: Record<string, unknown> | undefined, keys: string[]) =>
  Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o![k]]))

/**
 * Vista para el panel superadmin: lista blanca de campos, secretos enmascarados (••••1234).
 * Stripe solo informa si está activo por env (no se edita desde el panel, decisión D2).
 */
export async function getBillingGatewaysView() {
  const raw = (await readBillingGateways()) ?? {}
  const [flow, stripe, transfer] = await Promise.all([
    getBillingGatewayConfig('flow'), getBillingGatewayConfig('stripe'), getBillingGatewayConfig('transfer'),
  ])
  const masked = maskGateways(
    { flow: pick(raw.flow, FLOW_FIELDS), transfer: pick(raw.transfer, TRANSFER_FIELDS) },
    BILLING_PUBLIC_FIELDS,
  )
  const flowView = flow.source === 'db'
    ? { enabled: false, sandbox: true, apiKey: '', secretKey: '', ...masked.flow }
    : flow.source === 'env'
      ? { enabled: true, sandbox: flow.sandbox, apiKey: maskSecret(flow.apiKey), secretKey: maskSecret(flow.secretKey) }
      : { enabled: false, sandbox: true, apiKey: '', secretKey: '' }
  return {
    gateways: {
      flow: flowView,
      stripe: { enabled: stripe.enabled },
      transfer: { enabled: false, ...masked.transfer },
    },
    source: { flow: flow.source, stripe: stripe.source, transfer: transfer.source },
    options: { banks: CHILE_BANKS, accountTypes: BANK_ACCOUNT_TYPES },
  }
}
