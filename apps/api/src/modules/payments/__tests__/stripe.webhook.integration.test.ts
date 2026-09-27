/**
 * stripe.webhook.integration.test.ts
 *
 * Tests de integración para el webhook de Stripe.
 *
 * Estrategia:
 *   - NO usa claves Stripe reales — usa stripe.webhooks.generateTestHeaderString()
 *     con un STRIPE_WEBHOOK_SECRET de test controlado por nosotros.
 *   - El buildApp() configura rawBody via addContentTypeParser (parseAs: 'buffer')
 *     para simular el comportamiento correcto que debe existir en producción.
 *   - Usa fastify.inject() — sin levantar puerto real.
 *   - NO toca la DB para los casos de firma inválida/evento desconocido.
 *   - Limpia sus propios datos en afterAll.
 *
 * Bug encontrado durante implementación:
 *   - @fastify/rawbody no existe en npm. En index.ts no hay rawBody plugin.
 *   - La ruta usa config: { rawBody: true } pero sin plugin registrado,
 *     rawBody siempre es undefined → responde 400 en producción.
 *   - Fix: buildApp() en tests registra el rawBody via addContentTypeParser.
 *   - Fix pendiente en index.ts: registrar el mismo addContentTypeParser.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify'
import jwt from '@fastify/jwt'
import Stripe from 'stripe'
import { paymentRoutes } from '../payments.routes'

// ─── Constantes de test ───────────────────────────────────────────────────────

// Secret de test controlado — NO es un secret real de Stripe
// Debe ser un whsec_ válido para que stripe.webhooks lo acepte
const TEST_WEBHOOK_SECRET = 'whsec_test_fitapp_stripe_webhook_secret_v1_integration'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_cambiar_en_produccion'

// ─── Helper: construir la app Fastify con rawBody support ────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // JWT
  await app.register(jwt, { secret: JWT_SECRET })

  // *** FIX CRÍTICO ***
  // Fastify parsea el body a JSON antes de que el handler lo vea.
  // Para que stripe.webhooks.constructEvent() funcione, necesitamos
  // el payload como Buffer sin parsear. Lo logramos sobrescribiendo
  // el parser de application/json para que almacene el rawBody en la request.
  //
  // Este es el mismo patrón que debe ir en index.ts para que funcione en producción.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) {
      // Guardamos el buffer original en rawBody (accesible como (request as any).rawBody)
      ;(_req as any).rawBody = body
      // Body vacío: lo dejamos pasar como null — la ruta o el handler decidirán qué hacer
      if (!body || body.length === 0) {
        done(null, null)
        return
      }
      try {
        const parsed = JSON.parse(body.toString())
        done(null, parsed)
      } catch (err: any) {
        // JSON inválido: devolver null en lugar de crashear — la firma de Stripe
        // fallará de todos modos si el payload no corresponde
        done(null, null)
      }
    },
  )

  // Registrar rutas de pagos (incluye /api/payments/webhook y /api/payments/webhook/stripe)
  await app.register(paymentRoutes, { prefix: '/api' })

  await app.ready()
  return app
}

// ─── Helper: generar payload y header Stripe válidos ─────────────────────────

function makeStripeEvent(
  type: string,
  data: Record<string, unknown> = {},
  eventId?: string,
): { payload: Buffer; header: string } {
  const stripe = new Stripe('sk_test_dummy_for_header_generation', {
    apiVersion: '2026-02-25.clover',
  })

  const event = {
    id: eventId || `evt_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data,
    },
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  }

  const payload = Buffer.from(JSON.stringify(event))

  const header = stripe.webhooks.generateTestHeaderString({
    payload: payload.toString(),
    secret: TEST_WEBHOOK_SECRET,
  })

  return { payload, header }
}

// ─── Setup: override de la env var STRIPE_WEBHOOK_SECRET ────────────────────
// handleStripeWebhook() lee process.env.STRIPE_WEBHOOK_SECRET en tiempo de ejecución.
// Forzamos el secret de test ANTES de que la app se inicialice.

const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const originalStripeKey = process.env.STRIPE_SECRET_KEY

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
  // Usar un sk_test genérico — solo para inicializar el cliente Stripe, no hacemos llamadas reales
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_no_real_calls_in_webhook_handler'
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
})

afterAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret
  process.env.STRIPE_SECRET_KEY = originalStripeKey
})

// ─── Suite principal ───────────────────────────────────────────────────────────

describe('Stripe Webhook — POST /api/payments/webhook', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Caso 1: firma válida + payment_intent.succeeded → 200 ───────────────────
  it('Caso 1: firma válida + evento payment_intent.succeeded → 200 + received: true', async () => {
    const { payload, header } = makeStripeEvent('payment_intent.succeeded', {
      id: 'pi_test_001',
      amount: 50000,
      currency: 'clp',
      status: 'succeeded',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.received).toBe(true)
  })

  // ── Caso 2: firma válida + invoice.payment_succeeded → 200 ──────────────────
  // Este evento llega en auto-renovaciones de subscripciones de Stripe.
  // El handler actual no lo procesa específicamente (cae en el return genérico)
  // pero no debe lanzar error.
  it('Caso 2: firma válida + invoice.payment_succeeded → 200 (ignorado graciosamente)', async () => {
    const { payload, header } = makeStripeEvent('invoice.payment_succeeded', {
      id: 'in_test_001',
      amount_paid: 50000,
      subscription: 'sub_test_001',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.received).toBe(true)
  })

  // ── Caso 3: firma válida + customer.subscription.deleted → 200 ──────────────
  it('Caso 3: firma válida + customer.subscription.deleted → 200 (ignorado graciosamente)', async () => {
    const { payload, header } = makeStripeEvent('customer.subscription.deleted', {
      id: 'sub_test_deleted_001',
      status: 'canceled',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.received).toBe(true)
  })

  // ── Caso 4: webhook duplicado — mismo payload enviado dos veces ──────────────
  // El handler actual no implementa tabla de idempotencia (WebhookEvent no existe
  // en el schema). El segundo request también debe devolver 200 sin error.
  // Si el handler procesa el evento (checkout.session.completed) sin datos de
  // gymId/planId/userId en metadata, retorna { received: true } y no crea nada.
  it('Caso 4: mismo payload enviado dos veces → ambos 200 (idempotencia básica)', async () => {
    const eventId = `evt_test_dup_${Date.now()}`
    const { payload, header } = makeStripeEvent(
      'payment_intent.succeeded',
      { id: 'pi_test_dup', status: 'succeeded' },
      eventId,
    )

    const injectOptions = {
      method: 'POST' as const,
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: payload,
    }

    const first = await app.inject(injectOptions)
    const second = await app.inject(injectOptions)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json().received).toBe(true)
    expect(second.json().received).toBe(true)
  })

  // ── Caso 5: firma inválida (secret equivocado) → 400 ────────────────────────
  it('Caso 5: firma con secret equivocado → 400', async () => {
    const stripe = new Stripe('sk_test_dummy', { apiVersion: '2026-02-25.clover' })
    const event = {
      id: 'evt_test_bad_sig',
      type: 'payment_intent.succeeded',
      object: 'event',
      data: { object: {} },
      created: Math.floor(Date.now() / 1000),
    }
    const payload = Buffer.from(JSON.stringify(event))

    // Generar header con un secret DIFERENTE al configurado en la app
    const wrongHeader = stripe.webhooks.generateTestHeaderString({
      payload: payload.toString(),
      secret: 'whsec_wrong_secret_this_should_fail_validation',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': wrongHeader,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBeDefined()
  })

  // ── Caso 6: sin header stripe-signature → 400 ───────────────────────────────
  it('Caso 6: request sin header stripe-signature → 400', async () => {
    const payload = Buffer.from(JSON.stringify({ id: 'evt_test_no_sig', type: 'foo' }))

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        // Sin stripe-signature
      },
      body: payload,
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBeDefined()
    // El mensaje debe indicar falta de firma, no un crash interno
    expect(body.error).toMatch(/firma/i)
  })

  // ── Caso 7: body vacío pero con firma válida → 400 (no 500) ─────────────────
  // Una firma válida sobre un payload vacío es técnicamente coherente (HMAC sobre ''),
  // pero stripe.webhooks.constructEvent() intentará parsear el string vacío como JSON
  // y lanzará "Unexpected end of JSON input". El catch del handler debe capturar
  // esto y devolver 400, no dejar que el 500 llegue al cliente.
  //
  // Bug encontrado: sin el fix en addContentTypeParser, Fastify lanza 500 porque
  // no puede parsear un body vacío como JSON. Con el fix (null en body vacío),
  // el rawBody = Buffer('') llega al handler, constructEvent lanza el error,
  // el catch lo devuelve como 400.
  it('Caso 7: body vacío con firma válida → 400 (no 500)', async () => {
    const stripe = new Stripe('sk_test_dummy', { apiVersion: '2026-02-25.clover' })
    const emptyPayload = Buffer.from('')

    const header = stripe.webhooks.generateTestHeaderString({
      payload: '',
      secret: TEST_WEBHOOK_SECRET,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: emptyPayload,
    })

    // Con el fix aplicado: el error de JSON parse es capturado → 400
    // Sin el fix: Fastify crashea con 500 (SyntaxError no controlado en el parser)
    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBeDefined()
  })

  // ── Caso 8: evento desconocido → 200 (ignorado sin error) ───────────────────
  // El handler tiene un return { received: true } genérico al final.
  // Eventos desconocidos deben ser ignorados sin error, no rechazados con 400.
  it('Caso 8: evento desconocido (foobar.event) con firma válida → 200', async () => {
    const { payload, header } = makeStripeEvent('foobar.event', {
      some_field: 'some_value',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.received).toBe(true)
  })

  // ── Caso 9: retry de Stripe (mismo payload, segunda firma con timestamp nuevo) ──
  // Stripe reintenta webhooks con el MISMO payload pero genera un nuevo header.
  // Esto es diferente al caso 4 (doble envío idéntico): aquí el timestamp es nuevo.
  it('Caso 9: retry simulado (mismo payload, nuevo timestamp en firma) → 200 idempotente', async () => {
    const stripe = new Stripe('sk_test_dummy', { apiVersion: '2026-02-25.clover' })

    const eventId = `evt_test_retry_${Date.now()}`
    const event = {
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      livemode: false,
      created: Math.floor(Date.now() / 1000) - 60, // evento de hace 60 segundos
      data: { object: { id: 'pi_test_retry', status: 'succeeded' } },
    }
    const payload = Buffer.from(JSON.stringify(event))

    // Primer intento: timestamp actual
    const header1 = stripe.webhooks.generateTestHeaderString({
      payload: payload.toString(),
      secret: TEST_WEBHOOK_SECRET,
    })

    // Segundo intento: nuevo timestamp (simulando retry de Stripe)
    const header2 = stripe.webhooks.generateTestHeaderString({
      payload: payload.toString(),
      secret: TEST_WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000), // timestamp fresco para evitar expiración
    })

    const first = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': header1 },
      body: payload,
    })

    const second = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': header2 },
      body: payload,
    })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json().received).toBe(true)
    expect(second.json().received).toBe(true)
  })

  // ── Caso 10: timestamp muy antiguo (tolerancia de 300s excedida) → 400 ───────
  // Stripe rechaza eventos con timestamp > 300 segundos en el pasado.
  // stripe.webhooks.constructEvent() lanza error si el timestamp excede la tolerancia.
  it('Caso 10: webhook con timestamp >300s en el pasado → 400 (replay attack protection)', async () => {
    const stripe = new Stripe('sk_test_dummy', { apiVersion: '2026-02-25.clover' })

    const event = {
      id: 'evt_test_old_timestamp',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: {} },
      created: Math.floor(Date.now() / 1000) - 600, // hace 10 minutos
    }
    const payload = Buffer.from(JSON.stringify(event))

    // Generar header con timestamp que ya expiró (> 300s en el pasado)
    const expiredHeader = stripe.webhooks.generateTestHeaderString({
      payload: payload.toString(),
      secret: TEST_WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 400, // 400s en el pasado — excede los 300s de Stripe
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': expiredHeader,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBeDefined()
  })
})

// ─── Suite secundaria: ruta alternativa /api/payments/webhook/stripe ─────────
// Hay dos rutas que hacen lo mismo. Verificamos que la segunda también funcione.

describe('Stripe Webhook — POST /api/payments/webhook/stripe (ruta alternativa)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('firma válida en ruta /webhook/stripe → 200', async () => {
    const { payload, header } = makeStripeEvent('payment_intent.succeeded', {
      id: 'pi_test_alt_route',
      status: 'succeeded',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': header,
      },
      body: payload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
  })

  it('sin firma en ruta /webhook/stripe → 400', async () => {
    const payload = Buffer.from(JSON.stringify({ id: 'evt_alt_no_sig' }))

    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/stripe',
      headers: { 'content-type': 'application/json' },
      body: payload,
    })

    expect(response.statusCode).toBe(400)
  })
})

// ─── Ruta canónica y alias legado: mismo handler ──────────────────────────────

describe('Stripe Webhook — /api/payments/webhook/stripe y alias /api/payments/webhook', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await buildApp() })
  afterAll(async () => { await app.close() })

  it.each(['/api/payments/webhook/stripe', '/api/payments/webhook'])('%s: evento firmado → 200', async (url) => {
    const { payload, header } = makeStripeEvent('payment_intent.succeeded', {
      id: 'pi_test_alias', amount: 50000, currency: 'clp', status: 'succeeded',
    })
    const res = await app.inject({
      method: 'POST', url,
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: payload,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().received).toBe(true)
  })

  it.each(['/api/payments/webhook/stripe', '/api/payments/webhook'])('%s: sin firma → 400', async (url) => {
    const res = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Sin firma Stripe/)
  })
})
