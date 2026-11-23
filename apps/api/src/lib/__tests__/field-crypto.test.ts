import { describe, it, expect, afterEach, vi } from 'vitest'
import { decryptJson, encryptJson, isEncryptedEnvelope } from '../field-crypto'

const KEY_B64 = Buffer.alloc(32, 7).toString('base64')
const KEY_HEX = Buffer.alloc(32, 9).toString('hex')
const DOC = { flow: { enabled: true, apiKey: 'AK-123', secretKey: 'SK-secreto-456' } }

const saved = { key: process.env.SECRETS_ENCRYPTION_KEY, env: process.env.NODE_ENV }
afterEach(() => {
  if (saved.key === undefined) delete process.env.SECRETS_ENCRYPTION_KEY; else process.env.SECRETS_ENCRYPTION_KEY = saved.key
  process.env.NODE_ENV = saved.env
  vi.restoreAllMocks()
})

describe('field-crypto', () => {
  it('cifra y descifra (clave base64) sin dejar secretos legibles', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B64
    const enc = encryptJson(DOC)
    expect(isEncryptedEnvelope(enc)).toBe(true)
    expect(JSON.stringify(enc)).not.toContain('SK-secreto-456')
    expect(decryptJson(enc)).toEqual(DOC)
  })

  it('acepta clave hex de 64 caracteres', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY_HEX
    expect(decryptJson(encryptJson(DOC))).toEqual(DOC)
  })

  it('IV aleatorio: dos cifrados del mismo documento difieren', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B64
    expect((encryptJson(DOC) as any).data).not.toBe((encryptJson(DOC) as any).data)
  })

  it('texto plano heredado se lee tal cual; null → null', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B64
    expect(decryptJson(DOC)).toEqual(DOC)
    expect(decryptJson(null)).toBeNull()
  })

  it('dato alterado o clave equivocada → error, nunca contenido parcial', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B64
    const enc = encryptJson(DOC) as any
    const [iv, tag, ct] = enc.data.split('.')
    const flipped = Buffer.from(ct, 'base64url'); flipped[0] ^= 1
    expect(() => decryptJson({ __enc: 'v1', data: [iv, tag, flipped.toString('base64url')].join('.') })).toThrow(/descifrar/)
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64')
    expect(() => decryptJson(enc)).toThrow(/descifrar/)
  })

  it('leer cifrado sin clave → error explícito', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY_B64
    const enc = encryptJson(DOC)
    delete process.env.SECRETS_ENCRYPTION_KEY
    expect(() => decryptJson(enc)).toThrow(/SECRETS_ENCRYPTION_KEY/)
  })

  it('clave de largo incorrecto → error', () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
    expect(() => encryptJson(DOC)).toThrow(/32 bytes/)
  })

  it('sin clave: en producción falla cerrado; fuera de producción guarda en claro', () => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.NODE_ENV = 'production'
    expect(() => encryptJson(DOC)).toThrow(/producción/)
    process.env.NODE_ENV = 'test'
    expect(encryptJson(DOC)).toEqual(DOC)
  })
})
