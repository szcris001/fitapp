import { z } from 'zod'

// Disciplinas que ofrece la web al crear un tipo de clase (settings/class-types) y que la
// app móvil sabe mostrar (DisciplineIcon)
export const CLASS_DISCIPLINES = [
  'crossfit', 'weightlifting', 'powerlifting', 'gymnastics', 'endurance', 'hyrox', 'rowing',
  'cycling', 'mobility', 'swimming', 'boxing', 'kids', 'competition', 'open', 'manual',
] as const

const blockSchema = z.object({
  name: z.string().min(1),
  durationMins: z.number().int().min(1),
  notes: z.string().optional(),
  isOptional: z.boolean().default(false),
})

export const createClassTypeSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  discipline: z.enum(CLASS_DISCIPLINES).optional(),
  blocks: z.array(blockSchema).optional(),
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
  allowedPlanIds: z.array(z.string().uuid()).optional(),
}).refine(
  data => new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(),
  { error: 'La hora de término debe ser posterior a la de inicio', path: ['endsAt'] },
)

export const bookingSchema = z.object({
  classId: z.string().uuid(),
})

export const updateClassAllowedPlansSchema = z.object({
  allowedPlanIds: z.array(z.string().uuid()),
})

export type CreateClassTypeInput = z.infer<typeof createClassTypeSchema>
export type CreateClassInput = z.infer<typeof createClassSchema>
export type BookingInput = z.infer<typeof bookingSchema>
export type UpdateClassAllowedPlansInput = z.infer<typeof updateClassAllowedPlansSchema>
