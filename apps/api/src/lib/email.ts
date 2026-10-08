import nodemailer from 'nodemailer'
import { prisma } from './prisma'
import { toMajorUnits } from './money'

// nodemailer usa 2 minutos de connectionTimeout por defecto: un SMTP mal configurado o
// inalcanzable (host equivocado, firewall) deja cualquier endpoint que envíe un correo
// (p. ej. POST /superadmin/gyms) colgado ese tiempo antes de caer al catch. 10s es de
// sobra para un SMTP real y evita ese bloqueo.
const SMTP_TIMEOUT_MS = 10_000
const smtpTimeouts = { connectionTimeout: SMTP_TIMEOUT_MS, greetingTimeout: SMTP_TIMEOUT_MS, socketTimeout: SMTP_TIMEOUT_MS }

type GymSmtp = {
  smtpHost?: string | null
  smtpPort?: number | null
  smtpUser?: string | null
  smtpPass?: string | null
  smtpFrom?: string | null
  name: string
}

async function getPlatformSmtp() {
  try {
    const s = await prisma.platformSettings.findUnique({ where: { id: 'system' } })
    return s ?? {}
  } catch {
    return {}
  }
}

async function getTransporter(gym: GymSmtp) {
  const platform = await getPlatformSmtp() as any
  const host = gym.smtpHost || platform.smtpHost || process.env.SMTP_HOST
  const port = gym.smtpPort || platform.smtpPort || Number(process.env.SMTP_PORT) || 587
  const user = gym.smtpUser || platform.smtpUser || process.env.SMTP_USER
  const pass = gym.smtpPass || platform.smtpPass || process.env.SMTP_PASS

  if (!user || !pass) {
    // Fallback: Ethereal test account (emails visible at ethereal.email)
    const testAccount = await nodemailer.createTestAccount()
    console.info(`[Email] No SMTP configured — using Ethereal test account: ${testAccount.user}`)
    return {
      transporter: nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
        ...smtpTimeouts,
      }),
      ethereal: true,
      from: `FitApp Test <${testAccount.user}>`,
    }
  }

  return {
    transporter: nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user, pass },
      ...smtpTimeouts,
    }),
    ethereal: false,
    from: gym.smtpFrom || process.env.SMTP_FROM || `${gym.name} <${user}>`,
  }
}

function replacePlaceholders(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(v), template)
}

// Texto de usuario (nombre del alumno, cuerpo del mensaje, nombre del gym...) termina
// embebido tal cual dentro de HTML — sin esto, alguien con "<" o "&" en su nombre rompe
// el layout del correo, y un admin podría inyectar HTML/links de phishing en el cuerpo
// de un envío masivo usando la plantilla "oficial" del gym (QA comunicaciones, 2026-10-07).
// Solo para texto que se inserta en el BODY del HTML — el asunto del correo no es HTML,
// no hay que escaparlo (se vería "&amp;" literal).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeVars(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]))
}

