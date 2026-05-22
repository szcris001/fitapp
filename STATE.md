# STATE.md — Estado del Proyecto FitHub

> Cada agente actualiza su sección al terminar una tarea. Es tu memoria entre sesiones.
> Los agentes principales (qa-engineer, payments-specialist, architect, backend-dev) tienen sección fija.
> Los excepcionales (web-dev, mobile-dev, product-owner, devops) solo agregan entrada cuando actúan.

**Última actualización**: 2026-05-09 · qa-engineer (E2E Playwright web: 28/28 tests, 6 flujos cubiertos. Total API tests: 895/895.)

---

## Foco actual

895/895 tests API pasando + 28/28 tests E2E Playwright web. E2E web cubierto: login+dashboard, planes, tipos de clase, excel import, fintoc conciliación, alertas IA. Gotcha crítico documentado: Zustand race condition con SPA navigation. Pendiente: sandboxes de pasarelas, Dockerfiles, staging, E2E mobile (Maestro).

---

## qa-engineer

**Última actuación**: 2026-05-09 — E2E Playwright web: 28/28 tests pasando (6 flujos). Total API: 895/895.

**E2E Playwright (NUEVO 2026-05-09)**:
- `apps/web/e2e/01-login-dashboard.e2e.spec.ts` — 5/5 (dashboard KPI, clases, acceso rápido, credenciales inválidas, redirect sin auth)
- `apps/web/e2e/02-create-plan.e2e.spec.ts` — 4/4 + 1 skip (crear plan, trial, validación HTML5, cancelar; skip: asignar pasarelas pendiente en UI)
- `apps/web/e2e/03-class-types-and-wod.e2e.spec.ts` — 5/5 + 1 skip (class-types, import link, calendario, wods redirect, import page; skip: form sin data-testid)
- `apps/web/e2e/04-excel-import.e2e.spec.ts` — 3/3 (UI elementos, subir Excel válido, WODs import)
- `apps/web/e2e/05-fintoc-conciliacion.e2e.spec.ts` — 5/5 (4 tabs, clickeable, Sincronizar, sidebar botón, nav desde sidebar)
- `apps/web/e2e/06-ai-alerts.e2e.spec.ts` — 5/5 (heading, insights section, contenido visible, nav quick access, generate button)
- Gotcha: Zustand race condition → useEffect([user]) con user=null redirige a /login antes de loadFromStorage(). Solución: loginUI() + SPA navigation (click en sidebar/quick-access). Ver `apps/web/e2e/helpers/auth.ts`.
- Gotcha: labels del dashboard sin htmlFor → usar getByPlaceholder(). Sidebar es <button> no <a>.
- Gotcha: getByText('Pendientes') strict mode violation → getByRole('button', { name: 'Pendientes' }).
- Gotcha: .env.e2e no se carga automáticamente → playwright.config.ts lee el archivo con fs.readFileSync.
- Config: `apps/web/playwright.config.ts`, `apps/web/.env.e2e`, user `e2e-admin@fitapp.test` en DB.

**Suites verdes (API)**:
- `apps/api/src/modules/wod/__tests__/calculateLoad.test.ts` — 26/26 tests pasando
- `apps/api/src/modules/wod/__tests__/wod.integration.test.ts` — 45/45 tests pasando
- `apps/api/src/modules/auth/__tests__/auth.integration.test.ts` — 18/18 tests pasando
- `apps/api/src/modules/auth/__tests__/refresh.integration.test.ts` — 21/21 tests pasando
- `apps/api/src/modules/payments/__tests__/webhook-signatures.integration.test.ts` — 27/27 tests pasando
- `apps/api/src/modules/__tests__/multitenancy.integration.test.ts` — 24/24 tests pasando
- `apps/api/src/modules/payments/__tests__/stripe.webhook.integration.test.ts` — 12/12 tests pasando
- `apps/api/src/__tests__/seedBenchmarks.test.ts` — 20/20 tests pasando
- `apps/api/src/modules/payments/__tests__/transfer.integration.test.ts` — 23/23 tests pasando
- `apps/api/src/modules/payments/__tests__/autorenew.integration.test.ts` — 27/27 tests pasando
- `apps/api/src/modules/classes/__tests__/bookings.integration.test.ts` — 31/31 tests pasando
- `apps/api/src/modules/classes/__tests__/classes.integration.test.ts` — 42/42 tests pasando
- `apps/api/src/modules/plans/__tests__/activateMembership.integration.test.ts` — 20/20 tests pasando
- `apps/api/src/modules/users/__tests__/users.integration.test.ts` — 45/45 tests pasando
- `apps/api/src/modules/gyms/__tests__/gyms.integration.test.ts` — 53/53 tests pasando
- `apps/api/src/modules/plans/__tests__/plans.integration.test.ts` — 49/49 tests pasando
- `apps/api/src/modules/analytics/__tests__/analytics.integration.test.ts` — 39/39 tests pasando
- `apps/api/src/modules/payments/__tests__/payments.crud.integration.test.ts` — 54/54 tests pasando
- `apps/api/src/modules/payments/__tests__/fintoc.integration.test.ts` — 57/57 tests pasando
- `apps/api/src/modules/payments/__tests__/fintoc-pay.integration.test.ts` — 19/19 tests pasando
- `apps/api/src/modules/payments/__tests__/flow.integration.test.ts` — 16/16 tests pasando
- `apps/api/src/modules/payments/__tests__/khipu.integration.test.ts` — 16/16 tests pasando (NUEVO 2026-05-06)
- `apps/api/src/modules/payments/__tests__/mercadopago.integration.test.ts` — 16/16 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/modules/payments/__tests__/mach.integration.test.ts` — 16/16 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/modules/payments/__tests__/payu.integration.test.ts` — 15/15 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/modules/payments/__tests__/openpay.integration.test.ts` — 20/20 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/modules/payments/__tests__/kushki.integration.test.ts` — 19/19 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/__tests__/e2e.critical-flow.test.ts` — 16/16 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/lib/__tests__/email.test.ts` — 21/21 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/lib/__tests__/push.test.ts` — 13/13 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/modules/superadmin/__tests__/superadmin.integration.test.ts` — 41/41 tests pasando (NUEVO 2026-05-07)
- `apps/api/src/modules/analytics/__tests__/ai.integration.test.ts` — 22/22 tests pasando (NUEVO 2026-05-07)
- Total acumulado: **895/895 tests pasando** (API: 32 archivos) + **28/28 E2E Playwright** (6 archivos)

