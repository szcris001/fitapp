---
name: testing_webhook_signatures_gotchas
description: Gotchas al testear validaciones de firma entrante en pasarelas MP/Khipu/Kushki/MACH
type: feedback
---

## Patrón general para testear validaciones de firma en pasarelas sin DB

Las funciones `validateXxxSignature/Token` son **exportadas y puras** (solo toman strings/Buffers, usan crypto, lanzan Error). Se pueden testear directamente sin Fastify ni DB — eso es la capa unitaria. Los tests HTTP solo se necesitan para verificar el **mapeo de error→status code** en la ruta.

**Why:** Los tests de firma inválida se cortan antes de cualquier lookup de DB, así que no necesitan setup de gym/user real.

**How to apply:** Separar en dos suites: una unit pura con `validateXxx` directamente, y una HTTP que verifica el mapeo de status. Para los casos "sin secret = pasa", el test HTTP debe usar un gymId inexistente para que el handler retorne 400 (por "Gimnasio no encontrado") — nunca 401, lo que confirma que la validación de firma no se activó.

---

## Mercado Pago — detalles de firma

- Template: `id:<notificationId>;request-id:<xRequestId>;ts:<ts>` (solo se incluyen los campos que existen — sin notificationId ni requestId el template es solo `ts:<ts>`)
- Header formato: `ts=<timestamp>,v1=<hmac_hex>`
- Si no hay `webhookSecret` → la función retorna sin error (modo legacy)
- La ruta comprueba `MERCADOPAGO_WEBHOOK_SECRET` env var ANTES de llamar al handler. Si la env está y no hay `x-signature` → 401 desde la propia ruta (no desde el service).
- El handler verifica la env global; si no está, itera gyms y verifica con `cfg.webhookSecret` por gym.

## Khipu — detalles de firma

- HMAC-SHA256 del raw body completo (string o Buffer)
- La función `validateKhipuSignature` NO tiene lógica "sin secret = pasa" — lanza siempre si `xKhipuSignature` es undefined. La lógica "sin secret pasa" vive en `handleKhipuCallback` (solo llama validate si `cfg.secret` existe).
- Al testear via HTTP sin gym real: el handler falla con "Gimnasio no encontrado" (400) antes de llegar a la validación de firma. Esto es correcto — no 401.
- Mapeo de status en ruta: `err.message.includes('inválida') || err.message.includes('Falta header')` → 401.

## Kushki — detalles del token

- JWT sin verificación criptográfica (MVP): verifica presencia + 3 segmentos + JSON en payload + `merchantId` o `merchant_id` en payload coincide con `cfg.privateMerchantId`.
- La verificación criptográfica completa (clave pública Kushki) queda como TODO — no está implementada.
- La validación solo se activa si el gym tiene `cfg.enabled && cfg.privateMerchantId` — es decir, la lógica "sin config = pasa" está en el handler, no en la función.
- Mapeo de status en ruta: `err.message.includes('inválido') || err.message.includes('Falta header') || err.message.includes('no coincide')` → 401.
- Gotcha: al generar un token de prueba, usar `.toString('base64url')` — el código hace `replace(/-/g, '+').replace(/_/g, '/')` para convertir base64url a base64 estándar antes de parsear.

## MACH — detalles del token

- Bearer token simple comparado con `crypto.timingSafeEqual`. No hay HMAC.
- La función acepta tanto `Bearer <token>` como el token crudo sin prefijo (hace `startsWith('Bearer ')` y extrae los 7 chars).
- `timingSafeEqual` requiere misma longitud — si lengths difieren, lanza antes de comparar contenido.
- La lógica "sin secret = pasa" está en `handleMachWebhook` (solo llama validate si `cfg.webhookSecret` existe).
- Mapeo de status en ruta: `err.message.includes('inválido') || err.message.includes('Falta header')` → 401.

## Patrón para testear mapeo de error→status sin gym real

Cuando no se puede crear un gym con la config apropiada (sin setup de DB), verificar el mapeo directamente:
```ts
let caught: Error | null = null
try { validateXxx(badInput, secret) } catch (e: any) { caught = e }
const statusMapping = caught!.message.includes('keyword') ? 401 : 400
expect(statusMapping).toBe(401)
```
Esto verifica que el mensaje de error activa el criterio del if en la ruta.
