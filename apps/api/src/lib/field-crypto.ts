/**
 * Cifrado en reposo (AES-256-GCM) de documentos JSON con credenciales.
 *
 * Formato guardado: `{ __enc: 'v1', data: '<iv>.<tag>.<ciphertext>' }` (base64url). El IV
 * es aleatorio por escritura y el tag GCM autentica el contenido: un valor alterado en la
 * DB falla al leer en vez de devolver basura.
 *
 * Clave: `SECRETS_ENCRYPTION_KEY`, 32 bytes en base64 o 64 caracteres hex
 * (generar con `openssl rand -base64 32`). Perderla = perder las credenciales cifradas
 * (hay que volver a cargarlas en el panel); rotarla requiere releer y reescribir.
 *
 * - Valores sin la marca `__enc` se tratan como texto plano heredado: se leen tal cual y
 *   la siguiente escritura los deja cifrados (migración perezosa, sin script).
 * - Sin clave: en producción NO se escribe en claro (falla cerrado); fuera de producción
 *   se guarda en claro con un aviso, para no exigir la clave en dev/tests.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'

export interface EncryptedEnvelope { __enc: typeof VERSION; data: string }

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value as any).__enc === VERSION && typeof (value as any).data === 'string'
}

function loadKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim()
  if (!raw) return null
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY inválida: debe ser de 32 bytes (base64 o 64 caracteres hex)')
  }
  return key
}

/** Cifra un documento JSON. Sin clave: error en producción, texto plano fuera de ella. */
export function encryptJson<T extends object>(value: T): T | EncryptedEnvelope {
  const key = loadKey()
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECRETS_ENCRYPTION_KEY no está configurada: no se guardan credenciales sin cifrar en producción')
    }
    console.warn('[field-crypto] SECRETS_ENCRYPTION_KEY no configurada: credenciales guardadas en claro (solo dev/test)')
    return value
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const data = [iv, tag, ciphertext].map(b => b.toString('base64url')).join('.')
  return { __enc: VERSION, data }
}

/** Descifra si viene cifrado; si es texto plano heredado lo devuelve tal cual. */
export function decryptJson<T extends object>(stored: unknown): T | null {
  if (stored === null || stored === undefined) return null
  if (!isEncryptedEnvelope(stored)) return stored as T
  const key = loadKey()
  if (!key) throw new Error('Hay credenciales cifradas pero SECRETS_ENCRYPTION_KEY no está configurada')
  const [ivB64, tagB64, ctB64] = stored.data.split('.')
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Credenciales cifradas con formato inválido')
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  try {
    const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()])
    return JSON.parse(plain.toString('utf8')) as T
  } catch {
    // clave equivocada o dato alterado: nunca devolver contenido parcial
    throw new Error('No se pudieron descifrar las credenciales (clave incorrecta o dato alterado)')
  }
}