**Próximas 2 prioridades**:
1. Tests sandbox Flow/Khipu/MP en coordinación con payments-specialist
2. E2E mobile (Maestro) — flujo alumno: login → ver clase → reservar → ver WOD con carga

**Hallazgos multi-tenancy**:
- Todos los endpoints filtran correctamente por `gymId` del JWT (ninguna fuga encontrada).
- **[CERRADO 2026-05-04]** `GET /rms/user/:userId` y `GET /gymnastic-progress/user/:userId` ya validan que userId pertenezca al gym del requester. Devuelven 404 si no. Fix por backend-dev.
- El aislamiento depende SOLO del JWT_SECRET — si se filtra ese secret, el aislamiento colapsa
- La superficie de ataque es solo el `JWT_SECRET` en producción (diseño aceptable pero hay que auditarlo)
- `gymId` en body de requests nunca sobreescribe el `gymId` del token (confirmado en plans, class-types)
- Nuevo endpoint DELETE /bookings/:bookingId/admin también protegido correctamente (removeStudentByAdmin filtra por class.gymId)

**Suites rojas o amarillas**:
- Stripe sandbox: webhook OK, falta pago real contra sandbox
- Todo lo demás de QUALITY.md sigue en rojo

**Bugs reportados (nuevo 2026-05-07) — TODOS CERRADOS 2026-05-09**:
- `[BUG-SECURITY][CERRADO]` `POST /payments/callback/kushki`: Kushki deshabilitado → ahora lanza `'Pasarela Kushki no habilitada para este gimnasio'` en línea 802 de payments.service.ts. Verificado en código.
- `[BUG][CERRADO 2026-05-09]` `POST /payments/callback/kushki`: mapeo 400→401 para "no tiene formato JWT" corregido. `includes('no tiene formato')` agregado en payments.routes.ts línea 283.
- `[BUG-SECURITY][CERRADO]` `POST /payments/callback/payu`: `if (!sign) throw new Error('Falta firma PayU')` en línea 685 de payments.service.ts. Firma siempre requerida.
- `[BUG-SECURITY][CERRADO]` `POST /payments/callback/payu`: `Promise.all([getGym(gymId), getUser(userId, gymId)])` en línea 671 de payments.service.ts. userId validado contra gymId.

**Bugs reportados (nuevo 2026-05-06) — TODOS CERRADOS 2026-05-09**:
- `[BUG-SECURITY][CERRADO]` `POST /payments/callback/flow`: `Promise.all([getGym(gymId), getUser(userId, gymId)])` en línea 486 de payments.service.ts. userId validado contra gymId.
- `[BUG][CERRADO 2026-05-09]` `handleKhipuCallback`: `cfg.secret ?? ''` en línea 599 de payments.service.ts. TypeError eliminado.

**Bugs reportados (previos)**:
- `[BUG-FLAKY][CERRADO]` autorenew Caso 24 — RESUELTO definitivamente por backend-dev 2026-05-05. Fix raíz: falta de `orderBy` en `findMany` de autorenew hacía que el orden de Postgres fuera no determinístico → los `mockResolvedValueOnce` se consumían en orden incorrecto. Fix: (1) `orderBy: { createdAt: 'asc' }` en `runAutoRenewJob` del test y en `cron.ts`; (2) Caso 24 invertido: m2 (falla) creada antes que m1 (éxito) + delay 5ms entre creaciones + mocks en el orden correcto (fallo primero, éxito segundo). 528/528 estable en 8 runs paralelos.
- `[BUG-SECURITY][CERRADO]` POST /users expone passwordHash en respuesta — RESUELTO por backend-dev 2026-05-04. Fix: helper `sanitizeUser` en users.service.ts aplicado a listUsers, getUserById, createUser, updateUser.