// gymName y headerTitle se escapan acá, una sola vez — son los dos parámetros que todos
// los callers arman con texto de usuario (nombre del gym, a veces mezclado con texto fijo
// propio); `body` NO se escapa acá, cada caller ya lo arma pre-escapado donde corresponde.
function wrapInLayout(gymNameRaw: string, headerColor: string, headerEmoji: string, headerTitleRaw: string, body: string, logoUrl?: string | null): string {
  const gymName = escapeHtml(gymNameRaw)
  const headerTitle = escapeHtml(headerTitleRaw)
  const apiBase = process.env.PUBLIC_API_URL || 'http://localhost:3001'
  const logoHtml = logoUrl
    ? `<img src="${apiBase}${logoUrl}" alt="${gymName}" style="height:56px;width:56px;border-radius:12px;object-fit:cover;border:3px solid rgba(255,255,255,0.3);margin-bottom:12px;" />`
    : `<p style="margin:0 0 8px;font-size:40px;">${headerEmoji}</p>`
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${headerColor};padding:32px 40px;text-align:center;">
      ${logoHtml}
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">${headerTitle}</h1>
    </div>
    <div style="padding:32px 40px;">
      ${body}
    </div>
    <div style="background:#f9fafb;padding:16px 40px;border-top:1px solid #f3f4f6;text-align:center;">
      <p style="color:#d1d5db;font-size:12px;margin:0;">${gymName} · Powered by FitApp</p>
    </div>
  </div>
</body>
</html>`
}

export async function sendExpiryReminder(gymId: string, member: {
  name: string
  email: string
  planName: string
  daysLeft: number
  endsAt: Date
}) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      name: true, logoUrl: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true,
      emailExpirySubject: true, emailExpiryBody: true,
    },
  })
  if (!gym) return

  const { transporter, ethereal, from } = await getTransporter(gym)

  const endsStr = member.endsAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const urgencyColor = member.daysLeft <= 1 ? '#ef4444' : member.daysLeft <= 3 ? '#f59e0b' : '#6366f1'

  const vars = {
    nombre: member.name,
    plan: member.planName,
    dias: String(member.daysLeft),
    fecha_vencimiento: endsStr,
    gimnasio: gym.name,
  }

  const subject = gym.emailExpirySubject
    ? replacePlaceholders(gym.emailExpirySubject, vars)
    : `⏰ Tu membresía en ${gym.name} vence en ${member.daysLeft} día${member.daysLeft !== 1 ? 's' : ''}`

  let htmlBody: string
  if (gym.emailExpiryBody) {
    const customText = replacePlaceholders(escapeHtml(gym.emailExpiryBody), escapeVars(vars))
    htmlBody = wrapInLayout(
      gym.name, urgencyColor, '⏰', 'Tu membresía vence pronto',
      `<p style="color:#374151;font-size:15px;line-height:1.7;white-space:pre-line;">${customText}</p>`,
      gym.logoUrl,
    )
  } else {
    htmlBody = wrapInLayout(
      gym.name, urgencyColor, '⏰', 'Tu membresía vence pronto',
      `<p style="color:#374151;font-size:16px;margin:0 0 8px;">Hola <strong>${escapeHtml(member.name)}</strong>,</p>
      <p style="color:#6b7280;font-size:15px;margin:0 0 24px;line-height:1.6;">
        Tu plan <strong>${escapeHtml(member.planName)}</strong> en <strong>${escapeHtml(gym.name)}</strong> vence el <strong>${endsStr}</strong>.
        ${member.daysLeft <= 1 ? 'Es el último día, renueva ahora para no perder tu membresía.' : `Quedan <strong style="color:${urgencyColor}">${member.daysLeft} días</strong>.`}
      </p>
      <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#6b7280;font-size:14px;">Plan</span>
          <span style="color:#111827;font-size:14px;font-weight:600;">${member.planName}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;font-size:14px;">Vence</span>
          <span style="color:${urgencyColor};font-size:14px;font-weight:600;">${endsStr}</span>
        </div>
      </div>
      <p style="color:#9ca3af;font-size:13px;margin:0;">Contáctate con tu gimnasio para renovar tu plan.</p>`,
      gym.logoUrl,
    )
  }

  const info = await transporter.sendMail({ from, to: member.email, subject, html: htmlBody })
  if (ethereal) {
    console.info(`[Email] Expiry reminder preview: ${nodemailer.getTestMessageUrl(info)}`)
  }
}

export async function sendPaymentConfirmation(gymId: string, data: {
  memberName: string
  memberEmail: string
  planName: string
  amount: number
  currency: string
  paymentMethod: string
  endsAt: Date
  invoicePdfUrl?: string | null
  invoiceType?: string | null
  invoiceNumber?: number | null
}) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      name: true, logoUrl: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true,
      emailPaymentSubject: true, emailPaymentBody: true,
    },
  })
  if (!gym) return

  const { transporter, ethereal, from } = await getTransporter(gym)

  const amountStr = toMajorUnits(data.amount, data.currency).toLocaleString('es-CL')
  const methodLabel: Record<string, string> = {
    cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta',
    stripe: 'Pago online', other: 'Otro',
  }
  const endsStr = data.endsAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

  const vars = {
    nombre: data.memberName,
    plan: data.planName,
    monto: amountStr,
    moneda: data.currency,
    metodo: methodLabel[data.paymentMethod] || data.paymentMethod,
    fecha_vencimiento: endsStr,
    gimnasio: gym.name,
  }

  const subject = gym.emailPaymentSubject
    ? replacePlaceholders(gym.emailPaymentSubject, vars)
    : `✅ Pago confirmado — ${data.planName} en ${gym.name}`

  const invoiceSection = data.invoicePdfUrl ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#15803d;font-size:14px;font-weight:600;">
        📄 ${data.invoiceType === 'factura' ? 'Factura electrónica' : 'Boleta electrónica'} N° ${data.invoiceNumber}
      </p>
      <a href="${data.invoicePdfUrl}" style="color:#16a34a;font-size:13px;text-decoration:underline;">
        Descargar documento →
      </a>
    </div>` : ''

  let htmlBody: string
  if (gym.emailPaymentBody) {
    const customText = replacePlaceholders(escapeHtml(gym.emailPaymentBody), escapeVars(vars))
    htmlBody = wrapInLayout(
      gym.name, '#6366f1', '✅', 'Pago confirmado',
      `<p style="color:#374151;font-size:15px;line-height:1.7;white-space:pre-line;">${customText}</p>${invoiceSection}`,
      gym.logoUrl,
    )
  } else {
    htmlBody = wrapInLayout(
      gym.name, '#6366f1', '✅', 'Pago confirmado',
      `<p style="color:#374151;font-size:16px;margin:0 0 8px;">Hola <strong>${escapeHtml(data.memberName)}</strong>,</p>
      <p style="color:#6b7280;font-size:15px;margin:0 0 24px;line-height:1.6;">
        Tu pago en <strong>${escapeHtml(gym.name)}</strong> fue registrado correctamente.
      </p>
      <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#6b7280;font-size:14px;">Plan</span>
          <span style="color:#111827;font-size:14px;font-weight:600;">${escapeHtml(data.planName)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#6b7280;font-size:14px;">Monto</span>
          <span style="color:#111827;font-size:14px;font-weight:600;">${amountStr} ${data.currency}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#6b7280;font-size:14px;">Método</span>
          <span style="color:#111827;font-size:14px;">${escapeHtml(methodLabel[data.paymentMethod] || data.paymentMethod)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b7280;font-size:14px;">Vence</span>
          <span style="color:#111827;font-size:14px;">${endsStr}</span>
        </div>
      </div>
      ${invoiceSection}`,
      gym.logoUrl,
    )
  }

  const info = await transporter.sendMail({ from, to: data.memberEmail, subject, html: htmlBody })
  if (ethereal) {
    console.info(`[Email] Payment confirmation preview: ${nodemailer.getTestMessageUrl(info)}`)
  }
}

