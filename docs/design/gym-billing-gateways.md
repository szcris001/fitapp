# Diseño: administración de pasarelas de cobro Tribu-Box -> gyms

Estado: PROPUESTO 2026-11-22 (architect). Sin implementar. Fuera de alcance: mobile, pasarelas de alumnos (`Gym.paymentGateways`).
Implementación: ver "Orden". Los cambios en `apps/api/src/modules/payments/**` los hace payments-specialist.

## 0. Hallazgos del código actual (condicionan el diseño)

1. `GET/PATCH /superadmin/config` (`config.routes.ts`) devuelve `...s` / `...updated` de `PlatformSettings` completo. Si se agrega `billingGateways` al modelo, **se filtrarían secretos en claro** por ese spread. Debe pasar a lista explícita de campos (o `omit`).
2. `gym-payments.routes.ts` `/flow/confirm`: sin idempotencia (se ejecuta N veces si Flow reintenta), `updateMany` por `gatewayOrderId` sin verificar monto, no extiende `endsAt` ni activa el Gym (solo pone `ACTIVE`), y es público sin rate limit. `/manual` y `/refund` tienen el mismo problema de activación; `/refund` no valida estado.
3. `activateGymSubscriptionFromStripe` y el checkout reutilizan la fila `GymSubscription` vigente (TRIAL/ACTIVE/EXPIRED): al renovar a OTRO plan el `planId` de la fila no cambia, y si la sub vigente es la misma fila, pierde los días restantes (`currentSub` excluye `id: subscriptionId`). Se corrige en el diseño (sec. 5): la activación crea una fila nueva.
4. `maskGateways` en `lib/secrets.ts` enmascara todo campo fuera de `PUBLIC_GATEWAY_FIELDS`. Los datos bancarios de la transferencia (banco, cuenta, titular) deben mostrarse tal cual -> parametrizar el set de campos públicos.
5. RLS: `GymSubscriptionPayment` y `GymSubscription` YA tienen `tenant_isolation` (migración `20260927010000_rls_enforced`). `PlatformSettings`/`FitAppPlan` son tablas globales sin `gymId`: **no llevan política** (regla CLAUDE.md aplica solo a tablas con datos de un gym). Pero `fitapp_app` puede leer `PlatformSettings` desde cualquier request: por eso las credenciales solo se leen en el resolver del servidor y nunca se devuelven a rutas de gym (ver sec. 4). No se agregan columnas con `gymId`, así que no hay caso nuevo para `rls.integration.test.ts` salvo el de abajo (sec. 7).
6. No existe tabla `WebhookEvent` en el schema; la idempotencia se logra con transición condicional de estado + índice único (sec. 3).

## 1. Schema Prisma + migración (especificado, NO creado ni aplicado)

```prisma
model PlatformSettings {
  // ...campos actuales...
  billingGateways Json?   // ver forma abajo; null = nunca configurado (usa env)
}

model GymSubscriptionPayment {
  // ...campos actuales...
  reference       String?   // código de transferencia mostrado al admin (ej. TB-AB12CD)
  receiptUrl      String?   // path bajo /uploads/gym-billing/<gymId>/..., NO URL pública
  rejectionReason String?
  confirmedById   String?   // userId del SUPER_ADMIN que confirmó/rechazó (sin FK: el user puede borrarse)
  confirmedAt     DateTime?
  @@unique([gateway, gatewayOrderId])   // idempotencia: 1 orden de pasarela = 1 fila (NULL no colisiona)
}
```

- Sin cambio de enum: rechazo de transferencia = `status FAILED` + `rejectionReason` (evita `ALTER TYPE ADD VALUE`).
- `GymPaymentStatus` actual: PENDING | PAID | FAILED | REFUNDED.

Migración `20261122000000_add_billing_gateways/migration.sql`:
```sql
ALTER TABLE "PlatformSettings" ADD COLUMN "billingGateways" JSONB;
ALTER TABLE "GymSubscriptionPayment"
  ADD COLUMN "reference" TEXT, ADD COLUMN "receiptUrl" TEXT, ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "confirmedById" TEXT, ADD COLUMN "confirmedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "GymSubscriptionPayment_gateway_gatewayOrderId_key"
  ON "GymSubscriptionPayment"("gateway","gatewayOrderId");
-- Pre-check antes de aplicar: SELECT gateway,"gatewayOrderId",count(*) FROM "GymSubscriptionPayment"
--   WHERE "gatewayOrderId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;  (debe dar 0 filas)
```
Sin RLS nueva (tablas ya cubiertas / globales). Aplicar con `migrate deploy` (shadow DB rota, ver memoria).

