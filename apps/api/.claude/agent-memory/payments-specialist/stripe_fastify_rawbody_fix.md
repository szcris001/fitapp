---
name: stripe_fastify_rawbody_fix
description: @fastify/rawbody no existe en npm — fix correcto es addContentTypeParser con parseAs buffer en index.ts
type: feedback
---

`@fastify/rawbody` NO existe como paquete npm publicado. Intentar instalarlo con `pnpm add @fastify/rawbody` falla con "not in the npm registry".

El fix correcto para tener rawBody disponible en Fastify es sobrescribir el parser de `application/json` con `addContentTypeParser`:

```ts
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  function (req: any, body: Buffer, done) {
    req.rawBody = body
    if (!body || body.length === 0) { done(null, null); return }
    try {
      done(null, JSON.parse(body.toString()))
    } catch {
      done(null, null) // JSON inválido — no crashear, el handler lo manejará
    }
  },
)
```

Este parser debe ir en `index.ts` ANTES de registrar las rutas. En el `buildApp()` de los tests de integración también debe estar.

**Bug descubierto**: La ruta de webhook usaba `config: { rawBody: true }` — una opción de `@fastify/rawbody` — pero el plugin nunca fue registrado. En producción, `(request as any).rawBody` era siempre `undefined`, lo que hacía que todos los webhooks de Stripe respondieran 400 ("Sin raw body").

**Segundo bug**: Con body vacío, el parser nativo de Fastify lanzaba SyntaxError no controlado → 500. El fix de `done(null, null)` en body vacío evita el crash.

**Why:** Descubierto al escribir los tests de integración del webhook (2026-04-30). El test del Caso 7 (body vacío) falló con 500 cuando debía devolver 400.

**How to apply:** Antes de escribir tests de webhook para cualquier otra pasarela, verificar que el `buildApp()` del test incluye este addContentTypeParser. En producción, verificar que index.ts lo tiene.
