import { toMajorUnits } from './money'
import { logger } from './logger'
/**
 * Servicio de Facturación Electrónica (DTE) para Chile
 * Integración con Bsale API (https://api.bsale.io/v1)
 *
 * Tipos de documento SII:
 *   39 = Boleta electrónica (consumidor final)
 *   33 = Factura electrónica (empresa con RUT)
 */

interface BsaleGymConfig {
  bsaleToken?: string | null
  bsaleOfficeId?: number | null
  bsalePriceListId?: number | null
  bsaleBoletaTypeId?: number | null
  bsaleFacturaTypeId?: number | null
  dteRut?: string | null
  dteRazonSocial?: string | null
  dteGiro?: string | null
  dteDireccion?: string | null
  dteComuna?: string | null
  dteCiudad?: string | null
}

export interface DteInput {
  invoiceType: 'boleta' | 'factura'
  priceCents: number
  currency: string
  planName: string
  planDays: number
  // Required for factura
  receiverRut?: string
  receiverName?: string
  receiverEmail?: string
  receiverAddress?: string
  receiverActivity?: string
}

export interface DteResult {
  invoiceNumber: number
  invoicePdfUrl: string
}

const BSALE_BASE = 'https://api.bsale.io/v1'

async function bsaleRequest(token: string, path: string, body: object) {
  const res = await fetch(`${BSALE_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: token,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json() as any
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Bsale error ${res.status}`)
  }
  return data
}

export async function emitirDTE(gym: BsaleGymConfig, input: DteInput): Promise<DteResult | null> {
  const { bsaleToken, bsaleOfficeId, bsaleBoletaTypeId, bsaleFacturaTypeId } = gym

  if (!bsaleToken) return null

  const documentTypeId = input.invoiceType === 'factura' ? bsaleFacturaTypeId : bsaleBoletaTypeId
  if (!documentTypeId) return null

  // Price without IVA (19% in Chile)
  // DTE (SII) es solo Chile: CLP, sin decimales
  const netUnitValue = Math.round(toMajorUnits(input.priceCents, 'CLP') / 1.19)
  const emissionDate = Math.floor(Date.now() / 1000)

  const body: any = {
    documentTypeId,
    officeId: bsaleOfficeId || 1,
    emissionDate,
    expirationDate: emissionDate,
    coin: { code: input.currency === 'CLP' ? 'CLP' : input.currency },
    details: [
      {
        comment: `${input.planName} — membresía ${input.planDays} días`,
        quantity: 1,
        netUnitValue,
        taxes: [{ code: 14, percentage: 19 }],
      },
    ],
  }

  // Factura requires receiver RUT
  if (input.invoiceType === 'factura' && input.receiverRut) {
    body.client = {
      code: input.receiverRut,
      name: input.receiverName || 'Sin razón social',
      activity: input.receiverActivity || '',
      address: input.receiverAddress || '',
      municipality: '',
      email: input.receiverEmail || '',
    }
  }

  if (gym.bsalePriceListId) {
    body.priceListId = gym.bsalePriceListId
  }

  try {
    const result = await bsaleRequest(bsaleToken, '/documents.json', body)
    return {
      invoiceNumber: result.number,
      invoicePdfUrl: result.urlPdf || result.urlPublicView || '',
    }
  } catch (err) {
    logger.error({ err }, '[DTE] Error emitiendo documento')
    return null
  }
}
