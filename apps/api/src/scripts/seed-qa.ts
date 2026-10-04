/**
 * Entorno QA reproducible: borra y recrea los gyms de qa/fixtures.json con datos
 * pensados para probar cada módulo (suite Playwright y agentes exploradores).
 *
 *   cd apps/api && pnpm seed:qa
 *
 * Usa DATABASE_ADMIN_URL (tarea de administración, fuera de RLS). Solo toca los gyms
 * cuyo slug empieza con "qa-"; se niega a correr con NODE_ENV=production.
 *
 * Las fechas son relativas a "hoy" en la zona del gym, así los datos sirven el día
 * que se corra: clases de -7 a +3 días (07:00, 19:00 y 21:00 local), WOD de ayer,
 * hoy y mañana, un alumno en riesgo, una transferencia pendiente y movimientos
 * bancarios para conciliar.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type UserRole } from '../generated/prisma'
import { gymLocalDate, startOfGymDay, DEFAULT_GYM_TIMEZONE } from '../lib/gym-day'

type FixtureUser = { name: string; email: string; role: UserRole; gender?: string; rut?: string }
type FixtureGym = {
  name: string
  slug: string
  users: Record<string, FixtureUser>
  plans: Record<string, { name: string; priceCents: number }>
}
type Fixtures = { password: string; superadmin: FixtureUser; gyms: Record<string, FixtureGym> }

const FIXTURES_PATH = path.resolve(__dirname, '../../../../qa/fixtures.json')
const fixtures: Fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8'))

const TZ = DEFAULT_GYM_TIMEZONE
const DAY_MS = 86_400_000

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: (process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL)! }),
})

// ─── Fechas en la zona del gym ────────────────────────────────────────────────

function localDay(offsetDays: number): string {
  const today = gymLocalDate(new Date(), TZ)
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10)
}

/** Instante de la hora local `hour` del día a `offsetDays` de hoy */
function atLocalHour(offsetDays: number, hour: number): Date {
  const day = localDay(offsetDays)
  const start = startOfGymDay(day, TZ)
  // Suma horas y corrige si el día tuvo cambio de horario antes de esa hora
  const guess = new Date(start.getTime() + hour * 3_600_000)
  const actualHour = Number(guess.toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }))
  return new Date(guess.getTime() + (hour - actualHour) * 3_600_000)
}

const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS)

// Días atrás sin cruzar al mes anterior (gym-local vía Date local del proceso):
// usado para el pago de Mara, que /gyms/me/stats cuenta como "ingresos del mes" solo si
// cae en el mes calendario actual. Sin este clamp, corrido el día 1-4 del mes el pago
// "de hace 5 días" caía en el mes anterior y el KPI daba 0.
const daysAgoThisMonth = (maxDaysAgo: number) => -Math.min(maxDaysAgo, new Date().getDate() - 1)

// ─── Limpieza ─────────────────────────────────────────────────────────────────

async function wipeQaGyms() {
  const gyms = await prisma.gym.findMany({ where: { slug: { startsWith: 'qa-' } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  if (gymIds.length === 0) return
  const users = await prisma.user.findMany({ where: { gymId: { in: gymIds } }, select: { id: true } })
  const userIds = users.map(u => u.id)
  const byGym = { where: { gymId: { in: gymIds } } }
  const byUser = { where: { userId: { in: userIds } } }

  await prisma.bankMovement.deleteMany(byGym)
  await prisma.fintocLink.deleteMany(byGym)
  await prisma.fintocPaymentIntent.deleteMany(byGym)
  await prisma.paymentCheckout.deleteMany(byGym)
  await prisma.wodResult.deleteMany(byGym)
  await prisma.benchmarkResult.deleteMany(byGym)
  await prisma.benchmark.deleteMany(byGym)
  await prisma.gymnasticProgress.deleteMany(byUser)
  await prisma.rmRecord.deleteMany(byUser)
  await prisma.booking.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { class: { gymId: { in: gymIds } } }] } })
  await prisma.membership.deleteMany(byUser)
  await prisma.wod.deleteMany(byGym)
  await prisma.class.deleteMany(byGym)
  await prisma.classType.deleteMany(byGym)
  await prisma.plan.deleteMany(byGym)
  await prisma.gymSkill.deleteMany(byGym)
  await prisma.gymSubscriptionPayment.deleteMany(byGym)
  await prisma.gymSubscription.deleteMany(byGym)
  await prisma.user.deleteMany(byGym)
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

