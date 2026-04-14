import { z } from 'zod'

export const createPlanSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  currency: z.string().default('CLP'),
  durationDays: z.number().int().min(1),
  maxClasses: z.number().int().optional(),
})

export const updatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  durationDays: z.number().int().min(1).optional(),
  maxClasses: z.number().int().nullable().optional(),
})

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>

export const createMembershipSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  startsAt: z.string(),
  status: z.enum(['ACTIVE', 'TRIAL']).default('ACTIVE'),
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>