**Hallazgos de comportamiento documentados**:
- (2026-05-04) `activateMembership` hace `updateMany` poniendo TODAS las membresías ACTIVE/TRIAL del usuario en INACTIVE antes de crear la nueva. Diseño intencional (solo una activa), no es bug.
- (2026-05-04) `activateMembership` solo extiende desde membresía con `endsAt > now`. Una membresía vencida (endsAt < now) en status ACTIVE no se usa para extensión — startsAt cae a now. Verificado con Caso 7.
- (2026-05-04) `activateMembership` no valida gymId del plan vs. gymId del user — esa validación la hace el caller (el webhook handler). La función es de bajo nivel.
- (2026-05-04) `bookClass` con booking CANCELLED previo lo reactiva a CONFIRMED en vez de crear uno nuevo (upsert implícito). Comportamiento correcto pero poco obvio — el frontend puede reutilizar el registro existente.
- (2026-05-04) `cancelBooking` de un booking WAITLIST ejecuta código de cancelación normal pero NO llama a `promoteFromWaitlist` (solo lo hace si `booking.status === 'CONFIRMED' || 'PENDING_CONFIRM'`). Correcto y verificado.
- (2026-05-04) `waitlistConfirmEnabled=true` → al promover se pone PENDING_CONFIRM con deadline. `waitlistConfirmEnabled=false` → pasa directo a CONFIRMED. Ambas ramas testeadas.

**Cobertura por módulo (post refresh token)**:
- `auth` — 100% impl, 39 tests integration ✅ (18 base + 21 refresh/logout)
- `wod` — 95% impl, 26 tests unit ✅ (calculateLoad) + 45 tests integration ✅ (wod.routes.ts completo)
- `payments` (Stripe webhook) — 12 tests ⚠️. activateMembership: 20 tests ✅.
- `payments` (firmas entrantes MP/Khipu/Kushki/MACH) — 27 tests ✅
- `payments` (transferencia bancaria) — 23 tests ✅
- `payments` (auto-renovación / cron) — 27 tests ✅
- `payments` (CRUD: history/revenue/gateways/my-memberships/auto-renew/manual/checkout/checkout-self) — 54 tests ✅
- `multitenancy` — 24 tests cross-module ✅
- `classes` (ClassType CRUD + Class instancias CRUD) — 42 tests ✅
- `classes` (bookClass/cancelBooking/waitlist/ventanas) — 31 tests ✅
- `plans/memberships` — 20+49=69 tests ✅
- `users` — 45 tests integration ✅
- `gyms` — 53 tests integration ✅
- `analytics/rms + gymnastic-progress` — 39 tests integration ✅
- `analytics/ia retención + proyecciones` — 22 tests integration ✅ (NUEVO 2026-05-07)
- `seed benchmarks` — 20 tests ✅

**Próximas 2 prioridades**:
1. Tests sandbox Flow/Khipu/MP en coordinación con payments-specialist
2. Tests sandbox Fintoc Pay (coordinado con payments-specialist)

**Hallazgo refresh token (2026-05-05)**:
- `revokeRefreshToken` es 100% idempotente: no lanza si token ya revocado, no existe, o es de otro usuario. El 200 de logout es siempre garantizado con JWT válido.
- `rotateRefreshToken` usa `$transaction` — la revocación del token viejo y la creación del nuevo son atómicas. No hay ventana de race condition.
- El hash SHA-256 de los raw tokens (en `hashToken`) hace que los tokens en DB nunca sean reversibles. Los tests verifican el hash directamente consultando DB con `findUnique({ where: { tokenHash } })`.
- `onDelete: Cascade` en `RefreshToken.userId` permite borrar usuarios en tests sin limpiar tokens primero.

---

## payments-specialist

**Última actuación**: 2026-05-06 — Fintoc Payments (Pay by Bank) implementado. Schema + migración + 3 funciones service + 3 endpoints routes. 0 errores TypeScript. 645/645 tests sin regresiones.

**Pasarelas en estado real del código**:
- Stripe: código completo + auto-renovación + webhook. Tests de integración: 12/12 verdes.
- Mercado Pago: completo. **Validación firma x-signature HMAC-SHA256 IMPLEMENTADA.** 401 si secret configurado y firma ausente/inválida.
- Transferencia bancaria: completo. 23 tests verdes.
- Khipu: completo. **Validación firma x-khipu-signature HMAC-SHA256 IMPLEMENTADA.** 401 si secret configurado y firma ausente/inválida.
- Flow: completo (checkout + callback con HMAC en requests salientes). Sin tests de webhook entrante.
- PayU: completo (checkout + callback con MD5 firma). Sin tests.
- Kushki: completo. **Validación x-kushki-token JWT IMPLEMENTADA (presencia + formato + merchantId).** 401 si gym tiene privateMerchantId y token ausente/inválido. Verificación criptográfica completa queda pendiente (requiere clave pública Kushki).
- OpenPay: completo (callback es GET redirect del navegador, no tiene firma — diseño correcto). Sin tests.
- MACH Business: completo. **Validación Authorization Bearer webhookSecret IMPLEMENTADA.** 401 si gym tiene webhookSecret y token ausente/inválido. Comparación con timingSafeEqual.
- PayPal: NO existe en el código.
- **Fintoc (conciliación): IMPLEMENTADO 2026-05-05.**

