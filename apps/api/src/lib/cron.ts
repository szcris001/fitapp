import cron from 'node-cron'
import { prisma } from './prisma'
import { sendExpiryReminder, sendBulkToGyms } from './email'
import { sendPushNotification } from './push'
import { chargeAutoRenewMembership } from '../modules/payments/payments.service'
import { gymDayRangeFromToday, DEFAULT_GYM_TIMEZONE } from './gym-day'
import { logger } from './logger'
import { awardConsistencyBadgesForGym, semesterWindowsForYear } from '../modules/consistency/consistency.service'

/**
 * Aviso diario a las 9:00 AM: membresías de miembros por vencer.
 */
async function runMemberExpiryJob() {
  logger.info('[Cron] Revisando membresías por vencer...')
  const gyms = await prisma.gym.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, expiryReminderDays: true, timezone: true },
  })

  for (const gym of gyms) {
    const days = gym.expiryReminderDays ?? 3
    if (days <= 0) continue

    // Día local del gym que está a `days` días de hoy
    const { gte: start, lt: end } = gymDayRangeFromToday(gym.timezone || DEFAULT_GYM_TIMEZONE, days)

    const memberships = await prisma.membership.findMany({
      where: {
        user: { gymId: gym.id },
        status: 'ACTIVE',
        endsAt: { gte: start, lt: end },
      },
      include: {
        user: { select: { name: true, email: true, pushToken: true } },
        plan: { select: { name: true } },
      },
    })

    for (const m of memberships) {
      try {
        await sendExpiryReminder(gym.id, {
          name:     m.user.name,
          email:    m.user.email,
          planName: m.plan.name,
          daysLeft: days,
          endsAt:   m.endsAt,
        })
        logger.info(`[Cron] Aviso enviado a ${m.user.email} (vence en ${days}d)`)
      } catch (err) {
        logger.error({ err }, `[Cron] Error enviando aviso a ${m.user.email}`)
      }
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          days === 1 ? '⚠️ Tu membresía vence mañana' : `⚠️ Tu membresía vence en ${days} días`,
          `Tu plan "${m.plan.name}" expira el ${m.endsAt.toLocaleDateString('es-CL')}.`,
          { type: 'MEMBERSHIP_EXPIRY', daysLeft: days }
        )
      }
    }
  }
}

// Gracia tras el inicio de la clase antes de marcar asistencia automática — evita
// marcar "asistió" en el instante exacto que arranca la clase (QA H-MOBILE-03,
// docs/QA_MOBILE_MAESTRO.md).
const AUTO_ATTENDANCE_GRACE_MINS = 5

/**
 * Marca automáticamente como ATTENDED las reservas CONFIRMED de clases que ya
 * empezaron hace más de AUTO_ATTENDANCE_GRACE_MINS, en gyms con attendanceMode =
 * 'auto'. Corre cada 5 minutos.
 */
async function runAutoAttendanceJob() {
  const cutoff = new Date(Date.now() - AUTO_ATTENDANCE_GRACE_MINS * 60 * 1000)
  const gyms = await prisma.gym.findMany({
    where: { attendanceMode: 'auto', status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  })
  if (!gyms.length) return

  for (const gym of gyms) {
    const updated = await prisma.booking.updateMany({
      where: {
        status: 'CONFIRMED',
        class: {
          gymId: gym.id,
          startsAt: { lte: cutoff },
        },
      },
      data: { status: 'ATTENDED', attended: true, attendedAt: new Date() },
    })
    if (updated.count > 0) {
      logger.info(`[Cron] Auto-asistencia gym ${gym.id}: ${updated.count} reservas marcadas`)
    }
  }
}

/**
 * Suspende automáticamente gimnasios cuya suscripción ha vencido.
 * Corre cada hora.
 */
async function runGymAutoSuspendJob() {
  const now = new Date()
  const expired = await prisma.gymSubscription.findMany({
    where: {
      status: { in: ['TRIAL', 'ACTIVE'] },
      endsAt: { lt: now },
      gym: { deletedAt: null, status: { not: 'SUSPENDED' } },
    },
    include: { gym: { select: { id: true, name: true } } },
  })

  for (const sub of expired) {
    await prisma.$transaction([
      prisma.gymSubscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } }),
      prisma.gym.update({ where: { id: sub.gymId }, data: { status: 'SUSPENDED' } }),
    ])
    logger.info(`[Cron] Gym suspendido por vencimiento: ${sub.gym.name} (sub ${sub.id})`)
  }

  if (expired.length) logger.info(`[Cron] ${expired.length} gym(s) suspendido(s)`)
}

