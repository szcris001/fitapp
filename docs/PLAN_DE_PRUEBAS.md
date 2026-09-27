# Plan de Pruebas FitHub — Específico, no genérico

> Este documento traduce las 7 zonas de alto riesgo del proyecto en tests concretos. Es el insumo principal del **qa-engineer** para arrancar.

---

## Setup base (devops + qa-engineer, 1 día)

Antes de escribir un solo test, dejar la infraestructura lista:

### 1. Vitest configurado en `apps/api`

```ts
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/__tests__/**'],
    },
    pool: 'forks', // aislamiento entre suites de integración
  },
});
```

### 2. Postgres de test con docker-compose

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: fithub_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

### 3. Helper de DB para tests de integración

```ts
// apps/api/tests/setup.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

export async function resetDb() {
  // Truncar todas las tablas excepto _prisma_migrations y benchmarks oficiales
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables 
    WHERE schemaname='public' AND tablename != '_prisma_migrations'
  `;
  for (const { tablename } of tables) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE`
    );
  }
}

beforeAll(async () => {
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
});

afterEach(resetDb);

export { prisma };
```

### 4. Factories de datos de prueba

```ts
// apps/api/tests/factories/index.ts
import { prisma } from '../setup';

export async function createGym(overrides = {}) {
  return prisma.gym.create({
    data: {
      slug: `gym-${Date.now()}-${Math.random()}`,
      name: 'Test Gym',
      colorPrimary: '#000000',
      colorSecondary: '#FFFFFF',
      colorAccent: '#FF0000',
      bookingWindowDays: 7,
      ...overrides,
    },
  });
}

export async function createUser(gymId: string, overrides = {}) {
  return prisma.user.create({
    data: {
      gymId,
      email: `user-${Date.now()}@test.com`,
      role: 'ATHLETE',
      passwordHash: 'hashed',
      ...overrides,
    },
  });
}

// ... createClass, createPlan, createRM, etc.
```

---

## Zona de riesgo 1 — Cálculo de carga personalizada

**Sección**: 3.3.3 punto 4 del `requirements_v1_5.md`.
**Riesgo**: un atleta carga mal la barra. Lesión.
**Tipo de tests**: capa 1 (unit puros, sin DB).
**Estimación**: 1 día.
**Estado**: COMPLETADO 2026-04-30. 26 tests, 26/26 pasando. Ver `apps/api/src/modules/wod/__tests__/calculateLoad.test.ts`.

### Función bajo prueba

```ts
// apps/api/src/modules/wods/load-calculator.ts
export type RoundingStep = 0.5 | 1 | 2.5;

export function calculateLoad(
  rmKg: number | null,
  percentage: number,
  rounding: RoundingStep = 2.5,
): number | null {
  if (rmKg === null) return null;
  if (percentage < 0 || percentage > 200) {
    throw new Error('Percentage out of range');
  }
  const raw = rmKg * (percentage / 100);
  return Math.round(raw / rounding) * rounding;
}
```

### Tests requeridos (15+ casos)

