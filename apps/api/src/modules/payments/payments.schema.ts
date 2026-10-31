import { z } from 'zod' 

export const createCheckoutSchema = z.object({
  planId: z.string().uuid(),
  userId: z.string().uuid(),
})

export const createPaymentIntentSchema = z.object({
  membershipId: z.string().uuid(),
})

export const confirmTransferSchema = z.object({
  notes: z.string().max(500).nullish(),
})

export const rejectTransferSchema = z.object({
  reason: z.string().max(500).nullish(),
})

export const listBankMovementsSchema = z.object({
  status: z.enum(['PENDING', 'MATCHED', 'CONFIRMED', 'REJECTED', 'MANUAL']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>