/**
 * Aviso diario a las 8:00 AM: suscripción FitApp de gimnasios por vencer.
 */
async function runSubscriptionExpiryJob() {
  logger.info('[Cron] Revisando suscripciones FitApp por vencer...')

  const settings = await prisma.platformSettings.findUnique({ where: { id: 'system' } })
  const days = settings?.subExpiryReminderDays ?? 7

  const template = await prisma.emailTemplate.findUnique({ where: { slug: 'subscription_expiry' } })
  if (!template || !template.isActive) return

  const now = new Date()
  const targetStart = new Date(now); targetStart.setDate(now.getDate() + days); targetStart.setHours(0, 0, 0, 0)
  const targetEnd   = new Date(targetStart); targetEnd.setHours(23, 59, 59, 999)

  // Solo gimnasios cuya suscripción vence exactamente en `days` días
  const subs = await prisma.gymSubscription.findMany({
    where: {
      status: { in: ['TRIAL', 'ACTIVE'] },
      endsAt: { gte: targetStart, lte: targetEnd },
      gym: { deletedAt: null },
    },
    include: {
      gym: { select: { name: true, ownerEmail: true, subscriptionPlan: true } },
      plan: { select: { name: true } },
    },
  })

  const dateStr = targetStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  let sent = 0

  for (const sub of subs) {
    if (!sub.gym.ownerEmail) continue
    const subject = template.subject
      .replace(/\{\{gimnasio\}\}/g, sub.gym.name)
      .replace(/\{\{plan\}\}/g, sub.plan.name)
      .replace(/\{\{dias\}\}/g, String(days))
      .replace(/\{\{fecha\}\}/g, dateStr)
    const body = template.body
      .replace(/\{\{gimnasio\}\}/g, sub.gym.name)
      .replace(/\{\{plan\}\}/g, sub.plan.name)
      .replace(/\{\{dias\}\}/g, String(days))
      .replace(/\{\{fecha\}\}/g, dateStr)

    try {
      await sendBulkToGyms({ subject, body })
      sent++
      logger.info(`[Cron] Aviso suscripción enviado a ${sub.gym.ownerEmail} (vence ${dateStr})`)
    } catch (err) {
      logger.error({ err }, `[Cron] Error notificando suscripción a ${sub.gym.name}`)
    }
  }
  logger.info(`[Cron] Avisos de suscripción enviados: ${sent}`)
}

/**
 * Expira reservas PENDING_CONFIRM cuyo plazo venció.
 * Promueve al siguiente en lista de espera. Corre cada minuto.
 */
async function runPendingConfirmExpiryJob() {
  const now = new Date()
  const expired = await prisma.booking.findMany({
    where: { status: 'PENDING_CONFIRM', confirmDeadline: { lt: now } },
    include: {
      user: { select: { pushToken: true } },
      class: {
        select: {
          startsAt: true,
          gym: { select: { id: true, waitlistConfirmEnabled: true, waitlistConfirmMins: true } },
        },
      },
    },
  })

  for (const booking of expired) {
    // Cancelar la reserva expirada
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })
    if (booking.user.pushToken) {
      await sendPushNotification(
        booking.user.pushToken,
        'Lugar expirado',
        'No confirmaste a tiempo. Tu lugar fue cedido al siguiente en lista.',
        { type: 'PENDING_CONFIRM_EXPIRED', classId: booking.classId }
      )
    }

    // Promover al siguiente en waitlist
    const gym = booking.class.gym
    const next = await prisma.booking.findFirst({
      where: { classId: booking.classId, status: 'WAITLIST' },
      include: { user: { select: { pushToken: true } } },
      orderBy: { createdAt: 'asc' },
    })
    if (!next) continue

    const minsUntilClass = (booking.class.startsAt.getTime() - now.getTime()) / 60000
    const needsManualConfirm = gym.waitlistConfirmEnabled && minsUntilClass > gym.waitlistConfirmMins

    if (needsManualConfirm) {
      const confirmDeadline = new Date(now.getTime() + gym.waitlistConfirmMins * 60 * 1000)
      await prisma.booking.update({
        where: { id: next.id },
        data: { status: 'PENDING_CONFIRM', confirmDeadline },
      })
      if (next.user.pushToken) {
        await sendPushNotification(
          next.user.pushToken,
          '¡Hay un lugar disponible!',
          `Tienes ${gym.waitlistConfirmMins} minutos para confirmar tu asistencia.`,
          { type: 'WAITLIST_CONFIRM', classId: booking.classId }
        )
      }
    } else {
      await prisma.booking.update({ where: { id: next.id }, data: { status: 'CONFIRMED', confirmDeadline: null } })
      if (next.user.pushToken) {
        await sendPushNotification(
          next.user.pushToken,
          '¡Tienes un lugar!',
          'Pasaste de lista de espera a confirmado.',
          { type: 'WAITLIST_PROMOTED', classId: booking.classId }
        )
      }
    }
  }

  if (expired.length > 0) logger.info(`[Cron] ${expired.length} reserva(s) PENDING_CONFIRM expirada(s)`)
}

