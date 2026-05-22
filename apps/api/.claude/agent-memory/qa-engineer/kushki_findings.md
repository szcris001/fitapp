---
name: kushki_findings
description: Kushki: 2 bugs (cross-gym sin pasarela activa + mapeo 401 incompleto), patrón makeKushkiToken sintético, comportamiento status ausente
type: project
---

Kushki integration tests completados 2026-05-07: 19/19 tests pasando.

**Why:** Documentar gotchas de Kushki para tests futuros y bugs encontrados para backend-dev.

**How to apply:** Usar estos patrones al escribir más tests de Kushki o al revisar el fix.

## Patrones aprendidos

### makeKushkiToken sintético
Para tests de callback solo necesitas un JWT con `merchantId` en el payload. El MVP de Kushki no verifica la firma criptográfica (clave pública no expuesta en sandbox):
```ts
function makeKushkiToken(merchantId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ merchantId, sub: 'callback', iat: Date.now() })).toString('base64url')
  return `${header}.${payload}.fakesig`
}
```
También acepta `merchant_id` (guion bajo) — el service maneja ambas variantes.

### Callback: params en query, no en body
A diferencia de Flow (params en body), Kushki callback recibe `gymId`, `planId`, `userId` en query params:
`POST /payments/callback/kushki?gymId=...&planId=...&userId=...`

### transactionStatus ausente activa membresía
La condición del service es `if (transactionStatus && transactionStatus !== 'APPROVAL') throw ...`
Si `transactionStatus` es `undefined` (ausente), la condición es falsa → no lanza → membresía activada.
Es un edge case documentado (test "status ausente → 200+activa").

## Bugs encontrados

### BUG-SECURITY: gym sin Kushki habilitado no rechaza el callback
`handleKushkiCallback` hace `cfg = gym.paymentGateways?.kushki`. La guarda es:
`if (cfg?.enabled && cfg?.privateMerchantId) { validateKushkiToken(...) }`
Si `cfg` es undefined (gym sin Kushki), la guarda es falsa → NO valida el token → continúa procesando.
`activateMembership` usa `prisma.plan.findUnique({ where: { id: planId } })` sin filtro gymId → activa membresía cross-plan.
Fix: lanzar `"Pasarela kushki no configurada"` si `cfg?.enabled` es falsy, antes de continuar.

### BUG: mapeo 401 incompleto para "no tiene formato JWT"
La ruta mapea a 401: `err.message.includes('inválido') || includes('Falta header') || includes('no coincide')`
El mensaje de `validateKushkiToken` cuando el JWT no tiene 3 segmentos es: `"Header x-kushki-token no tiene formato JWT"` — no contiene ninguna de esas palabras → devuelve 400 en vez de 401.
Fix: añadir `includes('no tiene formato')` en la condición de mapeo en `payments.routes.ts`.

## Checkout: verificaciones importantes
- Header enviado a Kushki: `Private-Merchant-Id` (no `public` — el checkout usa el ID privado)
- URL sandbox: `https://api-uat.kushkipagos.com/card/v1/charges`
- URL producción: `https://api.kushkipagos.com/card/v1/charges`
- Respuesta: `data.redirectURL || data.payment_url` → `chargeToken: data.ticketNumber`
- El `callbackURL` en el body incluye `gymId`, `planId`, `userId` como query params
- `amount.subtotalIva0 = plan.priceCents / 100` (sin IVA en MVP)
