import { z } from 'zod'

export const updateGymSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  termsAndConditions: z.string().optional(),
  bookingWindowDays: z.number().int().min(1).max(7).optional(),
  bookingCutoffMins: z.number().int().min(0).max(1440).optional(),
  cancelCutoffMins: z.number().int().min(0).max(1440).optional(),
  brandColors: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }).optional(),
})

export type UpdateGymInput = z.infer<typeof updateGymSchema>