// Minutos antes del confirmDeadline en que se manda el recordatorio. Deliberadamente
// corto (más corto que waitlistConfirmMins, default 30, y que preClassConfirmHours,
// default 2h): tanto la promoción de waitlist como una reserva nueva PENDING_CONFIRM
// ya mandan su propio push al crearse — un lead time largo mandaría este recordatorio
// casi en simultáneo con ese primer push. No es configurable por gym por ahora.
const CONFIRM_REMINDER_LEAD_MINUTES = 10

/**
 * Recuerda confirmar a las reservas PENDING_CONFIRM (tanto promociones de waitlist
 * como reservas nuevas que esperan preClassConfirmHours) cuyo confirmDeadline está
 * por vencer — sin esto, el alumno solo se entera de que debe confirmar si abre la
 * app por su cuenta. confirmReminderSentAt evita mandarlo más de una vez por booking.
 */
export async function runPendingConfirmReminderJob() {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + CONFIRM_REMINDER_LEAD_MINUTES * 60 * 1000)

  const due = await prisma.booking.findMany({
    where: {
      status: 'PENDING_CONFIRM',
      confirmReminderSentAt: null,
      confirmDeadline: { gt: now, lte: windowEnd },
    },
    include: {
      user: { select: { pushToken: true } },
      class: { select: { classType: { select: { name: true } } } },
    },
  })

  for (const booking of due) {
    if (booking.user.pushToken) {
      const minsLeft = Math.max(1, Math.round((booking.confirmDeadline!.getTime() - now.getTime()) / 60000))
      await sendPushNotification(
        booking.user.pushToken,
        '⏱ Confirmá tu lugar',
        `Te quedan ${minsLeft} min para confirmar tu reserva de ${booking.class.classType.name} o se libera el cupo.`,
        { type: 'PRECLASS_CONFIRM_REMINDER', classId: booking.classId }
      )
    }
    await prisma.booking.update({ where: { id: booking.id }, data: { confirmReminderSentAt: now } })
  }

  if (due.length > 0) logger.info(`[Cron] ${due.length} recordatorio(s) de confirmación enviado(s)`)
}

/**
 * Intenta cobrar auto-renovaciones de membresías pendientes.
 * Corre a las 7:00 AM diario.
 */
async function runAutoRenewJob() {
  logger.info('[Cron] Revisando auto-renovaciones...')
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000) // próxima hora

  const memberships = await prisma.membership.findMany({
    where: {
      autoRenew: true,
      autoRenewConsent: true,
      status: 'ACTIVE',
      stripePaymentMethodId: { not: null },
      nextAutoRenewAt: { lte: windowEnd },
    },
    include: {
      plan: { select: { autoRenewMaxRetries: true } },
      user: { select: { pushToken: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const m of memberships) {
    const maxRetries = m.plan.autoRenewMaxRetries ?? 2
    if (m.autoRenewFailures >= maxRetries) {
      // Max retries reached — disable auto-renewal
      await prisma.membership.update({ where: { id: m.id }, data: { autoRenew: false } })
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          'Auto-renovación desactivada',
          `No pudimos procesar el pago de tu membresía tras ${maxRetries} intentos.`,
          { type: 'AUTO_RENEW_FAILED' }
        )
      }
      continue
    }

    try {
      await chargeAutoRenewMembership(m)
      logger.info(`[Cron] Auto-renovación exitosa: membership ${m.id}`)
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          '✅ Membresía renovada',
          'Tu membresía se renovó automáticamente.',
          { type: 'AUTO_RENEW_SUCCESS' }
        )
      }
    } catch (err: any) {
      logger.error({ err }, `[Cron] Auto-renovación fallida membership ${m.id}`)
      await prisma.membership.update({
        where: { id: m.id },
        data: { autoRenewFailures: { increment: 1 } },
      })
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          'Error en auto-renovación',
          'No pudimos procesar el pago. Revisaremos nuevamente pronto.',
          { type: 'AUTO_RENEW_ERROR' }
        )
      }
    }
  }

  if (memberships.length > 0) logger.info(`[Cron] ${memberships.length} auto-renovacion(es) procesada(s)`)
}

