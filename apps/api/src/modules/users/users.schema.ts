import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
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
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  source: z.enum(['presencial', 'internet', 'app']).optional(),
  role: z.enum(['MEMBER', 'COACH', 'ADMIN']).optional(),
  rut: z.string().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
