---
name: gateway_signature_gotchas
description: Comportamientos no documentados o tramposos en la validación de firmas de webhooks de cada pasarela
type: reference
---

# Gotchas de validación de firma por pasarela

## Mercado Pago

- Header de firma: `x-signature`, formato `ts=<timestamp>,v1=<hash>` — **no** es solo el hash.
- El string a firmar es `id:<notification_id>;request-id:<x-request-id>;ts:<timestamp>` con punto y coma como separador. Si no hay `notificationId` o `xRequestId`, se omite el segmento completo (no se incluye como vacío).
- La clave es `MERCADOPAGO_WEBHOOK_SECRET` (global) o `cfg.webhookSecret` por gym. Son mutuamente excluyentes en la lógica actual: si hay global, se usa global y se ignora per-gym.
- Si no hay secret configurado, **no se rechaza** — esto es intencional para gyms sin secret (mode legacy).
- Documentación oficial: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks

## Khipu

- Header de firma IPN entrante: `x-khipu-signature` — HMAC-SHA256 del **raw body** en hex.
- La función `khipuSign` existente en el código es para **requests salientes** (firma de llamadas a la API de Khipu), no para validar webhooks entrantes. Son mecanismos distintos.
- El `cfg.secret` es el mismo secret del receiver de Khipu — se usa tanto para firmar requests salientes como para verificar webhooks entrantes.
- rawBody disponible via `(request as any).rawBody` gracias al parser de `addContentTypeParser` en index.ts.

## Kushki

- Header: `x-kushki-token` — es un JWT firmado por Kushki.
- La verificación criptográfica completa del JWT requiere la clave pública de Kushki que **no está expuesta en docs públicos de sandbox** — pendiente para producción.
- MVP: verificar presencia + formato (3 segmentos base64url) + `merchantId` en payload decodificado.
- El campo en el payload JWT puede ser `merchantId` o `merchant_id` — manejar ambos.
- El `expectedMerchantId` viene de `cfg.privateMerchantId` del gym, no del `publicMerchantId`.

## MACH Business

- MACH no documenta un header de firma HMAC propio en su API pública.
- Comportamiento observado en sandbox (no documentado oficialmente): el webhook llega con `Authorization: Bearer <webhookSecret>`.
- Implementación: comparar Bearer token con `cfg.webhookSecret` usando `crypto.timingSafeEqual` para evitar timing attacks.
- Si los buffers tienen distinto length, `timingSafeEqual` lanza — se maneja comparando lengths antes.
- Si no hay `cfg.webhookSecret`, no se verifica (la autenticidad descansa en el `external_id` + consulta API MACH).

## Flow

- La HMAC en Flow es para **requests salientes** (parámetro `s` en el form). No hay firma en el callback entrante.
- El callback de Flow devuelve un `token` → se verifica el pago consultando `GET /payment/getStatus` con el mismo token firmado.
- Es decir: Flow valida autenticidad vía re-consulta a su API, no via firma en el callback.

## PayU

- La firma MD5 **ya estaba implementada** antes de este turno en `handlePayUCallback`.
- Formato: MD5(`apiKey~merchantId~referenceCode~TX_VALUE~currency~transactionState`).
- Gotcha: el campo de firma en el body de PayU se llama `sign` (minúsculas), no `signature`.
- La comparación es `sign.toLowerCase() !== expected.toLowerCase()` — PayU puede enviar uppercase.

## OpenPay

- El callback de OpenPay es un **GET redirect del navegador** (el usuario es redirigido). No hay firma en el callback.
- La verificación de autenticidad se hace consultando la API de OpenPay con el `orderId`.
- No hay endpoint de webhook separado para OpenPay en la implementación actual.

## vitest.config.ts — fix preexistente

- `pnpm build` genera archivos en `dist/` incluyendo los tests compilados a CJS.
- Sin `include`/`exclude` en vitest.config.ts, vitest detecta esos archivos y falla con "Vitest cannot be imported in CommonJS".
- Fix aplicado: `include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts']`, `exclude: ['dist/**', 'node_modules/**']`.
- Los 549 tests seguían pasando incluso antes del fix (el conteo correcto aparecía en el output).
