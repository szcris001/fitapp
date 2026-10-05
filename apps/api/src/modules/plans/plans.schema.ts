import { z } from 'zod'

// Mismas monedas que ofrece el <select> en apps/web/app/dashboard/plans/page.tsx
const PLAN_CURRENCIES = ['CLP', 'ARS', 'COP', 'MXN', 'PEN', 'BRL', 'USD'] as const

// Tope por debajo del máximo de una columna Int4 de Postgres (2147483647): sin esto,
// un precio con más dígitos de lo normal rompe con un 500 de Postgres (P2020) en vez
// de un 400 de validación.
const MAX_PRICE_CENTS = 2_000_000_000

export const createPlanSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
  currency: z.enum(PLAN_CURRENCIES).default('CLP'),
  maxClasses: z.number().int().positive().optional(),
  isTrial: z.boolean().default(false),
  // El modelo soporta autoRenewEnabled/autoRenewDaysBefore/autoRenewMaxRetries desde el
  // checkout de Stripe (payments.service.ts), pero hasta ahora ningún formulario los
  // podía fijar — un plan nunca llegaba a tener autoRenewEnabled: true (QA H03,
  // qa/reports/2026-10-02-1141-staging/planes.md). autoRenewMaxRetries queda con su
  // default (no se expone acá: ajustarlo no es parte de este hallazgo).
  autoRenewEnabled: z.boolean().default(false),
  autoRenewDaysBefore: z.number().int().min(1).max(30).default(3),
}).transform(data => (data.isTrial ? { ...data, priceCents: 0 } : data))

export const updatePlanSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional(),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).optional(),
  currency: z.enum(PLAN_CURRENCIES).optional(),
  maxClasses: z.number().int().positive().nullable().optional(),
  isTrial: z.boolean().optional(),
  // Reactivar un plan pausado (DELETE /plans/:id lo pausa; esto permite deshacerlo).
  isActive: z.boolean().optional(),
  autoRenewEnabled: z.boolean().optional(),
  autoRenewDaysBefore: z.number().int().min(1).max(30).optional(),
}).transform(data => (data.isTrial ? { ...data, priceCents: 0 } : data))

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>

export const createMembershipSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  startsAt: z.string(),
  status: z.enum(['ACTIVE', 'TRIAL']).default('ACTIVE'),
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>
