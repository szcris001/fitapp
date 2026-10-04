import { z } from 'zod'

const RUT_FORMAT = /^\d{7,8}-[0-9kK]$/

// Algoritmo estándar del dígito verificador del RUT chileno (módulo 11).
function hasValidCheckDigit(rut: string): boolean {
  const [numStr, verifier] = rut.split('-')
  let sum = 0
  let mul = 2
  for (let i = numStr.length - 1; i >= 0; i--) {
    sum += Number(numStr[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (sum % 11)
  const expected = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return expected === verifier.toUpperCase()
}

// Vacío/ausente se deja pasar tal cual (el RUT es opcional); solo se valida formato y
// dígito verificador cuando el cliente manda algo. Normaliza sin puntos y con el
// verificador en mayúscula para que el check de duplicados no trate "12345678-k" y
// "12345678-K" como RUTs distintos.
const rutField = z.string()
  .transform(r => r.replace(/\./g, '').trim())
  .refine(r => r === '' || RUT_FORMAT.test(r), 'RUT inválido (formato esperado: 12345678-9)')
  .refine(r => r === '' || hasValidCheckDigit(r), 'RUT inválido (el dígito verificador no corresponde)')
  .transform(r => r.toUpperCase())
  .optional()

// Igual que el RUT: vacío/ausente pasa tal cual; solo se valida cuando hay un valor.
const birthDateField = z.string()
  .refine(d => {
    if (d === '') return true
    const parsed = new Date(d)
    return !Number.isNaN(parsed.getTime()) && parsed <= new Date()
  }, 'Fecha de nacimiento inválida o futura')
  .optional()

// Normalizado a minúsculas: ver la nota en auth.schema.ts sobre por qué (duplicados
// "iguales salvo mayúsculas" y login case-sensitive).
export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().toLowerCase(),
  password: z.string().min(6),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: birthDateField,
  source: z.enum(['presencial', 'internet', 'app']).optional(),
  role: z.enum(['MEMBER', 'COACH', 'ADMIN']).default('MEMBER'),
  rut: rutField,
})

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().toLowerCase().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: birthDateField,
  source: z.enum(['presencial', 'internet', 'app']).optional(),
  role: z.enum(['MEMBER', 'COACH', 'ADMIN']).optional(),
  rut: rutField,
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
