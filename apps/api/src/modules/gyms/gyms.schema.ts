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
  sportTheme: z.enum(['neutral', 'crossfit', 'swimming', 'football', 'boxing', 'yoga', 'running']).optional(),
  brandColors: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }).optional(),
  // Notificaciones
  expiryReminderDays: z.number().int().min(0).max(30).optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
  // Plantillas de correo
  emailExpirySubject: z.string().optional(),
  emailExpiryBody: z.string().optional(),
  emailPaymentSubject: z.string().optional(),
  emailPaymentBody: z.string().optional(),
  // Pasarelas de pago
  paymentGateways: z.record(z.string(), z.object({
    enabled: z.boolean(),
    accessToken: z.string().optional(),
    secretKey: z.string().optional(),
    apiKey: z.string().optional(),
    publishableKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    receiverId: z.string().optional(),
    secret: z.string().optional(),
    merchantId: z.string().optional(),
    accountId: z.string().optional(),
    privateMerchantId: z.string().optional(),
    apiLogin: z.string().optional(),
    privateKey: z.string().optional(),
    sandbox: z.boolean().optional(),
  })).optional(),
  // Facturación electrónica DTE (Bsale)
  bsaleToken: z.string().optional(),
  bsaleOfficeId: z.number().int().optional(),
  bsalePriceListId: z.number().int().optional(),
  bsaleBoletaTypeId: z.number().int().optional(),
  bsaleFacturaTypeId: z.number().int().optional(),
  dteRut: z.string().optional(),
  dteRazonSocial: z.string().optional(),
  dteGiro: z.string().optional(),
  dteDireccion: z.string().optional(),
  dteComuna: z.string().optional(),
  dteCiudad: z.string().optional(),
  // Configuración de pesos
  weightRounding: z.number().positive().optional(),
  // Asistencia
  attendanceMode: z.enum(['manual', 'auto', 'qr', 'geo']).optional(),
  gymLat: z.number().optional().nullable(),
  gymLng: z.number().optional().nullable(),
  gymRadiusMeters: z.number().int().min(50).max(2000).optional(),
  // Lista de espera
  waitlistConfirmEnabled: z.boolean().optional(),
  waitlistConfirmMins: z.number().int().min(5).max(1440).optional(),
  bankAccount: z.object({
    ownerName: z.string().optional(),
    rut: z.string().optional(),
    bank: z.string().optional(),
    accountType: z.string().optional(),
    accountNumber: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
})

export type UpdateGymInput = z.infer<typeof updateGymSchema>
