import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireSuperAdmin } from '../../middlewares/auth.middleware'
import nodemailer, { type Transporter } from 'nodemailer'


const SETTINGS_ID = 'system'

async function getSettings() {
  return prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  })
}

const updateSchema = z.object({
  smtpHost:             z.string().optional().nullable(),
  smtpPort:             z.number().int().optional().nullable(),
  smtpUser:             z.string().optional().nullable(),
  smtpPass:             z.string().optional().nullable(),
  smtpFrom:             z.string().optional().nullable(),
  subExpiryReminderDays: z.number().int().min(1).max(90).optional(),
})

export async function platformConfigRoutes(app: FastifyInstance) {
  // GET — devuelve configuración actual, con fallback a env vars si la DB está vacía
  app.get('/superadmin/config', { preHandler: requireSuperAdmin }, async (_req, reply) => {
    const s = await getSettings()
    const hasDbPass = !!s.smtpPass
    return reply.send({
      ...s,
      smtpHost: s.smtpHost ?? process.env.SMTP_HOST ?? null,
      smtpPort: s.smtpPort ?? (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null),
      smtpUser: s.smtpUser ?? process.env.SMTP_USER ?? null,
      smtpPass: hasDbPass ? '••••••••' : (process.env.SMTP_PASS ? '••••••••' : null),
      smtpFrom: s.smtpFrom ?? process.env.SMTP_FROM ?? null,
    })
  })

  // PATCH — actualiza configuración
  app.patch('/superadmin/config', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const data: any = { ...parsed.data }

    // Si el cliente manda el valor enmascarado significa que no quiere cambiarlo
    if (data.smtpPass === '••••••••') delete data.smtpPass

    const updated = await prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    })

    return reply.send({ ...updated, smtpPass: updated.smtpPass ? '••••••••' : null })
  })

  // POST — enviar correo de prueba con la config actual
  app.post('/superadmin/config/test-email', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { to } = request.body as any
    if (!to) return reply.status(400).send({ error: 'Se requiere el destinatario (to)' })

    const s = await getSettings()

    const host = s.smtpHost || process.env.SMTP_HOST
    const port = s.smtpPort || Number(process.env.SMTP_PORT) || 587
    const user = s.smtpUser || process.env.SMTP_USER
    const pass = s.smtpPass || process.env.SMTP_PASS
    const from = s.smtpFrom || process.env.SMTP_FROM || 'FitApp <noreply@fitapp.cl>'

    let previewUrl: string | undefined

    let transporter: Transporter
    if (!user || !pass) {
      const testAccount = await nodemailer.createTestAccount()
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email', port: 587, secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
      previewUrl = 'ethereal'
    } else {
      transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com', port, secure: port === 465,
        auth: { user, pass },
      })
    }

    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject: '✉️ Correo de prueba — FitApp',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <h2 style="color:#6366f1;">✅ Configuración SMTP funcionando</h2>
            <p style="color:#374151;">El servidor de correo de FitApp está configurado correctamente.</p>
            <p style="color:#6b7280;font-size:13px;">Este es un correo de prueba enviado desde el panel de super administrador.</p>
          </div>`,
      })
      if (previewUrl === 'ethereal') {
        previewUrl = nodemailer.getTestMessageUrl(info) as string
        return reply.send({ ok: true, ethereal: true, previewUrl })
      }
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.status(500).send({ error: `Error SMTP: ${err.message}` })
    }
  })

}

