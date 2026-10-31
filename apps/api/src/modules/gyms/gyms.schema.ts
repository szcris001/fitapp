import { z } from 'zod'

// name/phone/address sin límite dejaban guardar strings arbitrariamente largos (ej.
// 5000 caracteres) sin rechazo — React ya escapa el HTML al renderizar (sin riesgo de
// XSS), pero igual conviene un tope razonable (QA 2026-10-30, hallazgo configuración H04).
export const updateGymSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(30).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  instagram: z.string().max(100).optional(),
  facebook: z.string().max(100).optional(),
  termsAndConditions: z.string().max(20000).optional(),
  bookingWindowDays: z.number().int().min(1).max(7).optional(),
  bookingCutoffMins: z.number().int().min(0).max(1440).optional(),
  cancelCutoffMins: z.number().int().min(0).max(1440).optional(),
  sportTheme: z.enum(['neutral', 'crossfit', 'hyrox', 'swimming', 'football', 'boxing', 'yoga', 'running']).optional(),
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
  // Los campos secretos aceptan `null` explícito como señal de "borrar esta
  // credencial guardada" — vacío/ausente sigue significando "sin cambios" (ver
  // keepsStoredSecret en lib/secrets.ts; antes no había forma de borrar una
  // credencial ya guardada, QA 2026-10-30, hallazgo configuración H03).
  paymentGateways: z.record(z.string(), z.object({
    enabled: z.boolean(),
    accessToken: z.string().nullable().optional(),
    secretKey: z.string().nullable().optional(),
    apiKey: z.string().nullable().optional(),
    publishableKey: z.string().optional(),
    webhookSecret: z.string().nullable().optional(),
    receiverId: z.string().optional(),
    secret: z.string().nullable().optional(),
    merchantId: z.string().optional(),
    accountId: z.string().optional(),
    privateMerchantId: z.string().optional(),
    apiLogin: z.string().optional(),
    privateKey: z.string().nullable().optional(),
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
  // Confirmación previa a clase (reservas normales, no solo lista de espera)
  preClassConfirmHours: z.number().int().min(1).max(72).optional(),
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
