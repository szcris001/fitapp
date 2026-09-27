/**
 * rls.integration.test.ts
 *
 * Row Level Security de verdad (migración 20260927010000_rls_enforced):
 * la app se conecta como fitapp_app (sin superusuario ni BYPASSRLS) y cada
 * conexión recibe el contexto del request (lib/prisma.ts → TenantAwarePool).
 * Estas queries NO filtran por gymId a propósito: RLS debe hacerlo.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import pg from 'pg'
import { prisma } from '../prisma'
import { runWithTenantContext, TenantContext } from '../tenant-context'
import { registerTenantContext } from '../tenant-hook'

const SLUGS = ['qa-rls-gym-a', 'qa-rls-gym-b']
const ids = { gymA: '', gymB: '', userA: '', userB: '', planA: '', planB: '', membershipB: '', officialBenchmark: '' }

const asGym = (gymId: string, userId: string | null = null): TenantContext => ({ gymId, userId, bypassRls: false })
// Las queries de Prisma son perezosas: se ejecutan al hacer await, así que el await
// tiene que ocurrir dentro del contexto (como en un handler de Fastify)
const inCtx = <T>(ctx: TenantContext, fn: () => PromiseLike<T>) => runWithTenantContext(ctx, async () => await fn())

async function cleanup() {
  const gyms = await prisma.gym.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })
  const gymIds = gyms.map(g => g.id)
  await prisma.membership.deleteMany({ where: { user: { gymId: { in: gymIds } } } })
  await prisma.plan.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.user.deleteMany({ where: { gymId: { in: gymIds } } })
  await prisma.benchmark.deleteMany({ where: { nombre: 'QA RLS Oficial' } })
  await prisma.gym.deleteMany({ where: { id: { in: gymIds } } })
}

beforeAll(async () => {
  // Sin contexto = sistema (bypass): los fixtures pueden crear en ambos gyms
  await cleanup()
  ids.gymA = (await prisma.gym.create({ data: { name: 'QA RLS A', slug: SLUGS[0], status: 'ACTIVE' } })).id
  ids.gymB = (await prisma.gym.create({ data: { name: 'QA RLS B', slug: SLUGS[1], status: 'ACTIVE' } })).id
  ids.userA = (await prisma.user.create({ data: { gymId: ids.gymA, name: 'A', email: 'qa-rls-a@test.local', passwordHash: 'x', role: 'ADMIN' } })).id
  ids.userB = (await prisma.user.create({ data: { gymId: ids.gymB, name: 'B', email: 'qa-rls-b@test.local', passwordHash: 'x', role: 'MEMBER' } })).id
  ids.planA = (await prisma.plan.create({ data: { gymId: ids.gymA, name: 'Plan A', priceCents: 100, durationDays: 30 } })).id
  ids.planB = (await prisma.plan.create({ data: { gymId: ids.gymB, name: 'Plan B', priceCents: 100, durationDays: 30 } })).id
  ids.membershipB = (await prisma.membership.create({
    data: { userId: ids.userB, planId: ids.planB, status: 'ACTIVE', startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), pricePaid: 100, currency: 'CLP' },
  })).id
  ids.officialBenchmark = (await prisma.benchmark.create({
    // isOfficial false: solo importa gymId null, y no interfiere con el conteo de seedBenchmarks
    data: { nombre: 'QA RLS Oficial', categoria: 'GIRL', formato: 'For time', isOfficial: false },
  })).id
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('RLS — lectura', () => {
  it('el rol de la app no es superusuario ni tiene BYPASSRLS', async () => {
    const [row] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    expect(row).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it('findMany sin filtro de gym solo devuelve filas del gym del contexto', async () => {
    const plans = await inCtx(asGym(ids.gymA), () => prisma.plan.findMany({ where: { id: { in: [ids.planA, ids.planB] } } }))
    expect(plans.map(p => p.id)).toEqual([ids.planA])
  })

  it('findUnique de una fila de otro gym → null', async () => {
    const user = await inCtx(asGym(ids.gymA), () => prisma.user.findUnique({ where: { id: ids.userB } }))
    expect(user).toBeNull()
  })

  it('tablas hijas: membresía de un usuario de otro gym no es visible', async () => {
    const m = await inCtx(asGym(ids.gymA), () => prisma.membership.findUnique({ where: { id: ids.membershipB } }))
    expect(m).toBeNull()
  })

  it('su propia fila de User es visible aunque el contexto sea otra sede (switch-sede)', async () => {
    const me = await inCtx(asGym(ids.gymB, ids.userA), () => prisma.user.findUnique({ where: { id: ids.userA } }))
    expect(me?.id).toBe(ids.userA)
  })

  it('benchmarks oficiales (gymId null) son visibles para cualquier gym', async () => {
    const b = await inCtx(asGym(ids.gymA), () => prisma.benchmark.findUnique({ where: { id: ids.officialBenchmark } }))
    expect(b?.id).toBe(ids.officialBenchmark)
  })

  it('sin contexto (sistema) se ven ambos gyms', async () => {
    const plans = await prisma.plan.findMany({ where: { id: { in: [ids.planA, ids.planB] } } })
    expect(plans).toHaveLength(2)
  })
})

describe('RLS — escritura', () => {
  it('updateMany sobre filas de otro gym no afecta nada', async () => {
    const res = await inCtx(asGym(ids.gymA), () => prisma.plan.updateMany({ where: { id: ids.planB }, data: { name: 'hackeado' } }))
    expect(res.count).toBe(0)
    expect((await prisma.plan.findUnique({ where: { id: ids.planB } }))?.name).toBe('Plan B')
  })

  it('crear una fila con gymId de otro gym → rechazado por WITH CHECK', async () => {
    await expect(
      inCtx(asGym(ids.gymA), () => prisma.plan.create({ data: { gymId: ids.gymB, name: 'intruso', priceCents: 1, durationDays: 30 } })),
    ).rejects.toThrow()
  })

  it('transacción interactiva dentro del contexto funciona y respeta RLS', async () => {
    const result = await inCtx(asGym(ids.gymA), () => prisma.$transaction(async (tx) => {
      const created = await tx.plan.create({ data: { gymId: ids.gymA, name: 'tx plan', priceCents: 1, durationDays: 30 } })
      const visible = await tx.plan.findMany({ where: { id: { in: [created.id, ids.planB] } } })
      await tx.plan.delete({ where: { id: created.id } })
      return visible.map(p => p.id)
    }))
    expect(result).toHaveLength(1)
  })

  it('findUnique dentro de una transacción ve lo que la misma tx creó (sin confirmar)', async () => {
    const found = await prisma.$transaction(async (tx) => {
      const created = await tx.plan.create({ data: { gymId: ids.gymA, name: 'tx unique', priceCents: 1, durationDays: 30 } })
      const again = await tx.plan.findUnique({ where: { id: created.id } })
      await tx.plan.delete({ where: { id: created.id } })
      return again?.id === created.id
    })
    expect(found).toBe(true)
  })

  it('transacción en lote dentro del contexto funciona', async () => {
    const [a, b] = await inCtx(asGym(ids.gymA), () => prisma.$transaction([
      prisma.plan.count({ where: { id: ids.planA } }),
      prisma.plan.count({ where: { id: ids.planB } }),
    ]))
    expect([a, b]).toEqual([1, 0])
  })
})

describe('RLS — concurrencia y conexiones', () => {
  it('findUnique concurrentes de distintos gyms no se mezclan', async () => {
    const [fromA, fromB] = await Promise.all([
      inCtx(asGym(ids.gymA), () => prisma.user.findUnique({ where: { id: ids.userB } })),
      inCtx(asGym(ids.gymB), () => prisma.user.findUnique({ where: { id: ids.userB } })),
    ])
    expect(fromA).toBeNull()
    expect(fromB?.id).toBe(ids.userB)
  })

  it('muchas queries intercaladas de dos gyms nunca ven filas ajenas', async () => {
    const runs = Array.from({ length: 40 }, (_, i) => {
      const gym = i % 2 ? ids.gymA : ids.gymB
      return inCtx(asGym(gym), async () => {
        const plans = await prisma.plan.findMany({ where: { id: { in: [ids.planA, ids.planB] } } })
        return plans.every(p => p.gymId === gym) && plans.length === 1
      })
    })
    expect((await Promise.all(runs)).every(Boolean)).toBe(true)
  })

  it('una conexión directa como fitapp_app sin contexto no ve ninguna fila', async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const { rows } = await client.query('SELECT count(*)::int AS n FROM "Plan" WHERE id = ANY($1)', [[ids.planA, ids.planB]])
    await client.end()
    expect(rows[0].n).toBe(0)
  })
})

describe('passwordHash omitido globalmente', () => {
  it('no aparece en queries directas ni en relaciones incluidas', async () => {
    const direct = await prisma.user.findUnique({ where: { id: ids.userB } })
    const nested = await prisma.membership.findUnique({ where: { id: ids.membershipB }, include: { user: true } })
    expect(direct).not.toHaveProperty('passwordHash')
    expect(nested!.user).not.toHaveProperty('passwordHash')
  })

  it('solo aparece si la query lo pide explícitamente', async () => {
    const withHash = await prisma.user.findUnique({ where: { id: ids.userB }, omit: { passwordHash: false } })
    expect(withHash!.passwordHash).toBe('x')
  })
})

describe('RLS — requests HTTP', () => {
  it('un request con JWT del gym A solo ve datos del gym A aunque la ruta no filtre', async () => {
    const app = Fastify({ logger: false })
    await app.register(jwt, { secret: 'test-secret' })
    registerTenantContext(app)
    app.get('/api/plans-sin-filtro', async () =>
      prisma.plan.findMany({ where: { id: { in: [ids.planA, ids.planB] } }, select: { id: true } }))
    await app.ready()
    const token = app.jwt.sign({ userId: ids.userA, gymId: ids.gymA, role: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/plans-sin-filtro', headers: { authorization: `Bearer ${token}` } })
    const anon = await app.inject({ method: 'GET', url: '/api/plans-sin-filtro' })
    await app.close()
    expect(res.json()).toEqual([{ id: ids.planA }])
    expect(anon.json()).toHaveLength(2) // sin JWT = contexto de sistema
  })
})