export async function sendBulkToGyms(options: {
  subject: string
  body: string
  filters?: {
    status?: string[]
    subscriptionPlan?: string[]
    gymIds?: string[]
  }
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  const { filters } = options

  const where: any = { deletedAt: null }
  if (filters?.status?.length)           where.status           = { in: filters.status }
  if (filters?.subscriptionPlan?.length) where.subscriptionPlan = { in: filters.subscriptionPlan }
  if (filters?.gymIds?.length)           where.id               = { in: filters.gymIds }

  const gyms = await prisma.gym.findMany({
    where,
    select: { id: true, name: true, ownerEmail: true },
  })

  const platform = await getPlatformSmtp() as any
  const host = platform.smtpHost || process.env.SMTP_HOST
  const port = platform.smtpPort || Number(process.env.SMTP_PORT) || 587
  const user = platform.smtpUser || process.env.SMTP_USER
  const pass = platform.smtpPass || process.env.SMTP_PASS
  const from = platform.smtpFrom || process.env.SMTP_FROM || 'FitApp <noreply@fitapp.cl>'

  if (!user || !pass) {
    return { sent: 0, failed: gyms.length, errors: ['SMTP no configurado'] }
  }

  const nodemailer = (await import('nodemailer')).default
  const transporter = nodemailer.createTransport({
    host: host || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user, pass },
    ...smtpTimeouts,
  })

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const gym of gyms) {
    if (!gym.ownerEmail) { failed++; continue }
    const vars = { gimnasio: gym.name, nombre: gym.name }
    const subject = replacePlaceholders(options.subject, vars)
    const bodyText = replacePlaceholders(escapeHtml(options.body), escapeVars(vars))
    const html = wrapInLayout(
      gym.name, '#6366f1', '📢', subject,
      `<p style="color:#374151;font-size:15px;line-height:1.7;white-space:pre-line;">${bodyText}</p>`,
    )
    try {
      await transporter.sendMail({ from, to: gym.ownerEmail, subject, html })
      sent++
    } catch (e: any) {
      failed++
      errors.push(`${gym.name}: ${e.message}`)
    }
  }

  return { sent, failed, errors }
}

