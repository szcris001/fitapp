import { z } from 'zod'

// El email se normaliza a minúsculas en todos los schemas que lo reciben: sin esto,
// "Usuario@test.com" y "usuario@test.com" se tratan como cuentas distintas (el
// @@unique([gymId, email]) de Postgres es case-sensitive) y el login de un alumno
// real falla si escribe su correo con otra capitalización que la guardada.
export const registerSchema = z.object({
  gymName: z.string().min(2),
  gymSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  adminName: z.string().min(2),
  email: z.string().email().toLowerCase(),
  password: z.string().min(6),
})

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  gymSlug: z.string().optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
