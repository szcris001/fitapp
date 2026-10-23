---
name: flow_per_gym_audit
description: Auditoría 2026-10-22 del Flow por-gym (alumno paga al gym) — bug crítico de content-type encontrado y corregido, diseño de PaymentCheckout verificado sólido
metadata:
  type: project
---

Contexto: FitApp tiene DOS integraciones de Flow completamente separadas:
1. **Flow de plataforma** (`apps/api/src/modules/superadmin/gym-payments.routes.ts`) — usa `FLOW_API_KEY`/`FLOW_SECRET_KEY` globales de Railway, Tribu-Box cobrándole la suscripción SaaS a los gyms. **No es mi mandato tocarlo** salvo pedido explícito.
2. **Flow por-gym** (`payments.service.ts`: `createFlowCheckout`/`handleFlowCallback`/`flowSign`, `payments.routes.ts` líneas ~190-214) — cada gym guarda su propia API Key/Secret en `Gym.paymentGateways.flow` y cobra a SUS alumnos. Esta es la que audité.

## Bug crítico encontrado y corregido: 415 en el callback real de Flow

Flow llama a `urlConfirmation` con `Content-Type: application/x-www-form-urlencoded` (body `token=...`), NO JSON — confirmado porque todo el código de referencia oficial de Flow lee `$_POST['token']`. Fastify solo tenía parser para `application/json` (registrado en `index.ts` para Stripe). Sin parser para form-urlencoded, Fastify devuelve **415 antes de llegar a la ruta** — el callback de Flow nunca se habría procesado en producción, dejando el pago aprobado en Flow pero la membresía sin activar jamás (ni error visible salvo en el dashboard de Flow con reintentos fallidos).

**Por qué la suite de tests existente no lo detectó**: los tests usaban `app.inject({ payload: {...} })` con un objeto — `light-my-request` (el motor detrás de `.inject()`) serializa objetos como JSON por defecto, enmascarando el bug. Repliqué el 415 real con un Fastify mínimo antes de tocar código, para confirmar la hipótesis antes de "arreglar" algo que quizás no estaba roto.

**Fix**: parser agregado DENTRO de `paymentRoutes` (`payments.routes.ts`), no en `index.ts`. Confirmé con un repro aislado (`app.addContentTypeParser` dentro de un plugin registrado vs. una ruta fuera de ese plugin) que Fastify encapsula el content-type parser al plugin donde se registra — no se propaga a otros módulos. Esto me permitió arreglarlo sin salir de mi superficie permitida (`apps/api/src/modules/payments`).

**Gotcha para recordar**: si alguna vez hay que registrar algo scoped-to-payments-only en Fastify (parsers, hooks, decorators), probarlo así: dos plugins registrados en la misma instancia raíz, uno con el `addContentTypeParser`/hook y otro sin él — si la ruta del segundo sigue comportándose como antes, la encapsulación está confirmada.

**Sospecha sin verificar**: Khipu/PayU/OpenPay probablemente tienen el mismo patrón de confirmación por POST-formulario (no JSON) y se benefician de este mismo fix (quedan en el mismo plugin), pero NO audité su checklist de cierre completo en esta sesión — el pedido era específicamente Flow. Revisar cuando les toque el turno en el plan de cierre (ver rol: Khipu es la 3ª prioridad, PayU queda para el final).

## Diseño ya sólido antes de esta auditoría (no tocar sin razón)

`PaymentCheckout` (tabla server-side, creada en el checkout con `gymId`/`userId`/`planId` tomados del JWT) ya resuelve lo más peligroso:
- El callback NUNCA confía en `gymId`/`userId`/`planId` del body — todo sale de `checkout.*`, resuelto por `(gateway, externalRef)`.
- `handleFlowCallback` verifica el pago server-to-server contra `payment/getStatus` de Flow (firmado con las credenciales del gym correcto, resueltas por `checkout.gymId`) — no hay manera de falsificar una confirmación.
- `completeCheckout` hace un reclamo atómico (`updateMany` con `completedAt: null` como filtro) → idempotencia real ante duplicados/concurrencia, y libera el reclamo si `activateMembership` falla (sin dejar estado fantasma).
- `assertPaidAmount` cruza el monto que informa Flow contra el monto real del plan al momento del checkout.

Esto es un patrón mucho más maduro que lo que documentaba STATE.md de 2026-05 (que hablaba de bugs cross-gym ya cerrados con `Promise.all([getGym, getUser])`) — en algún momento entre esa fecha y ahora se refactorizó hacia `PaymentCheckout`, sin que quedara registrado explícitamente el porqué. Si se vuelve a tocar el checkout flow de cualquiera de los 5 gateways que usan `PaymentCheckout` (flow, khipu, payu, kushki, openpay), mantener este patrón — NO volver a pasar gymId/userId/planId del cliente en el callback.

## Gaps conocidos, NO corregidos a propósito (documentados en STATE.md, no reinventar la próxima vez)

- Sin check de **moneda** en `assertPaidAmount` (solo monto numérico) — no lo agregué por no poder confirmar el nombre exacto del campo de moneda en la respuesta real de `getStatus` sin sandbox real; agregar un check con el campo equivocado sería peor (falsos rechazos de pagos válidos) que no tener el check.
- `urlReturn` no lleva `?token=` — Flow redirige el navegador con POST, no GET, así que la página de éxito web no puede leer el token de la URL. Es gap de UX (web-dev), no de seguridad — la confirmación real pasa por `urlConfirmation` server-to-server.
- No existe tabla `PaymentAttempt`/log de auditoría para ningún gateway (regla de oro #7 del rol) — gap transversal preexistente, no introducido por Flow.
- `commerceOrder` corregido (sufijo random de 4 bytes) para evitar colisión por timestamp en milisegundos entre checkouts simultáneos del mismo gym — Flow exige unicidad por comercio.

**Pendiente de prueba manual de Cristian antes de ir en serio con un gym real**: confirmar `BACKEND_URL` en Railway apunta al dominio público HTTPS real de la API (no localhost) — sin esto, ni con el fix del content-type Flow podría llamar al callback. Luego probar sandbox real end-to-end (pago aprobado, pago rechazado, y mirar qué trae realmente `getStatus` para poder cerrar el gap de moneda).
