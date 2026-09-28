import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'
import { RegisterInput, LoginInput } from './auth.schema'
import { logger } from '../../lib/logger'

const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7', 10)

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// ── Lockout por email — Redis INCR + EXPIRE ───────────────────────────────────
// Funciona en múltiples instancias y sobrevive reinicios.
// Fallback a allow-through si Redis no está disponible (no bloquear logins).
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_LOCKOUT_SECS = 15 * 60 // 15 minutos

async function checkLoginLockout(key: string): Promise<void> {
  try {
    // TTL devuelve -2 si la clave no existe: un solo viaje a Redis en vez de GET + TTL
    const ttl = await redis.ttl(`lockout:${key}`)
    if (ttl !== -2) {
      const mins = Math.max(1, Math.ceil(ttl / 60))
      throw new Error(`Cuenta bloqueada temporalmente. Intenta en ${mins} minuto${mins !== 1 ? 's' : ''}.`)
    }
  } catch (err: any) {
    // Re-throw solo si es el error de lockout, no errores de Redis
    if (err.message.startsWith('Cuenta bloqueada')) throw err
    // Redis no disponible → permitir login (fail open)
  }
}

async function recordFailedLogin(key: string): Promise<void> {
  try {
    const attemptsKey = `attempts:${key}`
    const count = await redis.incr(attemptsKey)
    // Expirar el contador en 15 min (se reinicia el conteo si pasa tiempo)
    if (count === 1) await redis.expire(attemptsKey, LOGIN_LOCKOUT_SECS)

    if (count >= LOGIN_MAX_ATTEMPTS) {
      await redis.setex(`lockout:${key}`, LOGIN_LOCKOUT_SECS, '1')
      await redis.del(attemptsKey)
    }
  } catch {
    // Redis no disponible → ignorar, no bloquear la API
  }
}

async function clearLoginAttempts(key: string): Promise<void> {
  try {
    await redis.del(`attempts:${key}`, `lockout:${key}`)
  } catch {
    // ignorar
  }
}

export async function createRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomUUID()
  const tokenHash = hashToken(raw)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

  await prisma.refreshToken.create({ data: { tokenHash, userId, expiresAt } })
  return raw
}

export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; newRaw: string }> {
  const tokenHash = hashToken(rawToken)

  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } })
  if (!existing) throw new Error('Refresh token inválido')
  if (existing.revokedAt) throw new Error('Refresh token revocado')
  if (existing.expiresAt < new Date()) throw new Error('Refresh token expirado')

  const newRaw = crypto.randomUUID()
  const newHash = hashToken(newRaw)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: { tokenHash: newHash, userId: existing.userId, expiresAt },
    }),
  ])

  return { userId: existing.userId, newRaw }
}

export async function revokeRefreshToken(userId: string, rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken)

  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } })
  // Si no existe o ya está revocado, idempotente — no es error
  if (!existing || existing.revokedAt) return
  // Verificar que el token pertenece al usuario que hace logout
  if (existing.userId !== userId) return

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  })
}

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
      omit: { passwordHash: false },
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

  const lockoutKey = `${data.gymSlug}:${data.email.toLowerCase()}`
  await checkLoginLockout(lockoutKey)

  const user = await prisma.user.findFirst({
    where: { gymId: gym.id, email: data.email },
    omit: { passwordHash: false },
  })

  const valid = user ? await bcrypt.compare(data.password, user.passwordHash) : false

  if (!user || !valid) {
    await recordFailedLogin(lockoutKey)
    throw new Error('Credenciales inválidas')
  }

  await clearLoginAttempts(lockoutKey)

  return {
    userId: user.id,
    gymId: gym.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
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
    logger.warn('[Auth] SMTP no configurado, no se puede enviar correo de recuperación')
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