/**
 * Pasa a EXPIRED las membresías ACTIVE/TRIAL cuyo endsAt ya pasó.
 *
 * bookClass/assignUserToClass/confirmBooking nunca dependieron de este status para
 * bloquear reservas — siempre revalidan `endsAt >= now` directo, así que esto no es
 * una pieza de seguridad. Es higiene de datos: sin este job, una membresía vencida
 * se queda con status ACTIVE para siempre (nada lo cambiaba — auditoría de reglas
 * de negocio, 2026-10-15), y cualquier reporte o listado que filtre por
 * `status: 'ACTIVE'` sin mirar `endsAt` la muestra como vigente cuando no lo está.
 */
export async function runMembershipExpiryStatusJob() {
  const { count } = await prisma.membership.updateMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] }, endsAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  })
  if (count > 0) logger.info(`[Cron] ${count} membresía(s) pasada(s) a EXPIRED`)
}

/**
 * Insignia de constancia semestral: al cierre de cada semestre (1 ene / 1 jul),
 * calcula y otorga a cada MEMBER que cargó el 100% de sus resultados de WOD
 * en las clases a las que asistió. Idempotente: el @@unique([userId, periodStart])
 * de ConsistencyBadge hace que una corrida repetida sea un no-op seguro.
 */
export async function runConsistencyBadgeJob() {
  logger.info('[Cron] Calculando insignias de constancia semestral...')
  const gyms = await prisma.gym.findMany({ where: { status: 'ACTIVE' }, select: { id: true, timezone: true } })
  const now = new Date()
  // Al correr el 1/1 se cierra el 2do semestre del año anterior; al correr el 1/7, el 1ro de este año.
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()

  for (const gym of gyms) {
    const tz = gym.timezone || DEFAULT_GYM_TIMEZONE
    const windows = semesterWindowsForYear(year, tz)
    const window = now.getUTCMonth() === 0 ? windows[1] : windows[0]
    try {
      const awarded = await awardConsistencyBadgesForGym(gym.id, window)
      if (awarded > 0) logger.info(`[Cron] ${awarded} insignia(s) de constancia otorgada(s) en gym ${gym.id}`)
    } catch (err) {
      logger.error({ err }, `[Cron] Error calculando constancia para gym ${gym.id}`)
    }
  }
}

export function startCronJobs() {
  // Expirar PENDING_CONFIRM — cada minuto
  cron.schedule('* * * * *', async () => {
    try { await runPendingConfirmExpiryJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en job de confirmación waitlist') }
  })

  // Auto-asistencia — cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try { await runAutoAttendanceJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en auto-asistencia') }
  })

  // Recordatorio de confirmación próxima a vencer — cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try { await runPendingConfirmReminderJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en recordatorio de confirmación') }
  })

  // Auto-suspender gyms vencidos — cada hora
  cron.schedule('0 * * * *', async () => {
    try { await runGymAutoSuspendJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en job de auto-suspensión') }
  })

  // Pasar membresías vencidas a EXPIRED — cada hora
  cron.schedule('0 * * * *', async () => {
    try { await runMembershipExpiryStatusJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en job de expiración de membresías') }
  })

  // Aviso de membresías de miembros — 9:00 AM diario
  cron.schedule('0 9 * * *', async () => {
    try { await runMemberExpiryJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en job de membresías') }
  })

  // Aviso de suscripción FitApp a gimnasios — 8:00 AM diario
  cron.schedule('0 8 * * *', async () => {
    try { await runSubscriptionExpiryJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en job de suscripciones') }
  })

  // Auto-renovaciones Stripe — 7:00 AM diario
  cron.schedule('0 7 * * *', async () => {
    try { await runAutoRenewJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en auto-renovaciones') }
  })

  // Insignia de constancia semestral — 00:05 los días 1 de enero y 1 de julio
  cron.schedule('5 0 1 1,7 *', async () => {
    try { await runConsistencyBadgeJob() }
    catch (err) { logger.error({ err }, '[Cron] Error en job de constancia semestral') }
  })

  logger.info('[Cron] Jobs iniciados — pendingConfirm cada min · auto-asistencia 5min · recordatorio confirmación 5min · auto-suspend horario · expiración membresías horario · membresías 9:00 AM · suscripciones 8:00 AM · auto-renovación 7:00 AM · constancia semestral 1/1 y 1/7')
}