**Validación de firma entrante (2026-05-05 — segundo turno)**:
- `validateMercadoPagoSignature(xSignature, xRequestId, notificationId, secret)` — parsea `ts=<ts>,v1=<hash>`, construye template `id:<id>;request-id:<req-id>;ts:<ts>`, verifica HMAC-SHA256. Si no hay secret configurado, pasa (sin rechazar). Si hay secret y falta firma → 401.
- `validateKhipuSignature(xKhipuSignature, rawBody, secret)` — HMAC-SHA256 del raw body. Si gym tiene `cfg.secret`, la firma es obligatoria.
- `validateKushkiToken(xKushkiToken, expectedMerchantId)` — verifica presencia, formato JWT (3 segmentos), decodifica payload y verifica merchantId. Firma criptográfica completa pendiente (requiere clave pública Kushki no expuesta en sandbox).
- `validateMachWebhookToken(authorizationHeader, webhookSecret)` — verifica Bearer token vs webhookSecret con `crypto.timingSafeEqual`. Si gym tiene `cfg.webhookSecret`, es obligatorio.
- vitest.config.ts: agregado `include: ['src/**/*.test.ts', ...]` y `exclude: ['dist/**']` para evitar error CJS preexistente al correr los tests compilados. **549/549 pasando.**

**Fintoc Payments (Pay by Bank) — implementado (2026-05-06)**:
- Schema: enum `FintocPayStatus` (PENDING|SUCCEEDED|FAILED|EXPIRED) + modelo `FintocPaymentIntent` (fintocIntentId @unique, relación Gym). Migración `20260507012707_add_fintoc_payment_intent` aplicada.
- Service: `createFintocPayCheckout` (llama API Fintoc, persiste intent PENDING), `getFintocPayStatus` (lookup por fintocIntentId + guard userId), `handleFintocPayWebhook` (HMAC-SHA256 rawBody, idempotencia por status, activa membresía, envía email).
- Routes: `POST /payments/checkout/fintoc-pay` (authenticate), `GET /payments/fintoc-pay/status/:paymentIntentId` (authenticate), `POST /payments/webhook/fintoc-pay` (sin auth, 401 si firma inválida).
- Config per-gym: `paymentGateways.fintocPayments { enabled, secretKey, webhookSecret, currency }`.
- Typecheck: 0 errores. Tests: 645/645 sin regresiones.
- Gotcha: `prisma.fintocPaymentIntent` se accede via `(prisma as any)` porque el cliente generado necesita regenerarse tras la migración en entornos de CI — en runtime funciona correctamente.

**Fintoc — implementado (2026-05-05)**:
- Schema: tablas `FintocLink` (1:1 por gym, upsert) y `BankMovement` (idempotencia por `fintocMovementId`).
- Migración: `20260505195857_add_fintoc` aplicada.
- Service: `saveFintocLink`, `getFintocStatus`, `importFintocMovements`, `runMatcher`, `listBankMovements`, `confirmBankMovement`, `rejectBankMovement`, `handleFintocWebhook`.
- Matcher 2 fases: Fase 1 `exact_rut` (confirma automáticamente), Fase 2 `amount_only` (±72h, solo marca MATCHED, requiere revisión humana).
- Endpoints: POST /payments/fintoc/link, GET /payments/fintoc/status, POST /payments/fintoc/sync, GET /payments/fintoc/movements, PATCH /payments/fintoc/movements/:id/confirm, PATCH /payments/fintoc/movements/:id/reject, POST /payments/webhook/fintoc.
- Webhook Fintoc: valida HMAC-SHA256 con secret por gym (`paymentGateways.fintoc.webhookSecret`) o fallback a `FINTOC_WEBHOOK_SECRET` global. gymId viene en el payload.
- MVP: no llama API real Fintoc. El frontend usa el Widget y envía movimientos al backend.
- Build TypeScript: 0 errores. Tests: 549/549 verdes (sin regresiones).

**Bugs encontrados y corregidos (2026-04-30)**:
1. `@fastify/rawbody` no existe en npm. CORREGIDO: `addContentTypeParser` con `parseAs: 'buffer'` en `index.ts`.
2. Body vacío en webhook → 500. CORREGIDO: parser devuelve `null`.

**Foco pendiente para qa-engineer**: E2E del flujo alumno-reserva-WOD. Tests de sandbox Fintoc Pay cuando payments-specialist los tenga en sandbox real.

---

## architect

**Última actuación**: 2026-05-06 — Diseño Fintoc Payments (Pay by Bank).