### Forma de `billingGateways` (JSON)
```ts
{
  flow:     { enabled: boolean, sandbox: boolean, apiKey?: string, secretKey?: string },
  stripe:   { enabled: boolean, secretKey?: string, webhookSecret?: string, publishableKey?: string },
  transfer: { enabled: boolean, bankName?, accountType?, accountNumber?, holderName?, holderRut?, contactEmail?, instructions? }
}
```
- Secretos (se enmascaran como `••••1234`): `apiKey`, `secretKey`, `webhookSecret`. Públicos: `enabled`, `sandbox`, `publishableKey`, y todos los de `transfer`.
- Mismo contrato que `Gym.paymentGateways`: valor enmascarado/""/undefined = conservar; `null` explícito = borrar (`wantsToClearSecret`).
- Cifrado en reposo: ver decisión abierta D1 (hoy `smtpPass` y `Gym.paymentGateways` van en claro).

### Resolver (nuevo, `apps/api/src/modules/gym-billing/billing-config.service.ts`)
`getBillingGatewayConfig(name)` -> credenciales completas, SOLO para uso interno de services.
- Si `billingGateways?.[name]` existe (aunque `enabled:false`) -> manda la DB.
- Si no existe -> fallback env: `flow` activo si hay `FLOW_API_KEY`+`FLOW_SECRET_KEY` (sandbox = `FLOW_API_URL` contiene "sandbox"); `stripe` activo si hay `STRIPE_SECRET_KEY`; `transfer` nunca por env.
- URL Flow: `sandbox ? https://sandbox.flow.cl/api : https://www.flow.cl/api` (env `FLOW_API_URL` solo en el fallback).
- `listEnabledBillingGateways(country)` -> `['flow'?,'stripe'?,'transfer'?]`. Flow solo si `gym.country==='CL'`. Cache en memoria 30 s, invalidado al hacer PUT.

## 2. Endpoints

Prefijo real `/api` (como el resto). Todos validan con Zod; los schemas viven en `gym-billing.schema.ts` y se exportan a web.

### SUPER_ADMIN (`preHandler: requireSuperAdmin`; no usan gymId)
| Método y ruta | Body / Query | Response |
|---|---|---|
| GET `/superadmin/billing-gateways` | - | `{ gateways: { flow, stripe, transfer }, source: { flow:'db'\|'env'\|'none', ... } }` secretos enmascarados (`maskGateways(cfg, BILLING_PUBLIC_FIELDS)`) |
| PUT `/superadmin/billing-gateways` | `z.object({ flow: flowSchema.partial().optional(), stripe: ..., transfer: ... }).strict()`. Secretos `string \| null`. | igual que GET |
| GET `/superadmin/gym-payments?gateway=transfer&status=PENDING&hasReceipt=true` | existente + filtro `hasReceipt` | lista + `receiptUrl` |
| POST `/superadmin/gym-payments/:id/confirm` | `{ notes?: string }` | pago PAID + sub activada |
| POST `/superadmin/gym-payments/:id/reject` | `{ reason: z.string().min(3).max(300) }` | pago FAILED |

Validaciones PUT: no se puede dejar `enabled:true` si faltan credenciales requeridas tras el merge (flow: apiKey+secretKey; stripe: secretKey+webhookSecret; transfer: bankName+accountNumber+holderName+holderRut) -> 422 `{ error, missing: [...] }`. Merge con `mergeGateways` generalizado. Cada PUT escribe un log de auditoría (userId, gateways tocados, sin valores).
Errores: 400 Zod, 401/403 rol, 404 pago, 409 pago ya no PENDING, 422 credenciales incompletas.

