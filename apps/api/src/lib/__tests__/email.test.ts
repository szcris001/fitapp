/**
 * email.test.ts
 *
 * Tests unitarios para apps/api/src/lib/email.ts.
 *
 * Funciones cubiertas:
 *   - sendExpiryReminder      (5 tests)
 *   - sendPaymentConfirmation (5 tests)
 *   - sendBulkEmail           (3 tests)
 *   - sendWelcomeEmail        (3 tests)
 *   - sendTestEmail           (3 tests)
 *   - sendBulkToGyms          (2 tests)
 *   Total: 21 tests
 *
 * Estrategia de mocking:
 *   - nodemailer se mockea completamente con vi.mock(). El factory crea vi.fn()
 *     propios (no puede referenciar variables del módulo por hoisting).
 *   - En cada beforeEach se crea un nuevo currentSendMail (vi.fn()) y se configura
 *     createTransport para devolver { sendMail: currentSendMail }. Así cada test
 *     parte de un sendMail limpio sin contaminar otros tests.
 *   - vi.restoreAllMocks() en afterEach restaura los vi.spyOn (prisma) pero NO
 *     afecta a vi.mock() — los mocks de módulo son fijos por proceso.
 *   - prisma.gym.findUnique y findMany se mockean con vi.spyOn() para controlar
 *     fixtures sin tocar la DB.
 *
 * Gotcha clave — hoisting de vi.mock():
 *   El factory de vi.mock NO puede referenciar variables `const` del módulo —
 *   vi.mock() se eleva antes de cualquier declaración. Solución: el factory crea
 *   sus propios vi.fn() internamente. Los tests acceden a ellos via vi.mocked().
 *
 * Gotcha — subject de sendExpiryReminder:
 *   El subject por defecto NO incluye el planName. Es:
 *   "⏰ Tu membresía en {gym.name} vence en {N} día(s)"
 *   El planName aparece solo en el BODY del email.
 *
 * Gotcha — vi.restoreAllMocks() vs vi.clearAllMocks():
 *   vi.restoreAllMocks() revierte vi.spyOn() al original, PERO los mocks creados
 *   con vi.mock() persisten (son del registry de módulos). Por eso se usa
 *   vi.restoreAllMocks() en afterEach y se reconfigura manualmente en beforeEach.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'

// ─── Mock de nodemailer (hoisted) ─────────────────────────────────────────────
// El factory NO puede referenciar variables del scope del módulo (hoisting).
vi.mock('nodemailer', () => ({
  default: {
    createTestAccount: vi.fn(),
    createTransport: vi.fn(),
    getTestMessageUrl: vi.fn(),
  },
}))

import nodemailer from 'nodemailer'
import { prisma } from '../prisma'
import {
  sendExpiryReminder,
  sendPaymentConfirmation,
  sendBulkEmail,
  sendWelcomeEmail,
  sendTestEmail,
  sendBulkToGyms,
} from '../email'

// ─── Fixtures base ────────────────────────────────────────────────────────────

const BASE_GYM = {
  name: 'QA Gym Email',
  logoUrl: null,
  email: 'gym@qa.com',
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPass: null,
  smtpFrom: null,
  emailExpirySubject: null,
  emailExpiryBody: null,
  emailPaymentSubject: null,
  emailPaymentBody: null,
  ownerEmail: 'owner@qa.com',
}

const BASE_MEMBER = {
  name: 'Juan Pérez',
  email: 'juan@test.com',
  planName: 'Plan Mensual',
  daysLeft: 5,
  endsAt: new Date('2026-06-01'),
}

const BASE_PAYMENT_DATA = {
  memberName: 'Juan Pérez',
  memberEmail: 'juan@test.com',
  planName: 'Plan Mensual',
  amount: 29900, // $29.900 CLP (unidad mínima = peso)
  currency: 'CLP',
  paymentMethod: 'cash',
  endsAt: new Date('2026-06-01'),
  invoicePdfUrl: null,
  invoiceType: null,
  invoiceNumber: null,
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let gymFindUniqueSpy: MockInstance
// sendMail fresco por cada test — se recrea en beforeEach
let currentSendMail: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Crear un sendMail limpio por test
  currentSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' })

  // Configurar nodemailer mockeado
  vi.mocked(nodemailer.createTestAccount).mockClear()
  vi.mocked(nodemailer.createTestAccount).mockResolvedValue({
    user: 'test@ethereal.email',
    pass: 'testpass',
  } as any)

  vi.mocked(nodemailer.createTransport).mockClear()
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: currentSendMail } as any)

  vi.mocked(nodemailer.getTestMessageUrl).mockClear()
  vi.mocked(nodemailer.getTestMessageUrl).mockReturnValue(
    'https://ethereal.email/message/test-preview-url',
  )

  // Mock prisma (vi.spyOn es restaurable via vi.restoreAllMocks en afterEach)
  gymFindUniqueSpy = vi.spyOn(prisma.gym, 'findUnique').mockResolvedValue(BASE_GYM as any)
  vi.spyOn(prisma.platformSettings, 'findUnique').mockResolvedValue(null)

  // Sin SMTP de entorno → fuerza path Ethereal en getTransporter()
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  delete process.env.SMTP_HOST
})

afterEach(() => {
  // Restaura vi.spyOn (prisma). vi.mock() no se ve afectado.
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendExpiryReminder
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendExpiryReminder', () => {
  it('gym inexistente → retorna sin error y sin llamar sendMail', async () => {
    gymFindUniqueSpy.mockResolvedValue(null)

    await expect(sendExpiryReminder('gym-no-existe', BASE_MEMBER)).resolves.toBeUndefined()

    expect(nodemailer.createTestAccount).not.toHaveBeenCalled()
    expect(currentSendMail).not.toHaveBeenCalled()
  })

  it('gym sin SMTP → usa Ethereal → llama sendMail con to: member.email', async () => {
    await sendExpiryReminder('gym-id-1', BASE_MEMBER)

    expect(nodemailer.createTestAccount).toHaveBeenCalledOnce()
    expect(nodemailer.createTransport).toHaveBeenCalledOnce()
    expect(currentSendMail).toHaveBeenCalledOnce()

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.to).toBe(BASE_MEMBER.email)
  })

  it('subject por defecto contiene el gym name y los días restantes', async () => {
    // El subject por defecto es: "⏰ Tu membresía en {gym.name} vence en {N} día(s)"
    // El planName NO aparece en el subject por defecto, solo en el body HTML.
    await sendExpiryReminder('gym-id-1', { ...BASE_MEMBER, daysLeft: 5 })

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.subject).toContain('QA Gym Email')
    expect(callArgs.subject).toContain('5')
  })

  it('subject personalizado con {{nombre}} y {{dias}} → reemplaza correctamente', async () => {
    gymFindUniqueSpy.mockResolvedValue({
      ...BASE_GYM,
      emailExpirySubject: 'Hola {{nombre}}, quedan {{dias}} días de tu plan {{plan}}',
    } as any)

    await sendExpiryReminder('gym-id-1', {
      ...BASE_MEMBER,
      name: 'María López',
      daysLeft: 3,
    })

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.subject).toBe('Hola María López, quedan 3 días de tu plan Plan Mensual')
  })

  it('daysLeft = 1 → subject usa singular "día" sin "s" final', async () => {
    await sendExpiryReminder('gym-id-1', { ...BASE_MEMBER, daysLeft: 1 })

    const callArgs = currentSendMail.mock.calls[0][0]
    // Lógica: `día${daysLeft !== 1 ? 's' : ''}` → con 1 no agrega 's'
    expect(callArgs.subject).toMatch(/1 día[^s]|1 día$/)
    expect(callArgs.subject).not.toMatch(/1 días/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendPaymentConfirmation
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendPaymentConfirmation', () => {
  it('gym inexistente → retorna sin error y sin llamar sendMail', async () => {
    gymFindUniqueSpy.mockResolvedValue(null)

    await expect(sendPaymentConfirmation('gym-no-existe', BASE_PAYMENT_DATA)).resolves.toBeUndefined()

    expect(nodemailer.createTestAccount).not.toHaveBeenCalled()
    expect(currentSendMail).not.toHaveBeenCalled()
  })

  it('gym sin SMTP → usa Ethereal → llama sendMail con to: memberEmail', async () => {
    await sendPaymentConfirmation('gym-id-1', BASE_PAYMENT_DATA)

    expect(nodemailer.createTestAccount).toHaveBeenCalledOnce()
    expect(currentSendMail).toHaveBeenCalledOnce()

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.to).toBe(BASE_PAYMENT_DATA.memberEmail)
  })

  it('subject por defecto contiene el nombre del plan', async () => {
    // Subject por defecto: "✅ Pago confirmado — {planName} en {gym.name}"
    await sendPaymentConfirmation('gym-id-1', BASE_PAYMENT_DATA)

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.subject).toContain('Plan Mensual')
  })

  it('subject personalizado con placeholders → reemplaza correctamente', async () => {
    gymFindUniqueSpy.mockResolvedValue({
      ...BASE_GYM,
      emailPaymentSubject: 'Pago de {{nombre}} por {{plan}} recibido',
    } as any)

    await sendPaymentConfirmation('gym-id-1', {
      ...BASE_PAYMENT_DATA,
      memberName: 'Carlos Rojas',
      planName: 'Plan Trimestral',
    })

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.subject).toBe('Pago de Carlos Rojas por Plan Trimestral recibido')
  })

  it('body HTML contiene el monto formateado en CLP (sin decimales)', async () => {
    // amount = 29900 CLP (sin decimales) → toLocaleString('es-CL') → "29.900"
    await sendPaymentConfirmation('gym-id-1', BASE_PAYMENT_DATA)

    const callArgs = currentSendMail.mock.calls[0][0]
    // toLocaleString('es-CL') formatea con punto como separador de miles
    expect(callArgs.html).toContain('29.900')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendBulkEmail
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendBulkEmail', () => {
  const recipients = [
    { name: 'Ana García', email: 'ana@test.com' },
    { name: 'Pedro Silva', email: 'pedro@test.com' },
  ]
  const bulkOptions = {
    recipients,
    subject: 'Aviso para {{nombre}}',
    body: 'Hola {{nombre}}, mensaje del gimnasio',
  }

  it('gym inexistente → retorna { sent: 0, failed: recipients.length }', async () => {
    gymFindUniqueSpy.mockResolvedValue(null)

    const result = await sendBulkEmail('gym-no-existe', bulkOptions)

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(recipients.length)
    expect(currentSendMail).not.toHaveBeenCalled()
  })

  it('éxito con 2 recipients → { sent: 2, failed: 0 } y sendMail llamado 2 veces', async () => {
    const result = await sendBulkEmail('gym-id-1', bulkOptions)

    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(currentSendMail).toHaveBeenCalledTimes(2)

    const [call1, call2] = currentSendMail.mock.calls
    expect(call1[0].to).toBe('ana@test.com')
    expect(call1[0].subject).toBe('Aviso para Ana García')
    expect(call2[0].to).toBe('pedro@test.com')
    expect(call2[0].subject).toBe('Aviso para Pedro Silva')
  })

  it('un recipient falla (sendMail lanza) → { sent: 1, failed: 1 }', async () => {
    currentSendMail
      .mockRejectedValueOnce(new Error('SMTP connection refused'))
      .mockResolvedValueOnce({ messageId: 'ok' })

    const result = await sendBulkEmail('gym-id-1', bulkOptions)

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendWelcomeEmail
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendWelcomeEmail', () => {
  const welcomeData = {
    adminName: 'Roberto Díaz',
    adminEmail: 'roberto@newgym.com',
    gymName: 'Nuevo Gym CrossFit',
    gymSlug: 'nuevo-gym-crossfit',
    tempPassword: 'Abc123!@#',
  }

  it('llama sendMail con to: adminEmail', async () => {
    await sendWelcomeEmail(welcomeData)

    expect(currentSendMail).toHaveBeenCalledOnce()
    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.to).toBe(welcomeData.adminEmail)
  })

  it('subject contiene gymName', async () => {
    await sendWelcomeEmail(welcomeData)

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.subject).toContain('Nuevo Gym CrossFit')
  })

  it('body HTML contiene tempPassword y gymSlug', async () => {
    await sendWelcomeEmail(welcomeData)

    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.html).toContain(welcomeData.tempPassword)
    expect(callArgs.html).toContain(welcomeData.gymSlug)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendTestEmail
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendTestEmail', () => {
  it('gym inexistente → lanza Error("Gimnasio no encontrado")', async () => {
    gymFindUniqueSpy.mockResolvedValue(null)

    await expect(sendTestEmail('gym-no-existe')).rejects.toThrow('Gimnasio no encontrado')
    expect(currentSendMail).not.toHaveBeenCalled()
  })

  it('gym sin SMTP → usa Ethereal → llama sendMail y retorna { success: true }', async () => {
    const result = await sendTestEmail('gym-id-1')

    expect(nodemailer.createTestAccount).toHaveBeenCalledOnce()
    expect(currentSendMail).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
  })

  it('to es el email del gym si existe', async () => {
    gymFindUniqueSpy.mockResolvedValue({
      ...BASE_GYM,
      email: 'contacto@migym.com',
    } as any)

    const result = await sendTestEmail('gym-id-1')

    expect(result.to).toBe('contacto@migym.com')
    const callArgs = currentSendMail.mock.calls[0][0]
    expect(callArgs.to).toBe('contacto@migym.com')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// sendBulkToGyms
// ═══════════════════════════════════════════════════════════════════════════════

describe('sendBulkToGyms', () => {
  const bulkGymsOptions = {
    subject: 'Anuncio para {{gimnasio}}',
    body: 'Hola {{nombre}}, hay novedades en FitApp.',
  }

  it('sin SMTP configurado (sin env vars) → retorna { sent: 0, failed: N, errors: ["SMTP no configurado"] }', async () => {
    // Sin SMTP_USER/SMTP_PASS (limpiados en beforeEach) y platformSettings devuelve null
    vi.spyOn(prisma.gym, 'findMany').mockResolvedValue([
      { id: 'g1', name: 'Gym Alpha', ownerEmail: 'owner@alpha.com' } as any,
      { id: 'g2', name: 'Gym Beta', ownerEmail: 'owner@beta.com' } as any,
    ])

    const result = await sendBulkToGyms(bulkGymsOptions)

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(2)
    expect(result.errors).toContain('SMTP no configurado')
    expect(currentSendMail).not.toHaveBeenCalled()
  })

  it('con SMTP en env vars → crea transporter y envía a ownerEmail de cada gym', async () => {
    process.env.SMTP_USER = 'platform@fitapp.cl'
    process.env.SMTP_PASS = 'platform-secret'
    process.env.SMTP_HOST = 'smtp.example.com'

    vi.spyOn(prisma.gym, 'findMany').mockResolvedValue([
      { id: 'g1', name: 'Gym Alpha', ownerEmail: 'owner@alpha.com' } as any,
      { id: 'g2', name: 'Gym Beta', ownerEmail: 'owner@beta.com' } as any,
    ])

    const result = await sendBulkToGyms(bulkGymsOptions)

    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)

    // sendBulkToGyms reimporta nodemailer dinámicamente y llama createTransport
    expect(nodemailer.createTransport).toHaveBeenCalledOnce()
    expect(currentSendMail).toHaveBeenCalledTimes(2)

    const [call1, call2] = currentSendMail.mock.calls
    expect(call1[0].subject).toBe('Anuncio para Gym Alpha')
    expect(call2[0].subject).toBe('Anuncio para Gym Beta')

    // Cleanup
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_HOST
  })
})
