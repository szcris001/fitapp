import { z } from 'zod'

export const registerSchema = z.object({
  gymName: z.string().min(2),
  gymSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  gymSlug: z.string().optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