### Admin del gym (`preHandler: requireAdmin`, gymId SIEMPRE de `request.user.gymId`; si es null -> 400 `Sin gimnasio asociado`, igual que hoy)
- GET `/gyms/me/billing/gateways` -> `{ gateways: Array<{ gateway:'flow'|'stripe'|'transfer', label:string, sandbox?:boolean, transfer?:{ bankName, accountType, accountNumber, holderName, holderRut, contactEmail, instructions } }> }`. Solo habilitadas y compatibles con el país del gym. Nunca keys/secretos.
- POST `/gyms/me/subscription/checkout` (MODIFICA el existente) body `{ planId: uuid, gateway: enum['flow','stripe','transfer'] }` (gateway obligatorio; solo web lo consume, se despliega junto).
  Response `z.discriminatedUnion('type', [ {type:'redirect', url, paymentId}, {type:'transfer', paymentId, reference, amountCLP, bank:{...}} ])`.
  Errores: 400 body, 400 `Pasarela no disponible` (no activa o no permitida para el país), 404 plan (inexistente o `isActive=false`), 422 plan gratuito (`isFree`), 409 ya existe una transferencia PENDING sin comprobante para ese plan (se devuelve esa misma, ver abajo).
  Monto SIEMPRE `FitAppPlan.priceCLP` del servidor; nunca del cliente.
- POST `/gyms/me/subscription/payments/:paymentId/receipt` (multipart, 1 archivo jpg/png/webp/pdf, <=5 MB ya limitado en `multipart`). Verifica `payment.gymId === user.gymId && gateway==='transfer' && status==='PENDING'`; guarda con `safeResolvePath` en `uploads/gym-billing/<gymId>/`; setea `receiptUrl`. Respuesta `{ paymentId, status:'PENDING', receiptUrl }`. Errores: 404 (no existe o de otro gym: mismo 404, no 403, para no filtrar existencia), 409 no PENDING, 415 mime, 413 tamaño.
- GET `/gyms/me/subscription/payments` -> últimos 20 pagos del gym (id, planId, amount, gateway, status, reference, rejectionReason, createdAt, hasReceipt). Sin `gatewayData`.
- GET `/gyms/me/subscription` (existente, sin cambio): la web lo sondea tras volver de Flow.

### Público server-to-server
- POST `/gym-billing/flow/confirm` (sin auth). Body `application/x-www-form-urlencoded` `{ token: string }` (verificar que `@fastify/formbody` esté registrado). Rate limit propio (ej. 60/min por IP). Responde 200 siempre que el token sea procesable (Flow reintenta ante no-200); 400 sin token.
- Alias temporal: `/superadmin/gym-payments/flow/confirm` apunta al mismo handler durante 14 días (órdenes Flow ya creadas llevan esa `urlConfirmation`), luego se elimina. `/superadmin/gym-payments/flow/create` se elimina (el superadmin ya no cobra por el gym; si se quiere asistir a un gym, usa `/manual` o la transferencia).
- Stripe: el webhook existente (`payments.service` ~L234) se mantiene; fase 3 lo unifica.

## 3. Flujos

**Flow**: checkout -> resolver (config DB/env) -> `commerceOrder = SUB-<paymentId>` -> crear pago PENDING (`gateway:'flow'`, `gatewayOrderId=commerceOrder`, `reference`, `gatewayData:{ token, flowOrder, sandbox }`) -> llamar `payment/create` firmado HMAC-SHA256 (mismo algoritmo actual) con `email = gym.ownerEmail ?? user.email`, `urlConfirmation = PUBLIC_API_URL/api/gym-billing/flow/confirm`, `urlReturn = FRONTEND_URL/dashboard/subscription?payment=<id>`. Si Flow falla se marca el pago FAILED. Se devuelve `url?token=`.
**Confirmación (idempotente, nunca confía en el body)**: con `token` consultar `payment/getStatus` firmado (credenciales según `gatewayData.sandbox` del pago encontrado por `commerceOrder`; si hay que descubrirlo antes, probar la config vigente). Aceptar solo si `status===2`, `commerceOrder` existe como pago `gateway='flow'`, `Number(amount)===payment.amount` y `currency==='CLP'`. Luego en `$transaction`: `updateMany({ where:{ id, status:'PENDING' }, data:{ status:'PAID', paidAt, gatewayData } })`; **solo si `count===1`** ejecutar `activateGymSubscriptionFromPayment(paymentId)`. Un reintento o webhook duplicado da `count===0` y es no-op. Corre en modo bypass RLS (sin request autenticado). Si el repo ya encola webhooks en BullMQ para Flow alumnos, aplicar el mismo patrón (decisión de payments-specialist); la barrera de idempotencia es la misma.
**Transferencia**: checkout crea pago `PENDING` (`gateway:'transfer'`, `gatewayOrderId=reference`, `reference = 'TB-' + 6 chars`) y devuelve datos bancarios. Si ya existe uno PENDING del mismo gym+plan sin comprobante, se devuelve ese (no duplicar). Admin sube comprobante. Superadmin ve la cola (`hasReceipt=true`), abre el comprobante y confirma (-> `updateMany ... status PENDING` condicional + activación) o rechaza (`FAILED` + motivo; el admin puede reintentar). Transferencias PENDING sin comprobante >7 días: cron las pasa a FAILED (`rejectionReason:'Expirada'`) en `lib/cron.ts`.
**Notificación**: email al admin del gym al confirmar/rechazar y al superadmin cuando llega un comprobante (usar la infra de EmailTemplate existente; opcional fase 2).

