import { z } from 'zod'

const strengthConfigSchema = z.object({
  minMovements: z.number().int().positive(),
  minImprovementPct: z.number().positive(),
})
const attendanceConfigSchema = z.object({
  minClassesAttended: z.number().int().positive(),
})
const gymnasticsConfigSchema = z.object({
  minMilestonesUnlocked: z.number().int().positive(),
})
const tenureConfigSchema = z.object({
  milestonesMonths: z.array(z.number().int().positive()).min(1),
})
const manualConfigSchema = z.object({}).strict()

// El shape de `config` depende de `type` — se valida según corresponda, nunca como JSON libre.
export function configSchemaFor(type: string) {
  switch (type) {
    case 'STRENGTH': return strengthConfigSchema
    case 'ATTENDANCE': return attendanceConfigSchema
    case 'GYMNASTICS': return gymnasticsConfigSchema
    case 'TENURE': return tenureConfigSchema
    default: return manualConfigSchema
  }
}

export const updatePillarSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(300).nullish(),
  icon: z.string().trim().max(10).nullish(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const createManualPillarSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(10).optional(),
})

export const createPillarAwardSchema = z.object({
  userId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
})
