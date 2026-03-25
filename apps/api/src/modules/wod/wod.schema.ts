import { z } from 'zod'

export const createWodSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional(),
  date: z.string(),
  movements: z.array(z.object({
    movementName: z.string().min(2),
    sets: z.number().int().min(1).optional(),
    reps: z.number().int().min(1).optional(),
    percentage: z.number().int().min(1).max(110).optional(),
    notes: z.string().optional(),
  })).min(1),
})

export const importWodSchema = z.array(z.object({
  date: z.string(),
  classId: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional(),
  movements: z.array(z.object({
    movementName: z.string(),
    sets: z.number().int().optional(),
    reps: z.number().int().optional(),
    percentage: z.number().int().optional(),
    notes: z.string().optional(),
  })),
}))

export type CreateWodInput = z.infer<typeof createWodSchema>
export type ImportWodInput = z.infer<typeof importWodSchema>
