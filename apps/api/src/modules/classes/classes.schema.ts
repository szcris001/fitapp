import { z } from 'zod'

export const createClassTypeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export const createClassSchema = z.object({
  classTypeId: z.string().uuid(),
  coachId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number().int().min(1),
  frequency: z.enum(['ONCE', 'RECURRING']).default('ONCE'),
  recurringDays: z.array(z.number().int().min(0).max(6)).optional(),
  recurringUntil: z.string().optional(),
})

export const bookingSchema = z.object({
  classId: z.string().uuid(),
})

export type CreateClassTypeInput = z.infer<typeof createClassTypeSchema>
export type CreateClassInput = z.infer<typeof createClassSchema>
export type BookingInput = z.infer<typeof bookingSchema>