## 4. Seguridad

- Multi-tenancy: endpoints de gym derivan `gymId` del JWT; el `paymentId` de la URL se verifica con `findFirst({ id, gymId })`. Endpoints de superadmin leen por `id` (rol global) y la activación usa `payment.gymId`, **jamás un gymId del body**. RLS sobre `GymSubscriptionPayment` sigue aplicando a las rutas de gym.
- SUPER_ADMIN con `gymId: null`: solo `/superadmin/*`. Rutas `/gyms/me/*` usan `requireAdmin` + chequeo `if (!user.gymId) 400`. No hay endpoint de gym que lea `billingGateways` crudo.
- Secretos: nunca en respuesta (solo enmascarados), nunca en logs (no loggear body del PUT ni params firmados de Flow), nunca en `gatewayData` (guardar solo token/flowOrder/sandbox). Arreglar el spread de `/superadmin/config` (hallazgo 1). `GET /gyms/me/billing/gateways` usa lista blanca de campos, no `maskGateways`.
- Comprobantes: bajo `/uploads` con token de medios (`authenticateMedia`); un gym solo ve los de su `gymId`; el SUPER_ADMIN debe poder verlos -> verificar que `authenticateMedia` acepte SUPER_ADMIN (si no, agregar regla). Validar mime por magic bytes, nombre generado por el servidor, `safeResolvePath`.
- Rate limit: `/gyms/me/subscription/checkout` y `/receipt` (ej. 10/min por gym) para evitar spam de órdenes; confirm Flow 60/min/IP; PUT superadmin sin cambio. No son endpoints de `/auth`, no requieren `authRateLimit`.
- Idempotencia: transición condicional `PENDING -> PAID` (`count===1`) + `@@unique([gateway, gatewayOrderId])`. Doble confirm de superadmin (doble clic) -> 409.
- Anti-fraude de monto: monto del servidor, comparación con el monto devuelto por Flow, plan debe estar activo y no gratuito.
- Superadmin PUT/confirm/reject: auditoría (userId + acción), sin valores secretos.

## 5. Cambios al código existente

- `superadmin/gym-payments.routes.ts`: eliminar `/flow/create`; `/flow/confirm` -> alias del handler nuevo y luego borrar; `/manual` y `/refund` pasan por el service compartido (`/manual` activa de verdad y valida que plan y gym existan; `/refund` exige `status==='PAID'`); `getGatewaysForCountry` se reemplaza por `listEnabledBillingGateways(country)` + `manual` (GET `/gym-payments/gateways/:gymId` sigue existiendo para el selector del superadmin). Validar `gymId/planId` con `findUnique` (hoy no se valida el plan).
- `superadmin/config.routes.ts`: lista explícita de campos en GET/PATCH (omitir `billingGateways`).
- `lib/secrets.ts`: `maskGateways(gateways, publicFields = PUBLIC_GATEWAY_FIELDS)` y `mergeGateways(stored, incoming, publicFields)`; exportar `BILLING_PUBLIC_FIELDS`. Sin romper la firma actual (los tests existentes de gyms deben pasar igual).
- Nuevo servicio compartido `activateGymSubscriptionFromPayment(paymentId)` (en `gym-billing.service.ts`; payments-specialist adapta `activateGymSubscriptionFromStripe` para delegar): en `$transaction`: leer pago PAID, `base = max(now, endsAt de la sub TRIAL/ACTIVE vigente)`, **crear nueva `GymSubscription` ACTIVE** (`planId` del pago, `startsAt=base`, `endsAt=base+durationDays`), pasar las anteriores TRIAL/ACTIVE a CANCELLED, `gym.status='ACTIVE'`, enlazar `payment.subscriptionId`. Elimina la fila placeholder `EXPIRED` del checkout actual (corrige hallazgo 3).
- `payments.service.ts::createGymSubscriptionCheckout` (payments-specialist): recibe credenciales del resolver (cliente Stripe instanciado por config en vez del singleton de env), crea el pago PENDING con `gatewayOrderId=session.id`, y el webhook Stripe hace la transición condicional. Verificación del webhook con `webhookSecret` de DB y fallback env.
- `gyms.routes.ts`: nuevas rutas delegan a `gym-billing.service`; el handler de checkout valida con Zod en vez de `request.body as any`.
- Web: `superadmin/config/page.tsx` nueva sección "Pasarelas de cobro" (3 tarjetas: toggle enabled, sandbox, campos secretos con máscara y botón "Borrar credencial" que envía `null`; indicador de origen db/env); `superadmin/payments` cola de transferencias con visor de comprobante, Confirmar/Rechazar; vista de suscripción del gym: selector de pasarelas desde GET `/gyms/me/billing/gateways`, redirect Flow, pantalla de transferencia (datos bancarios + subir comprobante + estado) y sondeo de `/gyms/me/subscription` al volver. Mobile: sin cambios.