```ts
// apps/api/src/modules/wods/__tests__/load-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateLoad } from '../load-calculator';

describe('calculateLoad', () => {
  describe('casos felices', () => {
    it('100kg al 75% con redondeo 2.5kg → 75kg', () => {
      expect(calculateLoad(100, 75, 2.5)).toBe(75);
    });
    it('100kg al 50% → 50kg', () => {
      expect(calculateLoad(100, 50)).toBe(50);
    });
    it('100kg al 0% → 0kg (warmup)', () => {
      expect(calculateLoad(100, 0)).toBe(0);
    });
    it('100kg al 100% → 100kg', () => {
      expect(calculateLoad(100, 100)).toBe(100);
    });
    it('100kg al 110% (sobre RM, válido en programación) → 110kg', () => {
      expect(calculateLoad(100, 110)).toBe(110);
    });
  });

  describe('redondeos', () => {
    it('redondeo 2.5kg: 100kg al 73% → 72.5kg', () => {
      expect(calculateLoad(100, 73, 2.5)).toBe(72.5);
    });
    it('redondeo 1kg: 100kg al 73% → 73kg', () => {
      expect(calculateLoad(100, 73, 1)).toBe(73);
    });
    it('redondeo 0.5kg: 100kg al 73% → 73kg', () => {
      expect(calculateLoad(100, 73, 0.5)).toBe(73);
    });
    it('redondeo 2.5kg: 50kg al 60% → 30kg (no 30.0 ni 32.5)', () => {
      expect(calculateLoad(50, 60, 2.5)).toBe(30);
    });
    it('redondeo 2.5kg: 87kg al 65% → 56.5? verificar: 56.55 round → 57.5 con paso 2.5', () => {
      // 87 * 0.65 = 56.55 → /2.5 = 22.62 → round = 23 → *2.5 = 57.5
      expect(calculateLoad(87, 65, 2.5)).toBe(57.5);
    });
  });

  describe('alumno sin RM', () => {
    it('rmKg null → devuelve null (frontend muestra placeholder)', () => {
      expect(calculateLoad(null, 75)).toBe(null);
    });
  });

  describe('valores de borde', () => {
    it('porcentaje negativo lanza error', () => {
      expect(() => calculateLoad(100, -10)).toThrow('out of range');
    });
    it('porcentaje > 200 lanza error', () => {
      expect(() => calculateLoad(100, 250)).toThrow('out of range');
    });
    it('rm 0 → 0 (atleta sin fuerza registrada)', () => {
      expect(calculateLoad(0, 75)).toBe(0);
    });
    it('porcentaje decimal 75.5%', () => {
      expect(calculateLoad(100, 75.5, 2.5)).toBe(75); // 75.5/2.5=30.2 → 30 → 75
    });
  });

  describe('precisión flotante', () => {
    it('no acumula errores de float (0.1 + 0.2 problema)', () => {
      // 33.333kg al 30%: 9.99999...kg, debe redondear correctamente
      expect(calculateLoad(33.333, 30, 0.5)).toBe(10);
    });
  });
});
```

### Criterio de ✅
17+ tests, todos pasan, cobertura 100% del archivo.

---

## Zona de riesgo 2 — Multi-tenancy

**Sección**: 8 del requirements (multi-sede backlog v2, pero aislamiento entre gyms es MVP).
**Riesgo**: el gym A puede leer/modificar datos del gym B. Catastrófico (fuga de datos personales, pagos, RMs).
**Tipo de tests**: capa 2 (integración con DB real).
**Estimación**: 2 días.

### Estrategia

Por cada entidad de negocio (Student, Class, Plan, Payment, RM, WodPlan, etc.), un test que:

1. Crea gym A y gym B.
2. Crea un User en cada uno.
3. Genera JWTs.
4. Hace request con JWT de A intentando acceder a recurso de B.
5. Verifica que la respuesta es 403 o 404 (NO 200 con datos).

### Ejemplo

```ts
// apps/api/src/modules/students/__tests__/tenancy.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { build } from '../../../app';
import { createGym, createUser } from '../../../tests/factories';
import { signToken } from '../../../tests/helpers/auth';

describe('Students - tenancy isolation', () => {
  let app: FastifyInstance;
  let gymA: Gym, gymB: Gym;
  let adminA: User, adminB: User;
  let studentInB: User;
  let tokenA: string;

  beforeEach(async () => {
    app = build();
    gymA = await createGym({ name: 'Gym A' });
    gymB = await createGym({ name: 'Gym B' });
    adminA = await createUser(gymA.id, { role: 'ADMIN' });
    adminB = await createUser(gymB.id, { role: 'ADMIN' });
    studentInB = await createUser(gymB.id, { role: 'ATHLETE' });
    tokenA = signToken(adminA);
  });

  it('GET /v1/students lista solo alumnos del gym A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/students',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.students.find((s: any) => s.id === studentInB.id)).toBeUndefined();
  });

  it('GET /v1/students/:id de gym B con token de A → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentInB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /v1/students/:id de gym B con token de A → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/students/${studentInB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(404);

    // Verificar que el dato no cambió
    const reloaded = await prisma.user.findUnique({ where: { id: studentInB.id } });
    expect(reloaded?.name).not.toBe('Hacked');
  });

  // Repetir para DELETE, y para query params manipulados (?gymId=B)
});
```

### Entidades a cubrir
Students, Classes, ClassTypes, Plans, Payments, RMs, GymnasticProgress, WodPlans, Benchmarks (custom del box, no los oficiales), PaymentTokens, Notifications.

