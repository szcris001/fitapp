import { z } from 'zod' 

export const createCheckoutSchema = z.object({
  planId: z.string().uuid(),
  userId: z.string().uuid(),
})

export const createPaymentIntentSchema = z.object({
  membershipId: z.string().uuid(),
})

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>
