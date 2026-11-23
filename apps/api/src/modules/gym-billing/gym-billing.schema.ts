import { z } from 'zod'

// Secreto: string = nuevo valor (o máscara/"" = conservar), null = borrar la credencial guardada
const secret = z.string().max(300).nullable()
const text = (max: number) => z.string().max(max).nullable()

export const flowBillingSchema = z.object({
  enabled:   z.boolean(),
  sandbox:   z.boolean(),
  apiKey:    secret,
  secretKey: secret,
}).partial().strict()

export const transferBillingSchema = z.object({
  enabled:       z.boolean(),
  bankName:      text(100),
  accountType:   text(50),
  accountNumber: text(50),
  holderName:    text(120),
  holderRut:     text(20),
  contactEmail:  z.union([z.string().email().max(150), z.literal('')]).nullable(),
  instructions:  text(500),
}).partial().strict()

// Stripe NO se configura por DB (decisión D2): solo env vars mientras no esté activo en Chile.
export const updateBillingGatewaysSchema = z.object({
  flow:     flowBillingSchema.optional(),
  transfer: transferBillingSchema.optional(),
}).strict()

export const gymCheckoutSchema = z.object({
  planId:  z.string().uuid(),
  gateway: z.enum(['flow', 'stripe', 'transfer']),
})

export const paymentIdParamSchema = z.object({ paymentId: z.string().uuid() })
export const idParamSchema = z.object({ id: z.string().uuid() })

export const confirmGymPaymentSchema = z.object({ notes: z.string().max(300).optional() })
export const rejectGymPaymentSchema = z.object({ reason: z.string().min(3).max(300) })

export const flowConfirmSchema = z.object({ token: z.string().min(1).max(200) })

export const listGymPaymentsQuerySchema = z.object({
  gymId:      z.string().uuid().optional(),
  status:     z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  gateway:    z.string().max(30).optional(),
  hasReceipt: z.enum(['true', 'false']).optional(),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
  offset:     z.coerce.number().int().min(0).default(0),
})

export const manualGymPaymentSchema = z.object({
  gymId:          z.string().uuid(),
  planId:         z.string().uuid(),
  subscriptionId: z.string().optional(),
  amount:         z.number().int().positive(),
  currency:       z.string().max(3).default('CLP'),
  notes:          z.string().max(300).optional(),
  paidAt:         z.string().datetime().optional(),
})
