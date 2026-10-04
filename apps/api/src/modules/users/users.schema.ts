import { z } from 'zod'

// Normalizado a minúsculas: ver la nota en auth.schema.ts sobre por qué (duplicados
// "iguales salvo mayúsculas" y login case-sensitive).
export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().toLowerCase(),
  password: z.string().min(6),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  source: z.enum(['presencial', 'internet', 'app']).optional(),
  role: z.enum(['MEMBER', 'COACH', 'ADMIN']).default('MEMBER'),
  rut: z.string().optional(),
})

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().toLowerCase().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  source: z.enum(['presencial', 'internet', 'app']).optional(),
  role: z.enum(['MEMBER', 'COACH', 'ADMIN']).optional(),
  rut: z.string().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