export async function sendBulkEmail(
  gymId: string,
  options: {
    recipients: { name: string; email: string }[]
    subject: string
    body: string
  },
): Promise<{ sent: number; failed: number }> {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: { name: true, logoUrl: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true },
  })
  if (!gym) return { sent: 0, failed: options.recipients.length }

  const { transporter, from } = await getTransporter(gym)
  let sent = 0
  let failed = 0

  for (const recipient of options.recipients) {
    const vars = { nombre: recipient.name, gimnasio: gym.name }
    const subject = replacePlaceholders(options.subject, vars)
    const bodyText = replacePlaceholders(escapeHtml(options.body), escapeVars(vars))
    const html = wrapInLayout(
      gym.name, '#6366f1', '📢', subject,
      `<p style="color:#374151;font-size:15px;line-height:1.7;white-space:pre-line;">${bodyText}</p>`,
      gym.logoUrl,
    )
    try {
      await transporter.sendMail({ from, to: recipient.email, subject, html })
      sent++
    } catch {
      failed++
    }
  }

  return { sent, failed }
}

export async function sendWelcomeEmail(data: {
  adminName: string
  adminEmail: string
  gymName: string
  gymSlug: string
  tempPassword: string
}) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const loginUrl = `${frontendUrl}/login`

  // Usa SMTP del sistema (el gym nuevo no tiene SMTP aún)
  const { transporter, ethereal, from } = await getTransporter({
    name: 'FitApp',
    smtpHost: null, smtpPort: null, smtpUser: null, smtpPass: null, smtpFrom: null,
  })

  const html = wrapInLayout(
    'FitApp', '#6366f1', '🏋️', `¡Bienvenido a FitApp, ${data.gymName}!`,
    `<p style="color:#374151;font-size:16px;margin:0 0 8px;">Hola <strong>${escapeHtml(data.adminName)}</strong>,</p>
    <p style="color:#6b7280;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Tu cuenta de administrador para <strong>${escapeHtml(data.gymName)}</strong> ha sido creada. Usa las siguientes credenciales para ingresar por primera vez:
    </p>
    <div style="background:#f3f4f6;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="margin-bottom:12px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Slug del gimnasio</p>
        <p style="margin:0;color:#111827;font-size:16px;font-weight:700;font-family:monospace;">${escapeHtml(data.gymSlug)}</p>
      </div>
      <div style="margin-bottom:12px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Email</p>
        <p style="margin:0;color:#111827;font-size:16px;font-weight:700;">${escapeHtml(data.adminEmail)}</p>
      </div>
      <div>
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Contraseña temporal</p>
        <p style="margin:0;color:#6366f1;font-size:20px;font-weight:700;font-family:monospace;letter-spacing:0.1em;">${data.tempPassword}</p>
      </div>
    </div>
    <p style="color:#ef4444;font-size:13px;margin:0 0 24px;">⚠️ Se te pedirá cambiar esta contraseña al iniciar sesión por primera vez.</p>
    <a href="${loginUrl}"
      style="display:block;text-align:center;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:12px;">
      Ingresar a FitApp →
    </a>`,
  )

  const info = await transporter.sendMail({
    from,
    to: data.adminEmail,
    subject: `🏋️ Bienvenido a FitApp — ${data.gymName}`,
    html,
  })

  if (ethereal) {
    const url = nodemailer.getTestMessageUrl(info) as string
    console.info(`[Email] Welcome email preview: ${url}`)
    return { previewUrl: url }
  }
  return {}
}

export async function sendTestEmail(gymId: string): Promise<{ success: boolean; previewUrl?: string; to: string }> {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      name: true, email: true, logoUrl: true,
      smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true,
    },
  })
  if (!gym) throw new Error('Gimnasio no encontrado')

  const to = gym.email || gym.smtpUser || process.env.SMTP_USER || 'test@fitapp.cl'
  const { transporter, ethereal, from } = await getTransporter(gym)

  const info = await transporter.sendMail({
    from,
    to,
    subject: `✉️ Correo de prueba — ${gym.name}`,
    html: wrapInLayout(
      gym.name, '#6366f1', '✉️', 'Prueba de correo exitosa',
      `<p style="color:#374151;font-size:16px;margin:0 0 16px;">La configuración de correo de <strong>${escapeHtml(gym.name)}</strong> está funcionando correctamente.</p>
      <p style="color:#6b7280;font-size:14px;margin:0;">Este es un correo de prueba enviado desde FitApp.</p>`,
      gym.logoUrl,
    ),
  })

  const previewUrl = ethereal ? (nodemailer.getTestMessageUrl(info) as string) : undefined
  if (previewUrl) console.info(`[Email] Test email preview: ${previewUrl}`)

  return { success: true, previewUrl, to }
}
