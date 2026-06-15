import cron from 'node-cron'
import { prisma } from './prisma'
import { sendExpiryReminder, sendBulkToGyms } from './email'
import { sendPushNotification } from './push'
import { chargeAutoRenewMembership } from '../modules/payments/payments.service'

/**
 * Aviso diario a las 9:00 AM: membresías de miembros por vencer.
 */
async function runMemberExpiryJob() {
  console.log('[Cron] Revisando membresías por vencer...')
  const gyms = await prisma.gym.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, expiryReminderDays: true },
  })

  for (const gym of gyms) {
    const days = gym.expiryReminderDays ?? 3
    if (days <= 0) continue

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + days)
    const start = new Date(targetDate); start.setHours(0, 0, 0, 0)
    const end   = new Date(targetDate); end.setHours(23, 59, 59, 999)

    const memberships = await prisma.membership.findMany({
      where: {
        user: { gymId: gym.id },
        status: 'ACTIVE',
        endsAt: { gte: start, lte: end },
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
        console.log(`[Cron] Aviso enviado a ${m.user.email} (vence en ${days}d)`)
      } catch (err) {
        console.error(`[Cron] Error enviando aviso a ${m.user.email}:`, err)
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

/**
 * Marca automáticamente como ATTENDED las reservas CONFIRMED de clases ya iniciadas
 * en gyms con attendanceMode = 'auto'. Corre cada 5 minutos.
 */
async function runAutoAttendanceJob() {
  const now = new Date()
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
          startsAt: { lte: now },
        },
      },
      data: { status: 'ATTENDED' },
    })
    if (updated.count > 0) {
      console.log(`[Cron] Auto-asistencia gym ${gym.id}: ${updated.count} reservas marcadas`)
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
    console.log(`[Cron] Gym suspendido por vencimiento: ${sub.gym.name} (sub ${sub.id})`)
  }

  if (expired.length) console.log(`[Cron] ${expired.length} gym(s) suspendido(s)`)
}

/**
 * Aviso diario a las 8:00 AM: suscripción FitApp de gimnasios por vencer.
 */
async function runSubscriptionExpiryJob() {
  console.log('[Cron] Revisando suscripciones FitApp por vencer...')

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
      console.log(`[Cron] Aviso suscripción enviado a ${sub.gym.ownerEmail} (vence ${dateStr})`)
    } catch (err) {
      console.error(`[Cron] Error notificando suscripción a ${sub.gym.name}:`, err)
    }
  }
  console.log(`[Cron] Avisos de suscripción enviados: ${sent}`)
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

  if (expired.length > 0) console.log(`[Cron] ${expired.length} reserva(s) PENDING_CONFIRM expirada(s)`)
}

/**
 * Intenta cobrar auto-renovaciones de membresías pendientes.
 * Corre a las 7:00 AM diario.
 */
async function runAutoRenewJob() {
  console.log('[Cron] Revisando auto-renovaciones...')
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
      console.log(`[Cron] Auto-renovación exitosa: membership ${m.id}`)
      if (m.user.pushToken) {
        await sendPushNotification(
          m.user.pushToken,
          '✅ Membresía renovada',
          'Tu membresía se renovó automáticamente.',
          { type: 'AUTO_RENEW_SUCCESS' }
        )
      }
    } catch (err: any) {
      console.error(`[Cron] Auto-renovación fallida membership ${m.id}:`, err.message)
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

  if (memberships.length > 0) console.log(`[Cron] ${memberships.length} auto-renovacion(es) procesada(s)`)
}

export function startCronJobs() {
  // Expirar PENDING_CONFIRM — cada minuto
  cron.schedule('* * * * *', async () => {
    try { await runPendingConfirmExpiryJob() }
    catch (err) { console.error('[Cron] Error en job de confirmación waitlist:', err) }
  })

  // Auto-asistencia — cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try { await runAutoAttendanceJob() }
    catch (err) { console.error('[Cron] Error en auto-asistencia:', err) }
  })

  // Auto-suspender gyms vencidos — cada hora
  cron.schedule('0 * * * *', async () => {
    try { await runGymAutoSuspendJob() }
    catch (err) { console.error('[Cron] Error en job de auto-suspensión:', err) }
  })

  // Aviso de membresías de miembros — 9:00 AM diario
  cron.schedule('0 9 * * *', async () => {
    try { await runMemberExpiryJob() }
    catch (err) { console.error('[Cron] Error en job de membresías:', err) }
  })

  // Aviso de suscripción FitApp a gimnasios — 8:00 AM diario
  cron.schedule('0 8 * * *', async () => {
    try { await runSubscriptionExpiryJob() }
    catch (err) { console.error('[Cron] Error en job de suscripciones:', err) }
  })

  // Auto-renovaciones Stripe — 7:00 AM diario
  cron.schedule('0 7 * * *', async () => {
    try { await runAutoRenewJob() }
    catch (err) { console.error('[Cron] Error en auto-renovaciones:', err) }
  })

  console.log('[Cron] Jobs iniciados — pendingConfirm cada min · auto-asistencia 5min · auto-suspend horario · membresías 9:00 AM · suscripciones 8:00 AM · auto-renovación 7:00 AM')
}