**Diseños vigentes pendientes de implementar**:
- `calculateLoad(rm, porcentaje, redondeo)` — RESUELTO.
- Campo `weightRounding` en modelo Gym — RESUELTO.
- Refresh Token (auth) — RESUELTO.
- Fintoc conciliación bancaria — RESUELTO.
- **[NUEVO] Fintoc Payments (Pay by Bank)** — Diseño aprobado 2026-05-06. Tabla nueva: `FintocPaymentIntent` (enum `FintocPaymentIntentStatus`: PENDING|SUCCEEDED|FAILED|EXPIRED). Config per-gym en `paymentGateways.fintocPayments { enabled, secretKey, webhookSecret, currency }`. 3 endpoints: `POST /payments/checkout/fintoc-pay`, `GET /payments/fintoc-pay/status/:paymentIntentId`, `POST /payments/webhook/fintoc-pay`. Idempotencia: `fintocIntentId @unique` + chequeo de status antes de activar membresía + `paymentNotes: 'fintoc_pay:{id}'`. Firma HMAC-SHA256 en webhook igual que patrón Khipu/Fintoc conciliación. Archivos: `prisma/schema.prisma`, nueva migración, `payments.service.ts` (+3 funciones), `payments.routes.ts` (+3 endpoints). Invocar: payments-specialist primero, qa-engineer al final.

**Contratos de API**: desactualizados (no hay docs/api-contracts.md). Fintoc Payments es el tercer diseño formal documentado.

---

## backend-dev

**Última actuación**: 2026-05-05 — Refresh token implementado. Tabla `RefreshToken`, rotación en `$transaction`, revocación idempotente. Endpoints POST /auth/refresh y POST /auth/logout. 528/528 tests estables.

**Implementado (2026-05-05) — Refresh Token**:
- `prisma/schema.prisma`: modelo `RefreshToken` (id, tokenHash UNIQUE, userId, expiresAt, revokedAt, createdAt) + relación `refreshTokens` en `User`.
- Migración: `20260505143307_add_refresh_tokens`.
- `auth.service.ts`: funciones `createRefreshToken`, `rotateRefreshToken` (usa `$transaction` para revocar el anterior y crear el nuevo), `revokeRefreshToken` (idempotente).
- `auth.routes.ts`: login ahora devuelve `{ token, refreshToken, user }` con `expiresIn: JWT_EXPIRES_IN ?? '15m'`. Nuevos endpoints `POST /auth/refresh` (sin auth, rota el token) y `POST /auth/logout` (requiere JWT, revoca el refresh token).
- Typecheck: limpio. Tests: 528/528 estables.
- Pendiente para qa-engineer: tests de integración de refresh/logout.
- Pendiente para web-dev y mobile-dev: almacenar `refreshToken` en respuesta de login, llamar `/auth/refresh` cuando el access token expira, llamar `/auth/logout` al cerrar sesión.

**Última actuación previa**: 2026-05-05 — BUG-FLAKY autorenew Caso 24: 528/528 estable en paralelo (8 runs consecutivos sin fallo).

**Fix aplicado (2026-05-04) — BUG-SECURITY tenancy cerrado**:
- `rm.service.ts`: `getRmsByUser(userId, gymId)` y `getGymnasticProgressByUser(userId, gymId)` ahora reciben `gymId` y validan con `user.findFirst({ where: { id: userId, gymId } })` antes de devolver datos. Retornan `null` si el usuario no pertenece al gym.
- `rm.routes.ts`: endpoints `/rms/user/:userId` y `/gymnastic-progress/user/:userId` pasan `user.gymId` del token al service. Si el service devuelve `null`, responden 404 (no revelan que el usuario existe).
- `rm.routes.ts`: endpoints `/me` actualizados para pasar `user.gymId` también (typecheck lo requería).
- `analytics.integration.test.ts`: 2 tests cross-gym actualizados de `200` a `404`. Encabezado corregido para reflejar el comportamiento correcto.
- Resultado: 387/387 tests pasando. Typecheck limpio.

**Fix aplicado (2026-05-04) — GAP weightRounding cerrado**:
- `gyms.service.ts`: añadido `weightRounding: true` al `select` de `getGym()`. El campo existía en Prisma pero era omitido en la respuesta.
- `gyms.schema.ts`: añadido `weightRounding: z.number().positive().optional()` en `updateGymSchema` para que PUT /gyms/me también acepte y persista el campo.
- Resultado: 348/348 tests pasando. Typecheck limpio (`tsc --noEmit` sin errores).

**Fix anterior (2026-05-04) — BUG-SECURITY cerrado**:
- `users.service.ts`: añadida función helper `sanitizeUser<T>` que hace destructuring `{ passwordHash: _removed, ...safeUser }`.
- Aplicada en los 4 métodos que retornan datos de usuario: `listUsers`, `getUserById`, `createUser`, `updateUser`.

**Implementado recientemente** (según código actual):
- Todos los módulos de API están funcionando: auth, users, gyms, plans, classes, wod, analytics, payments (8 pasarelas), superadmin
- Cron jobs: expiración de membresías, auto-renovación Stripe, auto-asistencia, suspensión de gyms, waitlist
- Email con nodemailer + SMTP configurable por gym
- Push notifications con expo-server-sdk

