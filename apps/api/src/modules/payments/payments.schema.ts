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

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>