async function upsertSuperadmin(passwordHash: string) {
  const sa = fixtures.superadmin
  const existing = await prisma.user.findFirst({ where: { email: sa.email, role: 'SUPER_ADMIN' } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, gymId: null, mustChangePassword: false } })
  } else {
    await prisma.user.create({ data: { name: sa.name, email: sa.email, role: 'SUPER_ADMIN', passwordHash } })
  }
}

// ─── Creación ─────────────────────────────────────────────────────────────────

async function createGym(fx: FixtureGym, passwordHash: string) {
  const gym = await prisma.gym.create({
    data: {
      name: fx.name,
      slug: fx.slug,
      email: `contacto@${fx.slug}.test`,
      ownerEmail: Object.values(fx.users).find(u => u.role === 'ADMIN')?.email,
      timezone: TZ,
      status: 'ACTIVE',
      bookingWindowDays: 3,
      // La clave es ownerName (ver gyms.schema.ts bankAccount) — web (dashboard/settings) y
      // mobile (PlanesScreen) la leen así; "holder" no es un campo real, queda silenciosamente
      // sin mostrarse en ningún lado.
      bankAccount: { bank: 'Banco QA', accountType: 'Cuenta Corriente', accountNumber: '000123456', rut: '76000000-0', ownerName: fx.name },
    },
  })

  const users: Record<string, { id: string }> = {}
  for (const [key, u] of Object.entries(fx.users)) {
    users[key] = await prisma.user.create({
      data: { gymId: gym.id, name: u.name, email: u.email, role: u.role, gender: u.gender, rut: u.rut, passwordHash },
      select: { id: true },
    })
  }

  const plans: Record<string, { id: string; priceCents: number }> = {}
  for (const [key, p] of Object.entries(fx.plans)) {
    plans[key] = await prisma.plan.create({
      data: { gymId: gym.id, name: p.name, priceCents: p.priceCents, currency: 'CLP', durationDays: 30 },
      select: { id: true, priceCents: true },
    })
  }

  const crossfit = await prisma.classType.create({
    data: { gymId: gym.id, name: 'CrossFit', color: '#6366f1', discipline: 'crossfit' },
  })
  const halte = await prisma.classType.create({
    data: { gymId: gym.id, name: 'Halterofilia', color: '#f59e0b', discipline: 'weightlifting' },
  })

  const coachId = (users.coach ?? users.admin).id
  const classes: Record<string, { id: string }> = {}
  for (let d = -7; d <= 3; d++) {
    for (const hour of [7, 19, 21]) {
      classes[`${d}@${hour}`] = await prisma.class.create({
        data: {
          gymId: gym.id, classTypeId: crossfit.id, coachId, capacity: 12,
          startsAt: atLocalHour(d, hour), endsAt: atLocalHour(d, hour + 1),
        },
        select: { id: true },
      })
    }
    if (d % 2 === 0) {
      await prisma.class.create({
        data: {
          gymId: gym.id, classTypeId: halte.id, coachId, capacity: 8,
          startsAt: atLocalHour(d, 18), endsAt: atLocalHour(d, 19),
        },
      })
    }
  }

  // WOD de CrossFit ayer, hoy y mañana (Halterofilia sin WOD: caso "sin planificación")
  const wodTitles: Record<number, string> = { [-1]: 'QA WOD Ayer', 0: 'QA WOD Hoy', 1: 'QA WOD Mañana' }
  for (const [offset, title] of Object.entries(wodTitles)) {
    await prisma.wod.create({
      data: {
        gymId: gym.id, classTypeId: crossfit.id, title,
        date: startOfGymDay(localDay(Number(offset)), TZ),
        scoreType: Number(offset) === 0 ? 'TIME' : 'REPS',
        blocks: {
          create: [
            {
              title: 'Fuerza', scheme: '5x5', order: 0,
              movements: { create: [{ movementName: 'Back Squat', sets: 5, reps: 5, percentage: 75, order: 0 }] },
            },
            {
              title: 'Metcon', scheme: 'For Time', timecap: '12 min', order: 1,
              movements: {
                create: [
                  { movementName: 'Thruster', repScheme: '21-15-9', weightRxM: 43, weightRxF: 29, weightScaleM: 30, weightScaleF: 20, order: 0 },
                  { movementName: 'Pull-up', repScheme: '21-15-9', scaledMovement: 'Ring rows', order: 1 },
                ],
              },
            },
          ],
        },
      },
    })
  }

  await prisma.gymSkill.create({
    data: {
      gymId: gym.id, name: 'Muscle-up', order: 0,
      milestones: { create: [
        { name: 'Pull-up estricto', order: 0 },
        { name: 'Chest to bar', order: 1 },
        { name: 'Muscle-up', order: 2, requiresEvidence: true },
      ] },
    },
  })

  return { gym, users, plans, classes }
}