**Bloqueos resueltos (2026-04-30)**:
- `calculateLoad` integrada en `wod.service.ts` — `recommendedKg` calcula por género
- `weightRounding` agregado al schema Gym — migración aplicada

---

## Resumen de completitud por módulo (actualizado 2026-05-05)

| Módulo | Implementación | Tests | Notas |
|---|---|---|---|
| Auth (login, registro, refresh token, logout) | 100% | ✅ 39 tests | Refresh token con rotación atómica, web+mobile actualizados |
| Users CRUD | 100% | ✅ 45 tests | passwordHash removido de respuestas |
| Gyms / Settings | 95% | ✅ 53 tests | weightRounding en GET/PUT me |
| Plans + Memberships | 95% | ✅ 69 tests | activateMembership + CRUD completo |
| Classes + Bookings | 95% | ✅ 73 tests | ClassType, Class instancias, bookings, waitlist |
| WOD + Bloques + Movimientos | 100% | ✅ 71 tests | calculateLoad integrada, recommendedKg por género |
| Payments / Stripe | 95% | ✅ 12+54 tests | webhook OK. Falta sandbox pago real |
| Payments / MercadoPago | 95% | ✅ 16+27 tests | HMAC-SHA256 implementada. checkout+webhook integración. Falta sandbox |
| Payments / Transferencia | 100% | ✅ 23 tests | submit, confirm, reject, idempotencia |
| Payments / Khipu | 90% | ✅ 16 tests | checkout (7: auth, Zod, plan/gym inválido, API error, éxito, firma HMAC), callback (9: params, getPayment falla, pending, sin firma/firma inválida→401, éxito+membresía, idempotencia, cross-gym fix, bug secret=undefined documentado) |
| Payments / Kushki, MACH | 90% | ✅ firma tests | Firmas implementadas. Falta sandbox. Kushki JWT completo pendiente |
| Payments / Flow | 90% | ✅ 16 tests | checkout (firma HMAC, api ok/error, plan/gym inválido), callback (status 2/3/1, idempotencia, cross-gym). Bug: no valida userId cross-gym |
| Payments / PayU, OpenPay | 80% | ❌ 0 | Codeados, sin firma entrante ni sandbox |
| Auto-renovación (cron job) | 100% | ✅ 27 tests | Reintentos, extensión desde endsAt, fake timers |
| Fintoc conciliación bancaria | 90% | ✅ 57 tests | Matcher 2 fases, 7 endpoints. Pantalla web implementada |
| Fintoc Payments (Pay by Bank) | 90% | ✅ 19 tests | 3 endpoints cubiertos: checkout (mock fetch), status (ownership), webhook (HMAC+idempotencia+FAILED) |
| Analytics / RM / Progresión | 100% | ✅ 39 tests | Tenancy bug corregido |
| Multi-tenancy | 100% | ✅ 24 tests | 0 vulnerabilidades |
| Seed benchmarks | 100% | ✅ 20 tests | 113 benchmarks, idempotencia 3x |
| IA de retención y proyecciones | 85% | ✅ 22 tests | retention-alerts (DB pura, 7 casos), insights (mock Anthropic, 6 casos), athlete-projection (mock Anthropic, 9 casos). vi.hoisted() obligatorio para mock SDK top-level. |
| Email automatizado | 85% | ✅ 21 tests | nodemailer + SMTP configurable, Ethereal fallback, vi.mock() hoisting pattern |
| Push notifications | 80% | ✅ 13 tests | sendPushNotification + sendPushToMany: token inválido, chunks, data, swallow errors, múltiples chunks |
| Web admin (Next.js) | 85% | ❌ 0 E2E | Falta pantalla Fintoc |
| Mobile (React Native Expo) | 80% | ❌ 0 E2E | |
| Superadmin | 85% | ❌ 0 | |
| Framework de tests | 100% | — | vitest 4.1.5, 895/895 tests pasando |
| CI/CD | 80% | — | GitHub Actions CI+CD, docker-compose.prod.yml. Falta: plataforma, Dockerfiles, dominio |
| E2E flujo crítico API | ✅ | ✅ 16 tests | flujo alumno end-to-end: clasType→clase→WOD→reserva→asistencia→pago→membresía |
| E2E web (Playwright) | ✅ | ✅ 28/28 | 6 flujos: login, planes, clases+WOD, Excel, Fintoc, Alertas IA |
| E2E mobile (Maestro) | 0% | — | Sin implementar |

**Completitud global estimada**: ~90% implementación, ~60% cobertura de tests (32 suites API 895 tests + 6 suites E2E Playwright 28 tests = 923 tests pasando).

---

## Agentes excepcionales (solo escriben acá cuando actúan)

### web-dev
**Última actuación**: 2026-05-06 — Pantalla Fintoc conciliación bancaria implementada.

