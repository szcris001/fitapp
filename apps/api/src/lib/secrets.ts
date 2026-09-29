/**
 * Credenciales de un gym (pasarelas, Bsale) que el panel muestra y edita.
 *
 * Nunca salen completas: GET las devuelve enmascaradas (`••••1234`) y, en el PUT, un
 * valor enmascarado o vacío significa "sin cambios". Así el formulario puede reenviar
 * todo lo que recibió sin borrar ni exponer las credenciales guardadas.
 */
const MASK = '••••'

export function maskSecret(value: unknown): string {
  if (typeof value !== 'string' || value === '') return ''
  return MASK + value.slice(-4)
}

/** true si el valor recibido significa "conservar el guardado" */
export function keepsStoredSecret(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (typeof value === 'string' && value.startsWith(MASK))
}

// Campos de configuración de pasarela que no son secretos y se muestran tal cual
const PUBLIC_GATEWAY_FIELDS = new Set(['enabled', 'sandbox', 'publishableKey', 'receiverId', 'merchantId', 'accountId'])

type GatewayConfig = Record<string, unknown>
type Gateways = Record<string, GatewayConfig>

export function maskGateways(gateways: unknown): Gateways {
  const out: Gateways = {}
  for (const [name, cfg] of Object.entries((gateways ?? {}) as Gateways)) {
    out[name] = Object.fromEntries(
      Object.entries(cfg ?? {}).map(([k, v]) => [k, PUBLIC_GATEWAY_FIELDS.has(k) ? v : maskSecret(v)]),
    )
  }
  return out
}

/**
 * Fusiona la configuración recibida con la guardada: las pasarelas que no vienen se
 * conservan y, dentro de cada una, los secretos enmascarados o vacíos mantienen su valor.
 */
export function mergeGateways(stored: unknown, incoming: Gateways): Gateways {
  const merged: Gateways = { ...((stored ?? {}) as Gateways) }
  for (const [name, cfg] of Object.entries(incoming)) {
    const prev = merged[name] ?? {}
    const next: GatewayConfig = { ...prev }
    for (const [k, v] of Object.entries(cfg)) {
      if (PUBLIC_GATEWAY_FIELDS.has(k)) next[k] = v
      else if (!keepsStoredSecret(v)) next[k] = v
    }
    merged[name] = next
  }
  return merged
}