async function seedNorteScenarios(ctx: Awaited<ReturnType<typeof createGym>>) {
  const { gym, users, plans, classes } = ctx
  const mensual = plans.mensual

  // member: membresía activa pagada, asistencia la última semana, reserva mañana
  const paidOffset = daysAgoThisMonth(5)
  await prisma.membership.create({
    data: {
      userId: users.member.id, planId: mensual.id, status: 'ACTIVE',
      // endsAt queda fijo en +25 días (USR-04 espera "vence en ~25 días" con rango fijo);
      // solo el pago/inicio se ajusta para no cruzar al mes anterior (ver daysAgoThisMonth)
      startsAt: daysFromNow(paidOffset), endsAt: daysFromNow(25), paidAt: daysFromNow(paidOffset),
      pricePaid: mensual.priceCents, paymentMethod: 'manual',
    },
  })
  for (const d of [-6, -4, -2, -1]) {
    await prisma.booking.create({
      data: {
        userId: users.member.id, classId: classes[`${d}@19`].id,
        status: 'ATTENDED', attended: true, attendedAt: atLocalHour(d, 19), createdAt: atLocalHour(d - 1, 12),
      },
    })
  }
  await prisma.booking.create({ data: { userId: users.member.id, classId: classes['1@19'].id, status: 'CONFIRMED' } })
  await prisma.rmRecord.createMany({
    data: [
      { userId: users.member.id, movementName: 'Back Squat', weightKg: 100, recordedAt: daysFromNow(-30) },
      { userId: users.member.id, movementName: 'Back Squat', weightKg: 105, recordedAt: daysFromNow(-3) },
      { userId: users.member.id, movementName: 'Deadlift', weightKg: 130, recordedAt: daysFromNow(-10) },
      { userId: users.member.id, movementName: 'Thruster', weightKg: 60, recordedAt: daysFromNow(-12) },
    ],
  })
  await prisma.gymnasticProgress.create({
    data: { userId: users.member.id, skillName: 'Muscle-up', milestone: 'Pull-up estricto', achievedAt: daysFromNow(-8) },
  })

  // member2: activo, vence en 2 días y sin reservas hace 20 días → en riesgo y por vencer
  await prisma.membership.create({
    data: {
      userId: users.member2.id, planId: mensual.id, status: 'ACTIVE',
      startsAt: daysFromNow(-28), endsAt: daysFromNow(2), paidAt: daysFromNow(-28),
      pricePaid: mensual.priceCents, paymentMethod: 'manual',
    },
  })
  await prisma.booking.create({
    data: {
      userId: users.member2.id, classId: classes['-7@7'].id, status: 'ATTENDED', attended: true,
      attendedAt: atLocalHour(-7, 7), createdAt: daysFromNow(-20),
    },
  })

  // Transferencias pendientes de revisión (con comprobante): member3 para confirmar y
  // member5 para rechazar en Pagos; member4 la resuelve Conciliación (movimiento por RUT)
  const receiptsDir = path.resolve(process.cwd(), 'uploads', 'receipts')
  fs.mkdirSync(receiptsDir, { recursive: true })
  const pendingTransfer = async (userKey: string) => {
    const receiptFile = `qa-receipt-${userKey}.png`
    fs.writeFileSync(
      path.join(receiptsDir, receiptFile),
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
    )
    return prisma.membership.create({
      data: {
        userId: users[userKey].id, planId: mensual.id, status: 'INACTIVE',
        startsAt: new Date(), endsAt: daysFromNow(30),
        pricePaid: mensual.priceCents, paymentMethod: 'transfer',
        transferReceiptUrl: `/uploads/receipts/${receiptFile}`, transferStatus: 'PENDING_REVIEW',
      },
    })
  }
  await pendingTransfer('member3')
  await pendingTransfer('member5')
  const pending = await pendingTransfer('member4')

  // Conciliación: link Fintoc de prueba + movimientos (uno calza por RUT, otro sin match)
  const link = await prisma.fintocLink.create({
    data: {
      gymId: gym.id, linkToken: 'qa_link_token_no_real', accountId: 'qa_acc_001',
      accountNumber: '000123456', bankName: 'Banco QA', holderName: gym.name, holderRut: '76000000-0',
    },
  })
  await prisma.bankMovement.createMany({
    data: [
      {
        gymId: gym.id, fintocLinkId: link.id, fintocMovementId: `qa-mov-rut-${gym.id}`,
        amount: mensual.priceCents, postedAt: daysFromNow(-1), description: 'Transferencia Fernanda',
        senderRut: '44.444.444-4', senderName: 'Fernanda Fintoc',
        reconciliationStatus: 'MATCHED', membershipId: pending.id, matchConfidence: 'exact_rut',
      },
      {
        gymId: gym.id, fintocLinkId: link.id, fintocMovementId: `qa-mov-desconocido-${gym.id}`,
        amount: 12345, postedAt: daysFromNow(-2), description: 'Transferencia sin identificar',
        senderRut: '99.999.999-9', senderName: 'Desconocido',
      },
    ],
  })
}