### Criterio de ✅
1 suite por entidad, ~4 tests por suite (GET lista, GET id, PATCH, DELETE) = ~40 tests. Todos pasan.

---

## Zona de riesgo 3 — Pasarelas en sandbox

**Sección**: 3.4.2.
**Riesgo**: cobros fallidos, dobles cobros, webhooks ignorados.
**Tipo de tests**: capa 3 (sandbox real). Coordinado entre `payments-specialist` y `qa-engineer`.
**Estimación**: 2-3 días por pasarela. Empezar con Stripe.

### Variables de entorno necesarias (devops las configura)

```env
# .env.test.sandbox (NO commitear, va a 1Password o GitHub Secrets)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_TEST_CARD_APPROVE=4242424242424242
STRIPE_TEST_CARD_DECLINE=4000000000000002
```

### Test ilustrativo (Stripe)

```ts
// apps/api/src/modules/payments/__tests__/stripe.sandbox.test.ts
// Solo corre con FLAG_RUN_SANDBOX=true para no gastar requests en CI normal
import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';

const skipIfNotSandbox = process.env.FLAG_RUN_SANDBOX !== 'true' ? it.skip : it;

describe('Stripe sandbox - checklist completo', () => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  skipIfNotSandbox('1. Pago aprobado con tarjeta de prueba', async () => {
    // Crear PaymentIntent vía nuestro endpoint
    const intent = await callOurApi('POST', '/v1/payments/intent', {
      planId: testPlan.id,
      gateway: 'STRIPE',
    });

    // Confirmar con tarjeta de prueba (simulando lo que haría Stripe.js)
    const confirmed = await stripe.paymentIntents.confirm(intent.stripePaymentIntentId, {
      payment_method: 'pm_card_visa', // tarjeta de test que aprueba
    });

    expect(confirmed.status).toBe('succeeded');

    // Esperar webhook (con timeout)
    await waitForCondition(
      async () => (await getPayment(intent.paymentId)).status === 'APPROVED',
      { timeout: 10_000 },
    );
  });

  skipIfNotSandbox('2. Pago rechazado con tarjeta que rechaza', async () => {
    // Similar pero con pm_card_chargeDeclined
    // Esperar Payment.status === 'REJECTED'
  });

  skipIfNotSandbox('3. Webhook duplicado no genera doble update', async () => {
    // Mandar el mismo evento Stripe 2 veces a nuestro endpoint
    // Verificar que el segundo respondió 200 sin reprocesar
    // Verificar que solo hay 1 fila en WebhookEvent y 1 estado de Payment
  });

  skipIfNotSandbox('4. Webhook con firma inválida → 401', async () => {
    const res = await callOurApi(
      'POST',
      '/api/payments/webhook/stripe',
      validPayload,
      { 'stripe-signature': 'invalid_signature' },
    );
    expect(res.statusCode).toBe(401);
  });

  skipIfNotSandbox('5. Tokenización exitosa', async () => {
    // SetupIntent → guardar payment_method → verificar PaymentToken en DB
  });

  skipIfNotSandbox('6. Cobro contra token guardado funciona', async () => {
    // Crear Payment con saved payment_method → succeeded
  });

  skipIfNotSandbox('7. Cobro con token expirado falla con error claro', async () => {
    // Usar pm_card_chargeDeclinedExpiredCard
    // Verificar Payment.status === 'REJECTED' con error code claro
  });

  // 8, 9, 10: idempotencia avanzada, multi-tenancy del webhook, logs auditables
});
```

### Criterio de ✅ por pasarela
Los 10 puntos del checklist (8 si no tokeniza). Todos pasan en sandbox real.

---

## Zona de riesgo 4 — Conciliación bancaria (Fintoc)

**Sección**: 3.4.3 modalidad B.
**Riesgo**: confirmar pagos automáticamente que no corresponden, o no detectar pagos válidos.
**Tipo de tests**: capa 1 (matcher es lógica pura) + capa 2 (integración con webhook simulado).
**Estimación**: 1 día.

### Tests de matcher (puro)

