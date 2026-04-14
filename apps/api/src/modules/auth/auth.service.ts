import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { prisma } from '../../lib/prisma'
import { RegisterInput, LoginInput } from './auth.schema'

export async function registerGym(data: RegisterInput) {
  const existingGym = await prisma.gym.findUnique({
    where: { slug: data.gymSlug },
  })
  if (existingGym) throw new Error('El slug del gimnasio ya está en uso')

  const passwordHash = await bcrypt.hash(data.password, 10)

  const gym = await prisma.gym.create({
    data: {
      name: data.gymName,
      slug: data.gymSlug,
      users: {
        create: {
          name: data.adminName,
          email: data.email,
          passwordHash,
          role: 'ADMIN',
        },
      },
    },
    include: { users: true },
  })

  const admin = gym.users[0]
  return { gymId: gym.id, userId: admin.id, email: admin.email, role: admin.role }
}

export async function loginUser(data: LoginInput) {
  // ── Path superadmin: solo cuando NO se proporciona slug ──
  if (!data.gymSlug) {
    const superAdmin = await prisma.user.findFirst({
      where: { email: data.email, role: 'SUPER_ADMIN' },
    })
    if (!superAdmin) throw new Error('Credenciales inválidas')
    const valid = await bcrypt.compare(data.password, superAdmin.passwordHash)
    if (!valid) throw new Error('Credenciales inválidas')
    return {
      userId: superAdmin.id,
      gymId: null,
      email: superAdmin.email,
      name: superAdmin.name,
      role: superAdmin.role,
      mustChangePassword: superAdmin.mustChangePassword,
    }
  }

  // ── Path gimnasio: busca solo dentro del gym indicado ──
  const gym = await prisma.gym.findUnique({ where: { slug: data.gymSlug } })
  if (!gym) throw new Error('Gimnasio no encontrado')
  if (gym.status === 'SUSPENDED') throw new Error('Este gimnasio está suspendido')

  const user = await prisma.user.findFirst({
    where: { gymId: gym.id, email: data.email },
  })
  if (!user) throw new Error('Credenciales inválidas')

  const valid = await bcrypt.compare(data.password, user.passwordHash)
  if (!valid) throw new Error('Credenciales inválidas')

  return {
    userId: user.id,
    gymId: gym.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

export async function forgotPassword(email: string, gymSlug?: string) {
  // Find user — super admin path or gym user path
  let user: any = null

  if (!gymSlug) {
    user = await prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN' } })
  } else {
    const gym = await prisma.gym.findUnique({
      where: { slug: gymSlug },
      select: { id: true, name: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true },
    })
    if (gym) {
      user = await prisma.user.findFirst({ where: { email, gymId: gym.id } })
      if (user) user._gym = gym
    }
  }

  // Always return success to avoid email enumeration
  if (!user) return

  // Invalidate previous tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  })

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`

  // Build transporter — gym SMTP or system SMTP
  const gym = user._gym
  const host = gym?.smtpHost || process.env.SMTP_HOST
  const port = gym?.smtpPort || Number(process.env.SMTP_PORT) || 587
  const smtpUser = gym?.smtpUser || process.env.SMTP_USER
  const smtpPass = gym?.smtpPass || process.env.SMTP_PASS
  const from = gym?.smtpFrom || process.env.SMTP_FROM || 'FitApp <noreply@fitapp.cl>'
  const gymName = gym?.name || 'FitApp'

  if (!smtpUser || !smtpPass) {
    console.warn('[Auth] SMTP no configurado, no se puede enviar correo de recuperación')
    return
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  await transporter.sendMail({
    from,
    to: email,
    subject: `🔑 Recuperar contraseña — ${gymName}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#6366f1;padding:32px 40px;text-align:center;">
      <p style="margin:0;font-size:36px;">🔑</p>
      <h1 style="margin:12px 0 0;color:#fff;font-size:22px;font-weight:700;">Recuperar contraseña</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:15px;margin:0 0 8px;">Hola <strong>${user.name}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 28px;line-height:1.6;">
        Recibimos una solicitud para restablecer tu contraseña en <strong>${gymName}</strong>.
        Este link es válido por <strong>1 hora</strong>.
      </p>
      <a href="${resetUrl}"
        style="display:block;text-align:center;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:12px;">
        Restablecer contraseña →
      </a>
      <p style="color:#9ca3af;font-size:12px;margin:20px 0 0;text-align:center;">
        Si no solicitaste esto, ignora este correo. Tu contraseña no cambiará.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 40px;border-top:1px solid #f3f4f6;text-align:center;">
      <p style="color:#d1d5db;font-size:12px;margin:0;">${gymName} · Powered by FitApp</p>
    </div>
  </div>
</body>
</html>`,
  })
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!record) throw new Error('Token inválido')
  if (record.usedAt) throw new Error('Este link ya fue utilizado')
  if (record.expiresAt < new Date()) throw new Error('El link ha expirado')

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])
}