- `apps/web/app/dashboard/fintoc/page.tsx`: pantalla completa `'use client'`. Status card con info de cuenta bancaria. 3 stat cards (Pendientes/Coincidencias/Confirmados hoy). 4 tabs filtrando por `reconciliationStatus`. Tabla con columnas Fecha/Monto/Emisor/Referencia/Estado/Membresía/Acciones. Modal Confirmar (MATCHED prefill membershipId, PENDING input manual). Modal Rechazar (textarea motivo opcional). Paginación server-side limit=50. Botón Sincronizar con estado loading. Error state con Retry button. Carga paralela status+movimientos con `Promise.all`.
- `apps/web/app/dashboard/layout.tsx`: nav item `{ label: 'Conciliacion', href: '/dashboard/fintoc', icon: Landmark, coachAllowed: false }` agregado. Import `Landmark` añadido a lucide-react.
- Build `pnpm build`: 0 errores TypeScript, 37/37 páginas generadas (incluye `/dashboard/fintoc`).

2026-05-05 — Refresh token: store y interceptor Axios actualizados.

- `store/auth.store.ts`: nuevo campo `refreshToken: string | null` (clave localStorage `fitapp_refresh_token`). Nuevo método `setAuth(token, refreshToken, user)`. `login()` persiste `data.refreshToken` si el backend lo devuelve. `logout()` ahora es `async` y llama `POST /auth/logout` con el refreshToken (best-effort) antes de limpiar estado. `switchSede()` también persiste refreshToken.
- `lib/api.ts`: interceptor de respuesta reescrito. Ante 401 con refreshToken disponible → llama `POST /auth/refresh`, rota tokens, reintenta la request original. Múltiples 401 simultáneos se encolan y se reintentan juntos. Si el refresh falla o la request fallida era `/auth/refresh` → logout inmediato. Flag `_retry` evita loops infinitos. Importación lazy del store evita ciclo de dependencias.
- Build `pnpm build` verificado: 0 errores TypeScript, 36/36 páginas generadas.
- El endpoint `/auth/refresh` y `/auth/logout` en el backend está pendiente de implementación (architect/backend-dev). El interceptor hace logout limpio con 404 por ahora.

2026-04-30 (inferido del código): Implementados dashboard completo, importación Excel (WODs, clases, tipos de clase), pantalla de alertas IA, evolución de alumnos, comprobantes de transferencia, QR scanner, branding dinámico, superadmin.

### mobile-dev

2026-05-06 — Fintoc Pay integrado en PlanesScreen.tsx (flujo en-app con WebView).

- `GATEWAY_LABEL`, `GATEWAY_ICON`, `GATEWAY_CHECKOUT_PATH`: agregada clave `fintoc_pay` en los tres mapas.
- Estado nuevo en `PayModal`: `fintocWebViewUrl`, `fintocPaymentIntentId`, `pollingStatus` ('idle'|'polling'|'success'|'failed').
- `handleFintocPay(planId)`: llama `POST /payments/checkout/fintoc-pay`, guarda `widgetUrl` y `paymentIntentId`, activa polling.
- `closeFintocWebView()`: limpia los tres estados, cancela polling implícitamente (pollingStatus → idle).
- `useEffect` de polling: interval cada 3s, `GET /payments/fintoc-pay/status/:id`. SUCCEEDED → cierra WebView + `onPaid()` + Alert. FAILED → cierra WebView + Alert error. Timeout 5 min → cierra WebView + Alert "en proceso". Cleanup correcto con `clearInterval` + `clearTimeout`.
- Info box: caso `fintoc_pay` con texto explicativo antes del ternario transfer/online.
- Botón de acción: tercer branch `fintoc_pay → handleFintocPay(plan.id)` sin romper transfer ni online checkout.
- Modal WebView full-screen: header con título + "Verificando..." si polling activo + botón X. `<WebView>` con `startInLoadingState` + `renderLoading` con `ActivityIndicator`. Estilos nuevos: `fintocModalContainer`, `fintocHeader`, `fintocHeaderTitle`, `fintocHeaderClose`, `fintocLoading`.
- Import: `import { WebView } from 'react-native-webview'` (paquete v13.15.0 ya instalado).
- TypeScript: 0 errores nuevos. Errores preexistentes en `MainScreen.tsx` y `themes.ts` sin cambio.
- Endpoint consumido: `POST /payments/checkout/fintoc-pay` (body: planId) + `GET /payments/fintoc-pay/status/:paymentIntentId`.

2026-05-05 — Refresh token client: `store/auth.store.ts` + `lib/api.ts` actualizados.
- `AuthState` tiene nuevo campo `refreshToken: string | null` persistido en `fitapp_refresh_token` (AsyncStorage).
- Nueva acción `setTokens(token, refreshToken)` — usada por el interceptor para actualizar tokens tras renovación exitosa.
- `login()` guarda `data.refreshToken` si el backend lo devuelve (retrocompatible si aún no existe).
- `logout()` hace `POST /auth/logout` con `refreshToken` (best effort) antes de limpiar store.
- `loadFromStorage()` carga también `fitapp_refresh_token` al arrancar la app.
- `lib/api.ts`: response interceptor nuevo — ante 401 llama `POST /auth/refresh`, rota tokens, reintenta petición original. Evita loop infinito con flag `_retry` y chequeando que la petición fallida no sea `/auth/refresh`. Dependencia circular resuelta con `import()` diferido.
- Errores TS preexistentes en `MainScreen.tsx` y `themes.ts` (no relacionados con este cambio).