```ts
// apps/api/src/modules/payments/reconciliation/__tests__/matcher.test.ts
import { matchTransfer } from '../matcher';

describe('matchTransfer', () => {
  it('match exacto por código de referencia + monto', () => {
    const transfer = { amountCents: 50000, description: 'FH-ALU123', currency: 'CLP' };
    const candidates = [
      { studentId: 's1', referenceCode: 'FH-ALU123', expectedAmountCents: 50000 },
      { studentId: 's2', referenceCode: 'FH-ALU456', expectedAmountCents: 50000 },
    ];
    const result = matchTransfer(transfer, candidates);
    expect(result).toEqual({ status: 'AUTO_MATCH', studentId: 's1' });
  });

  it('mismo monto con varios candidatos sin código → AMBIGUOUS', () => {
    const transfer = { amountCents: 50000, description: '', currency: 'CLP' };
    const candidates = [
      { studentId: 's1', referenceCode: 'FH-A', expectedAmountCents: 50000 },
      { studentId: 's2', referenceCode: 'FH-B', expectedAmountCents: 50000 },
    ];
    expect(matchTransfer(transfer, candidates)).toEqual({
      status: 'AMBIGUOUS',
      candidates: ['s1', 's2'],
    });
  });

  it('monto que no matchea ningún candidato → NO_MATCH', () => {
    expect(
      matchTransfer({ amountCents: 12345, description: '', currency: 'CLP' }, []),
    ).toEqual({ status: 'NO_MATCH' });
  });

  it('match parcial: monto correcto + RUT en descripción', () => {
    const transfer = { amountCents: 50000, description: 'Pago 12345678-9', currency: 'CLP' };
    const candidates = [
      { studentId: 's1', rut: '12345678-9', expectedAmountCents: 50000 },
      { studentId: 's2', rut: '99999999-9', expectedAmountCents: 50000 },
    ];
    expect(matchTransfer(transfer, candidates)).toEqual({
      status: 'AUTO_MATCH',
      studentId: 's1',
    });
  });
});
```

---

## Zona de riesgo 5 — Renovación automática

**Sección**: 3.4.4.
**Riesgo**: cobros duplicados, cobros a destiempo, no notificar al usuario.
**Tipo de tests**: capa 2 con time-travel (vi.useFakeTimers).
**Estimación**: 1.5 días.

### Test ilustrativo

```ts
// apps/api/src/modules/payments/jobs/__tests__/auto-renew.integration.test.ts
import { vi } from 'vitest';
import { runAutoRenewJob } from '../auto-renew.job';

describe('Auto-renew job', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cobra a alumno con plan que vence en N días', async () => {
    const gym = await createGym({});
    const plan = await createPlan(gym.id, {
      autoRenewEnabled: true,
      daysAheadToCharge: 3,
    });
    const student = await createUser(gym.id, {});
    const subscription = await createSubscription(student.id, plan.id, {
      expiresAt: addDays(new Date(), 3),
      autoRenew: true,
      paymentTokenId: 'pm_test_visa',
    });

    // Mock Stripe charge
    vi.spyOn(stripeGateway, 'chargeWithToken').mockResolvedValue({
      success: true,
      transactionId: 'pi_test_123',
    });

    await runAutoRenewJob();

    const payment = await prisma.payment.findFirst({
      where: { userId: student.id, type: 'AUTO_RENEW' },
    });
    expect(payment?.status).toBe('APPROVED');

    const reloaded = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(reloaded?.expiresAt).toEqual(addDays(subscription.expiresAt, plan.durationDays));
  });

  it('falla 1 vez, reintenta 24h después y aprueba', async () => {
    // ... setup
    vi.spyOn(stripeGateway, 'chargeWithToken')
      .mockResolvedValueOnce({ success: false, error: 'card_declined' })
      .mockResolvedValueOnce({ success: true, transactionId: 'pi_ok' });

    await runAutoRenewJob();
    // Verificar 1 PaymentAttempt fallido, plan aún no renovado

    vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24h
    await runAutoRenewJob();
    // Verificar 2 PaymentAttempts (1 fail + 1 ok), plan renovado
  });

  it('alumno con auto-renew desactivado: no se intenta cobro', async () => {
    // ... setup con autoRenew: false
    const charge = vi.spyOn(stripeGateway, 'chargeWithToken');
    await runAutoRenewJob();
    expect(charge).not.toHaveBeenCalled();
  });

  it('después de N reintentos fallidos: notifica admin, marca "próximo a vencer"', async () => {
    // mock siempre falla, avanzar tiempo, verificar notificación + estado
  });
});
```

