import { describe, it, expect } from 'vitest'
import { keepsStoredSecret, wantsToClearSecret, mergeGateways, maskSecret } from '../secrets'

describe('keepsStoredSecret', () => {
  it('undefined, vacío o enmascarado → true (sin cambios)', () => {
    expect(keepsStoredSecret(undefined)).toBe(true)
    expect(keepsStoredSecret('')).toBe(true)
    expect(keepsStoredSecret('••••1234')).toBe(true)
  })

  it('null ya no cuenta como "sin cambios" — ahora significa borrar', () => {
    expect(keepsStoredSecret(null)).toBe(false)
  })

  it('un valor nuevo real → false', () => {
    expect(keepsStoredSecret('sk_live_nuevo')).toBe(false)
  })
})

describe('wantsToClearSecret', () => {
  it('solo null explícito pide borrar', () => {
    expect(wantsToClearSecret(null)).toBe(true)
    expect(wantsToClearSecret(undefined)).toBe(false)
    expect(wantsToClearSecret('')).toBe(false)
  })
})

describe('mergeGateways', () => {
  it('null explícito en un campo secreto lo borra (QA 2026-10-30, hallazgo configuración H03)', () => {
    const stored = { stripe: { enabled: true, publishableKey: 'pk_live_x', secretKey: 'sk_live_x', webhookSecret: 'whsec_x' } }
    const incoming = { stripe: { enabled: true, secretKey: null as any } }
    const merged = mergeGateways(stored, incoming)
    expect(merged.stripe.secretKey).toBe('')
    // Los demás campos no tocados se conservan
    expect(merged.stripe.publishableKey).toBe('pk_live_x')
    expect(merged.stripe.webhookSecret).toBe('whsec_x')
  })

  it('"" o ausente en un campo secreto conserva el valor guardado (comportamiento previo intacto)', () => {
    const stored = { stripe: { enabled: true, secretKey: 'sk_live_x' } }
    const incoming = { stripe: { enabled: true, secretKey: '' } }
    const merged = mergeGateways(stored, incoming)
    expect(merged.stripe.secretKey).toBe('sk_live_x')
  })

  it('un valor nuevo real reemplaza el guardado', () => {
    const stored = { stripe: { enabled: true, secretKey: 'sk_live_old' } }
    const incoming = { stripe: { enabled: true, secretKey: 'sk_live_new' } }
    const merged = mergeGateways(stored, incoming)
    expect(merged.stripe.secretKey).toBe('sk_live_new')
  })

  it('un campo público (ej. publishableKey) nunca se enmascara ni necesita null para cambiar', () => {
    expect(maskSecret('pk_live_abcd1234')).toBe('••••1234')
  })
})