## 6. Orden de implementación
1. Migración + schema + `secrets.ts` parametrizado + resolver + endpoints superadmin de config (+ fix spread en config.routes). Desplegable solo, no cambia comportamiento (fallback env).
2. Servicio de activación compartido + Flow admin-initiated + confirm idempotente + transferencia (checkout, receipt, confirm/reject, cron de expiración) + ajustes de `/manual` `/refund`.
3. Stripe unificado (payments-specialist) y retiro de alias/rutas viejas.
4. Web (config superadmin, cola de transferencias, pantalla de suscripción del gym). Puede arrancar tras fijar los Zod de la fase 1-2.
5. qa-engineer; security obligatorio antes de deploy (endpoint público nuevo + manejo de credenciales + upload).

## 7. Tests requeridos
Unit: `maskGateways/mergeGateways` con campos públicos de transfer, `null` borra, máscara conserva; resolver (DB manda sobre env, `enabled:false` explícito gana, fallback env, Flow solo CL, sandbox->URL); firma Flow HMAC; `activateGymSubscriptionFromPayment` (extiende desde `endsAt` vigente, cambio de plan, gym SUSPENDED -> ACTIVE, doble llamada no duplica); generación de `reference`.
Integración (DB real, como el resto): 
- PUT config: respuesta y GET nunca contienen secretos en claro; `null` borra; enabled sin credenciales -> 422; ADMIN/COACH -> 403; `GET /superadmin/config` ya no incluye `billingGateways`.
- GET `/gyms/me/billing/gateways` solo activas, sin secretos, país no-CL sin Flow; SUPER_ADMIN sin gymId -> 400.
- Checkout: `gateway` inactiva -> 400; plan inactivo/gratuito/inexistente; monto proviene del plan (ignora monto del body); transferencia duplicada devuelve la misma.
- Flow confirm: token válido (mock del `fetch` a Flow) activa 1 vez; segundo envío no-op (`count===0`, una sola sub nueva); monto distinto -> no activa; `commerceOrder` desconocido -> 200 sin efecto; sin token -> 400.
- Transferencia: receipt de otro gym -> 404; tipo/size inválido; superadmin confirm -> PAID + sub; confirm doble -> 409; reject guarda motivo y no activa; admin no puede confirmar (403).
- RLS (`rls.integration.test.ts`): admin gym A no ve pagos/receipts de gym B vía `/gyms/me/subscription/payments`.
- Alias `/superadmin/gym-payments/flow/confirm` sigue funcionando hasta su retiro.
E2E (manual en sandbox Flow cuando exista cuenta; bloqueado hoy por el alta de Flow): flujo completo de renovación.

## 8. Decisiones abiertas (para Cristian)
- D1: ¿cifrar credenciales en reposo (AES-256-GCM con `BILLING_ENCRYPTION_KEY` en env)? Recomendado, pero hoy `smtpPass` y `Gym.paymentGateways` van en claro; hacerlo solo aquí crea inconsistencia.
- D2: ¿Stripe se configura también en DB (fase 3) o se deja solo por env mientras no esté activo en Chile?
- D3: ¿Se confirma que la renovación crea una fila `GymSubscription` nueva (corrige el bug de cambio de plan/días perdidos) en vez de reutilizar la vigente?
- D4: Expiración de transferencias sin comprobante a 7 días (propuesta): ¿ok?
- D5: ¿Un gym con `GymSubscription` ACTIVE puede pagar adelantado (extiende desde `endsAt`)? Se asume que sí.
