import { z } from 'zod'

// Una fecha futura "esconde" el récord/hito real sin que nadie lo note — no hay
// forma de editar o borrar un RM/hito ya cargado (ver rm.routes.ts), así que un
// error de tipeo en la fecha queda para siempre (QA 2026-10-30). Un día de
// tolerancia por huso horario entre cliente y servidor.
const notInFuture = (val: string | undefined) => !val || new Date(val).getTime() <= Date.now() + 24 * 60 * 60 * 1000

export const createRmSchema = z.object({
  movementName: z.string().min(2),
  weightKg: z.number().positive(),
  notes: z.string().optional(),
  recordedAt: z.string().optional().refine(notInFuture, 'La fecha no puede ser futura'),
})

export const createGymnasticProgressSchema = z.object({
  skillName: z.string().min(2),
  milestone: z.string().min(2),
  notes: z.string().optional(),
  achievedAt: z.string().optional().refine(notInFuture, 'La fecha no puede ser futura'),
})

export type CreateRmInput = z.infer<typeof createRmSchema>
export type CreateGymnasticProgressInput = z.infer<typeof createGymnasticProgressSchema>