async function seedSurScenarios(ctx: Awaited<ReturnType<typeof createGym>>) {
  const { users, plans, classes } = ctx
  await prisma.membership.create({
    data: {
      userId: users.member.id, planId: plans.mensual.id, status: 'ACTIVE',
      startsAt: daysFromNow(-1), endsAt: daysFromNow(29), paidAt: daysFromNow(-1),
      pricePaid: plans.mensual.priceCents, paymentMethod: 'manual',
    },
  })
  await prisma.booking.create({ data: { userId: users.member.id, classId: classes['1@7'].id, status: 'CONFIRMED' } })
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-qa no se corre en producción')

  const passwordHash = await bcrypt.hash(fixtures.password, 10)
  await wipeQaGyms()

  const norte = await createGym(fixtures.gyms.norte, passwordHash)
  await seedNorteScenarios(norte)
  const sur = await createGym(fixtures.gyms.sur, passwordHash)
  await seedSurScenarios(sur)
  await upsertSuperadmin(passwordHash)

  console.log('[seed-qa] listo')
  for (const fx of Object.values(fixtures.gyms)) {
    console.log(`  ${fx.name} (${fx.slug})`)
    for (const u of Object.values(fx.users)) console.log(`    ${u.role.padEnd(7)} ${u.email}`)
  }
  console.log(`  SUPER_ADMIN ${fixtures.superadmin.email} (login sin slug)`)
  console.log(`  contraseña de todos: ${fixtures.password}`)
}

main()
  .catch((err) => { console.error('[seed-qa] error:', err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
