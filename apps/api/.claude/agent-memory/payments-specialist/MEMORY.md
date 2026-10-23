# MEMORY.md

- [stripe_rawbody_gotcha.md](stripe_rawbody_gotcha.md) — Stripe webhooks: NUNCA usar JSON.stringify(request.body), siempre rawBody real
- [stripe_fastify_rawbody_fix.md](stripe_fastify_rawbody_fix.md) — @fastify/rawbody no existe en npm — fix: addContentTypeParser con parseAs buffer en index.ts
- [stripe_webhook_test_pattern.md](stripe_webhook_test_pattern.md) — Patrón para tests sin claves reales: generateTestHeaderString + secret controlado + override env vars
- [flow_per_gym_audit.md](flow_per_gym_audit.md) — Flow por-gym: bug 415 (callback real es form-urlencoded, no JSON) corregido; PaymentCheckout ya resuelve multi-tenancy/idempotencia/monto