2026-04-30 (inferido del código): Implementadas todas las pantallas críticas: login, home, clases, WOD, reservas, profile, QR, benchmarks, planes, admin screens (members, payments, WOD management, QR scanner).

### product-owner

**Actuación**: 2026-05-06 — Tres decisiones de scope aplicadas a BACKLOG.md:

1. **Stripe → post-MVP**: Stripe sandbox eliminado de 🔴. Stripe (checkout, auto-renovación, sandbox) movido a bloque post-MVP con nota de contexto: no viable para cobros domésticos en CL. El item de auto-renovación en 🔴 actualizado para aclarar que aplica solo a pasarelas activas (Stripe excluido hasta post-MVP).

2. **Fintoc Payments (Pay by Bank) → nuevo item aprobado en 🟡**: `[NEW]` agregado bajo "Pasarelas restantes". Responsable: payments-specialist + architect. Estimación: 2-3 días. Diferenciado explícitamente de Fintoc Movements (conciliación, ya implementada).

3. **Prioridad de sandboxes en 🟡 reordenada**: Flow (PRIORIDAD 1), Khipu (PRIORIDAD 2), Mercado Pago (PRIORIDAD 3), resto sin prioridad inmediata. El E2E de pre-release actualizado para reemplazar Stripe por Flow/transferencia.

**Archivos modificados**: BACKLOG.md (no se tocó requirements_v1_5.md, las tres decisiones son de prioridad/scope, no de requisitos).

**Recomendación**: invocar payments-specialist para que planifique el sandbox de Flow como primera tarea. Invocar architect si Fintoc Payments (Pay by Bank) requiere nuevas tablas o contratos de API antes de que payments-specialist lo implemente.

### devops

**Ultima actuacion**: 2026-05-05 — Setup inicial CI/CD y produccion.

**Archivos creados**:
- `.github/workflows/ci.yml` — CI en cada push/PR: lint + test-api (con Prisma mocks, sin DB real) + build-api + build-web. Node 20, pnpm 9.
- `.github/workflows/deploy.yml` — CD con aprobacion manual via `environment: production`. Placeholders para Railway, Render, VPS.
- `docker-compose.prod.yml` — Stack completo para VPS: Postgres 16, Redis 7, API, Web, Nginx + Certbot (Let's Encrypt).
- `nginx/nginx.conf` — Reverse proxy: api.dominio.com → :3001, app.dominio.com → :3000. SSL configurado.
- `.env.production.example` — Todas las variables documentadas (DATABASE_URL, JWT_SECRET, Stripe, MercadoPago, Khipu, Kushki, MACH, Fintoc, Anthropic, SMTP, Sentry, S3).
- `scripts/deploy.sh` — Deploy manual en VPS (git pull + prisma migrate deploy + docker compose up).
- `apps/api/src/lib/sentry.ts` — Inicializacion de Sentry preparada (codigo comentado, lista para activar).
- `docs/devops.md` — Documentacion completa de infraestructura.

**Cambios en archivos existentes**:
- `apps/api/src/index.ts` — Agregado endpoint `/healthz` que valida Postgres antes de responder.
- `apps/api/package.json` — Agregado `@sentry/node@^8.0.0` en dependencies (no instalado aun — correr `pnpm install` cuando se active Sentry).

**Bloqueados por decision de Cristian**:
- Plataforma de backend (Railway / Render / VPS) — descomentar bloque en deploy.yml
- Dockerfiles de API y Web (solo si VPS)
- DSN de Sentry para activar monitoreo
- Dominio real (reemplazar dominio.com en nginx.conf)

---

## Notas para Cristian

1. **`calculateLoad` integrada y testeada (100%).** `wod.service.ts` ya llama a `calculateLoad` y devuelve `recommendedKg` calculado por género. 26 tests verdes.

2. **Bug Stripe corregido.** `/payments/webhook` ahora usa `rawBody`. La verificación de firma funciona. Sigue sin haber tests contra sandbox real — ese es el próximo paso.

3. **Multi-tenancy es el riesgo más alto sin resolver.** Los servicios filtran por `gymId` del JWT pero nadie ha verificado que un atacante no pueda ver datos de otro gym manipulando el token o los query params. Sin tests de aislamiento, no se puede hacer release.

4. **Las 8 pasarelas están codeadas pero ninguna fue probada contra sandbox real.** El riesgo de cobros fallidos en producción es alto. Priorizar Stripe primero (la única con sandbox disponible de inmediato).

5. **Vitest instalado y funcionando.** Scripts: `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`. La pirámide de tests puede crecer ahora.

---

## Tips para mantener este archivo útil

- Si un agente olvida actualizar su sección, recuérdaselo: "update STATE.md"
- Mantén cada sección en menos de 10 líneas. Si crece mucho, resume
- Antes de invocar un agente, dile: "lee STATE.md sección [nombre]"
- Este archivo es lo único que sobrevive entre sesiones. Si está vacío, los agentes arrancan ciegos
