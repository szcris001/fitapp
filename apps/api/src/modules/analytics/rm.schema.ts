import { z } from 'zod'

export const createRmSchema = z.object({
  movementName: z.string().min(2),
  weightKg: z.number().positive(),
  notes: z.string().optional(),
  recordedAt: z.string().optional(),
})

export const createGymnasticProgressSchema = z.object({
  skillName: z.string().min(2),
  milestone: z.string().min(2),
  notes: z.string().optional(),
  achievedAt: z.string().optional(),
})

export type CreateRmInput = z.infer<typeof createRmSchema>
export type CreateGymnasticProgressInput = z.infer<typeof createGymnasticProgressSchema>