---

## Zona de riesgo 6 — Importación Excel

**Sección**: 3.3.3.
**Riesgo**: parser laxo que carga datos basura → planificaciones rotas.
**Tipo de tests**: capa 1 + capa 2 con archivos fixture.
**Estimación**: 1 día.

```ts
// apps/api/src/modules/wods/__tests__/excel-import.test.ts
import fs from 'fs';
import path from 'path';
import { parseExcelPlan } from '../excel-importer';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../../../../tests/fixtures/excel', name));

describe('parseExcelPlan', () => {
  it('archivo válido de 1 semana → 7 WodPlans', () => {
    const result = parseExcelPlan(fixture('week-valid.xlsx'));
    expect(result.success).toBe(true);
    expect(result.plans).toHaveLength(7);
  });

  it('falta columna "fecha" → error específico', () => {
    const result = parseExcelPlan(fixture('missing-date-column.xlsx'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/columna.*fecha/i);
  });

  it('movimiento desconocido → reporta cuál', () => {
    const result = parseExcelPlan(fixture('unknown-movement.xlsx'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Triple Quadruple Backflip/);
  });

  it('porcentaje 250% → rechaza', () => {
    const result = parseExcelPlan(fixture('invalid-percentage.xlsx'));
    expect(result.success).toBe(false);
  });

  it('archivo de 1000 filas en menos de 5s', async () => {
    const start = Date.now();
    parseExcelPlan(fixture('large-1000-rows.xlsx'));
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
```

Las fixtures `.xlsx` se generan una vez con un script aparte (`tests/fixtures/excel/generate.ts`) y se commitean al repo.

---

## Zona de riesgo 7 — Seed de benchmarks

**Sección**: 3.3.3.
**Riesgo**: seed corre 2 veces y duplica → coaches ven "Fran" duplicado.
**Tipo de tests**: capa 2.
**Estimación**: 0.5 día.

```ts
// prisma/seeds/__tests__/seed.integration.test.ts
import { runBenchmarkSeed } from '../benchmarks';
import { prisma } from '../../tests/setup';

describe('Benchmark seed', () => {
  it('primera corrida: carga 27 Girls', async () => {
    await runBenchmarkSeed();
    const girls = await prisma.benchmark.count({ where: { category: 'GIRL' } });
    expect(girls).toBe(27);
  });

  it('segunda corrida: idempotente, sigue siendo 27', async () => {
    await runBenchmarkSeed();
    await runBenchmarkSeed();
    const girls = await prisma.benchmark.count({ where: { category: 'GIRL' } });
    expect(girls).toBe(27);
  });

  it('todos los Girls están marcados como isOfficial=true', async () => {
    await runBenchmarkSeed();
    const officials = await prisma.benchmark.count({
      where: { category: 'GIRL', isOfficial: true },
    });
    expect(officials).toBe(27);
  });

  it('Open desde 2011 hasta el año actual', async () => {
    await runBenchmarkSeed();
    const opens = await prisma.benchmark.findMany({ where: { category: 'OPEN' } });
    const years = new Set(opens.map((b) => b.year));
    expect(years.has(2011)).toBe(true);
    expect(years.has(new Date().getFullYear())).toBe(true);
  });
});
```

---

## Resumen de esfuerzo total

| Zona | Estimación | Tipo |
|---|---|---|
| Setup base | 1 día | infra |
| 1. Cálculo de carga | 1 día | unit |
| 2. Multi-tenancy | 2 días | integración |
| 3. Pasarelas (Stripe primero) | 2-3 días por pasarela | sandbox |
| 4. Conciliación matcher | 1 día | unit + integración |
| 5. Auto-renew | 1.5 días | integración con time-travel |
| 6. Excel import | 1 día | unit + fixtures |
| 7. Seed benchmarks | 0.5 día | integración |
| **Total mínimo viable (sin pasarelas extras)** | **~10 días** | |

Las pasarelas restantes (7 más) son ~14-21 días adicionales. Por eso van una a una y solo se cierran cuando hay clientes reales pidiéndolas.
