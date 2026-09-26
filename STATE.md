# STATE.md — Estado del Proyecto FitHub

> Cada agente actualiza su sección al terminar una tarea. Es tu memoria entre sesiones.
> Los agentes principales (qa-engineer, payments-specialist, architect, backend-dev) tienen sección fija.
> Los excepcionales (web-dev, mobile-dev, product-owner, devops) solo agregan entrada cuando actúan.

**Última actualización**: 2026-06-25 · security (auditoría auth/multi-tenancy: 6 vulnerabilidades corregidas, RLS ampliado a 8 tablas adicionales)

---

## Foco actual

895/895 tests API pasando + 28/28 tests E2E Playwright web. WOD % RM implementado (migración `20260620010406_add_wod_movement_percentage`). Seguridad pre-deploy aplicada. Dockerfiles creados. Plataforma elegida: Railway. Pendiente: middleware RLS en Fastify, sandboxes de pasarelas, tests nuevos para % RM, staging, E2E mobile (Maestro).

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

**Última actuación**: 2026-06-11 — Diseño sistema WOD Results + Leaderboard.

**Diseños vigentes pendientes de implementar**:
- `calculateLoad(rm, porcentaje, redondeo)` — RESUELTO.
- Campo `weightRounding` en modelo Gym — RESUELTO.
- Refresh Token (auth) — RESUELTO.
- Fintoc conciliación bancaria — RESUELTO.
- Fintoc Payments (Pay by Bank) — RESUELTO.
- **[NUEVO] WOD Results + Leaderboard** — Diseño aprobado 2026-06-11. Enum nuevo: `WodScoreType` (TIME|REPS|WEIGHT|ROUNDS|CUSTOM). Campo nuevo en Wod: `scoreType WodScoreType @default(REPS)`. Tabla nueva: `WodResult` (gymId, wodId, userId, score Float, scoreText?, rx bool, notes?, recordedBy; unique wodId+userId; onDelete Cascade desde Wod). Relaciones en Gym/User/Wod. 4 endpoints: `POST /wods/:id/results` (COACH|ADMIN), `GET /wods/:id/leaderboard` (any auth), `PUT /wods/:id/results/:userId` (COACH|ADMIN), `DELETE /wods/:id/results/:userId` (COACH|ADMIN). Archivo nuevo: `wod.schema.ts`. formatScore en service. Invariante: userId en resultado debe pertenecer al gymId del JWT (validar con findFirst antes de insert). Migración: `add_wod_results_and_score_type`. Invocar: backend-dev primero, luego web-dev + mobile-dev en paralelo, qa-engineer al final.

**Contratos de API**: desactualizados (no hay docs/api-contracts.md). WOD Results es el cuarto diseño formal documentado.

---

## backend-dev

**Última actuación**: 2026-06-13 — Endpoint `PATCH /memberships/:id` para gestión administrativa de membresías. 0 errores TypeScript.

**Membresías siempre 30 días** (2026-06-13):
- `plans.service.ts`: `assignMembership` y `renewMembership` — `plan.durationDays` → `30`.
- `payments.service.ts`: 10 ocurrencias `endsAt.setDate(... + durationDays)` → `+ 30` (activateMembership, autoRenew trigger, 6 gateways email, manual, transfer). Línea 1823 (`fitPlan.durationDays`) es suscripción de plataforma FitApp — no tocada.

**Restricción de planes por clase** (2026-06-13):
- `prisma/schema.prisma`: many-to-many `ClassAllowedPlans` entre `Class` y `Plan`. Migración `20260613071332_add_class_allowed_plans`. `prisma generate` ejecutado.
- `classes.schema.ts`: `allowedPlanIds: z.array(z.string().uuid()).optional()` en `createClassSchema`. Nuevo `updateClassAllowedPlansSchema`.
- `classes.service.ts`: `createClass` con `allowedPlanIds`. `listClasses`/`getClassById` incluyen `allowedPlans`. `bookClass` valida que el plan activo del alumno esté en `allowedPlans` (si la clase tiene restricciones).
- `classes.routes.ts`: `POST /classes` pasa `allowedPlanIds`. `PATCH /classes/:id` soporta `allowedPlanIds`. Nuevo `PUT /classes/:id/allowed-plans` (set completo).
- Pendiente qa-engineer: bookClass con plan restringido/no-restringido, PUT allowed-plans, PATCH con allowedPlanIds.
- Pendiente web-dev: selector multi-plan en form de creación/edición de clase.

**Última actuación previa**: 2026-06-12 — Registro de asistencia enriquecido: campos `attended`/`attendedAt` en modelo `Booking` + 2 endpoints nuevos. 0 errores TypeScript.

**Asistencia enriquecida en Booking** (2026-06-12):
- `prisma/schema.prisma`: campos `attended Boolean @default(false)` y `attendedAt DateTime?` agregados al modelo `Booking`. Migración `20260612132834_add_attendance_to_booking` aplicada. `prisma generate` ejecutado.
- `classes.routes.ts` líneas 323-387: 2 endpoints nuevos insertados ANTES de `/my-bookings`:
  - `PATCH /classes/:id/bookings/:userId/attend` (preHandler: `requireCoachOrAdmin`) — marca/desmarca asistencia por composite key `userId_classId`. Actualiza `attended`, `attendedAt` y `status` (ATTENDED ↔ CONFIRMED) en sincronía.
  - `GET /classes/:id/attendees` (preHandler: `requireCoachOrAdmin`) — devuelve lista completa con totales `{ classId, total, attended, bookings[] }`.
- Gotcha: `prisma generate` fue necesario explícitamente para que los nuevos campos `attended`/`attendedAt` fueran reconocidos por el compilador TS (ver memoria `feedback_prisma_generate_after_migrate`).
- Pendiente para qa-engineer: tests de ambos endpoints (marcar, desmarcar, userId de otro gym, classId de otro gym, userId sin reserva, total/attended count correcto).
- Pendiente para web-dev y mobile-dev: consumir `PATCH /classes/:id/bookings/:userId/attend` con body `{ attended: boolean }` y `GET /classes/:id/attendees` con shape `{ classId, total, attended, bookings[{userId, userName, userEmail, userAvatar, status, attended, attendedAt, bookedAt}] }`.

**Última actuación previa**: 2026-06-12 — Endpoint `GET /users/export` para exportación de miembros en CSV. 0 errores TypeScript.

**Exportación de miembros CSV** (2026-06-12):
- `users.routes.ts`: nuevo endpoint `GET /users/export` (preHandler: `requireCoachOrAdmin`) insertado en línea 28, ANTES de `GET /users/:id` (línea 88) para evitar que "export" sea capturado como `:id`.
- Query params soportados: `format=csv` (default), `status=ACTIVE|INACTIVE|TRIAL|all` (default `all`), `role=MEMBER|COACH|ADMIN` (default `MEMBER`).
- Lógica: `prisma.user.findMany` con `gymId` del JWT, `include: memberships[take:1, orderBy:endsAt desc]`, genera CSV con BOM UTF-8 (para compatibilidad con Excel).
- Cabeceras: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="miembros_YYYY-MM-DD.csv"`.
- Campos CSV: Nombre, Email, Teléfono, RUT, Género, Plan activo, Vencimiento, Estado, Registrado. Campos con comas/comillas escapados con RFC 4180.
- Pendiente para qa-engineer: tests del endpoint (membresía ACTIVE vs TRIAL vs sin membresía, filtro por status, filtro por role, campos con coma en el nombre, respuesta vacía).
- Pendiente para web-dev: botón "Exportar CSV" en `/dashboard/usuarios` que llame `GET /users/export` y dispare descarga del archivo.

**Última actuación previa**: 2026-06-12 — Endpoints `/me` para resultados WOD de miembros. 2 endpoints nuevos. 0 errores TypeScript.

**WOD Results /me** (2026-06-12):
- `wod.routes.ts`: 2 endpoints nuevos para que miembros registren/consulten su propio resultado sin permisos de coach/admin.
  - `GET /wods/:id/results/me` (auth: solo JWT) — devuelve el resultado del usuario autenticado para ese WOD, o `null` si no existe.
  - `POST /wods/:id/results/me` (auth: solo JWT) — upsert del resultado propio. Body: `{ score, scoreText?, rx, notes? }`. `recordedBy` se setea al `userId` del JWT. Responde 201 con el resultado + `scoreFormatted`.
- Ambas rutas ubicadas ANTES del `PUT /wods/:id/results/:userId` para evitar que "me" sea capturado como `:userId`.
- Import estático de `zod` agregado en el top del archivo.
- Typecheck: `tsc --noEmit` sin errores.
- Pendiente para qa-engineer: tests upsert (crear, actualizar, gym incorrecto), GET null vs con resultado, validación Zod (score negativo, notes > 500 chars).
- Pendiente para mobile-dev: consumir `POST /wods/:id/results/me` (body `{score, scoreText?, rx, notes?}`) y `GET /wods/:id/results/me` para precargar el form.

**Última actuación previa**: 2026-06-11 — WOD Results + Leaderboard implementado. Schema + migración + 4 endpoints. 0 errores TypeScript.

**WOD Results + Leaderboard** (2026-06-11):
- `prisma/schema.prisma`: enum `WodScoreType` (TIME|REPS|WEIGHT|ROUNDS|CUSTOM). Campo `scoreType WodScoreType @default(REPS)` en modelo `Wod`. Relación `results WodResult[]` en `Wod`. Nuevo modelo `WodResult` (gymId, wodId, userId, score Float, scoreText?, rx bool, notes?, recordedBy; unique [wodId, userId]; onDelete Cascade desde Wod). Relaciones `wodResults`/`wodResultsRecorded` en `User`. Relación `wodResults` en `Gym`.
- Migración: `20260612033012_add_wod_results_and_score_type` aplicada. `prisma generate` ejecutado.
- `wod.routes.ts`: 4 endpoints nuevos: `POST /wods/:id/results` (upsert, coach|admin), `GET /wods/:id/leaderboard` (cualquier auth, query rx=all|true|false, rank independiente RX vs Scaled, formatScore TIME→M:SS), `PUT /wods/:id/results/:userId` (patch parcial, coach|admin), `DELETE /wods/:id/results/:userId` (coach|admin). PUT `/wods/:id` extendido con `scoreType` opcional. Función utilitaria `formatScore` en el mismo archivo. Interfaz `AuthUser` para tipado fuerte (sin `any` en el JWT user).
- Typecheck: `tsc --noEmit` sin errores.
- Pendiente para qa-engineer: tests de integración de los 4 endpoints + casos borde (userId de otro gym, doble upsert, leaderboard vacío, filtro rx, orden TIME ascendente vs REPS descendente).
- Pendiente para web-dev y mobile-dev: consumir `GET /wods/:id/leaderboard` y `POST /wods/:id/results` con shape `{ wodId, scoreType, total, entries[{rank, category, userId, user{id,name,avatarUrl}, score, scoreFormatted, rx, notes}] }`.

**Última actuación previa**: 2026-06-10 — Bug timezone en bookings corregido. Schema Gym +campo `timezone`. Helper `startOfDayUTC`.

**Fix timezone en bookings** (2026-06-10):
- `prisma/schema.prisma`: campo `timezone String @default("America/Santiago")` en modelo `Gym`. Migración `20260611014306_add_gym_timezone` aplicada.
- `classes.service.ts`: helper `startOfDayUTC(date, timezone)` calcula la medianoche real en la zona horaria del gym usando `Intl.DateTimeFormat`. Fix en `bookClass`: `dayStart/dayEnd` ahora calculados con la TZ del gym en lugar de `setUTCHours(0,0,0,0)`, que ubicaba clases nocturnas chilenas en el día UTC siguiente y bloqueaba reservas incorrectamente.
- `cron.ts`: `runPendingConfirmExpiryJob` incluye `class.startsAt` para calcular `minsUntilClass` al promover desde waitlist. Lógica `needsManualConfirm = waitlistConfirmEnabled && minsUntilClass > waitlistConfirmMins` (si hay poco tiempo antes de la clase, se confirma automáticamente aunque el modo sea manual).

**Última actuación previa**: 2026-05-05 — Refresh token implementado. Tabla `RefreshToken`, rotación en `$transaction`, revocación idempotente. Endpoints POST /auth/refresh y POST /auth/logout. 528/528 tests estables.

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
| Classes + Bookings | 97% | ✅ 73 tests | ClassType, Class instancias, bookings, waitlist, timezone fix |
| WOD + Bloques + Movimientos | 100% | ✅ 71 tests | calculateLoad integrada, recommendedKg por género, Results+Leaderboard implementados (sin tests aún) |
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
| Mobile (React Native Expo) | 88% | ❌ 0 E2E | HomeScreen refactorizado, ProgressScreen nueva, ProfileScreen limpiado, ClassesScreen mejorado |
| Superadmin | 85% | ❌ 0 | |
| Framework de tests | 100% | — | vitest 4.1.5, 895/895 tests pasando |
| CI/CD | 80% | — | GitHub Actions CI+CD, docker-compose.prod.yml. Falta: plataforma, Dockerfiles, dominio |
| E2E flujo crítico API | ✅ | ✅ 16 tests | flujo alumno end-to-end: clasType→clase→WOD→reserva→asistencia→pago→membresía |
| E2E web (Playwright) | ✅ | ✅ 28/28 | 6 flujos: login, planes, clases+WOD, Excel, Fintoc, Alertas IA |
| E2E mobile (Maestro) | 0% | — | Sin implementar |

**Completitud global estimada**: ~92% implementación, ~60% cobertura de tests (32 suites API 895 tests + 6 suites E2E Playwright 28 tests = 923 tests pasando).

---

## Agentes excepcionales (solo escriben acá cuando actúan)

### web-dev
**Última actuación**: 2026-06-23 — Refactor editor de clases: ClassPanel convertido de modal overlay a página dedicada.

- `apps/web/app/dashboard/classes/_components/ClassDetail.tsx` (NUEVO): contiene `ClassPanel` (exportado), `AttendanceSection`, `MovementPicker`, `WodEditorModal` y todas sus interfaces y helpers. `ClassPanel` en versión página: sin backdrop `fixed inset-0`, con botón "Volver" (`onClose → router.back()`), navegacion entre clases con `ChevronLeft/Right` horizontales, `h1` en lugar de `h2`. `WodEditorModal` mantiene su overlay `fixed inset-0 z-[59]` (correcto: se superpone dentro de la página). Confirm delete también mantiene su overlay.
- `apps/web/app/dashboard/classes/[classId]/page.tsx` (NUEVO): página `'use client'` que recibe `params: Promise<{classId}>` con `use()`, monta `<ClassPanel>` con `onNavigate→router.push`, `onClose→router.back()`, `onRefresh→router.refresh()`, `onDeleted→router.push('/dashboard/classes')`.
- `apps/web/app/dashboard/classes/page.tsx` (MODIFICADO): eliminados `AttendanceSection`, `ClassPanel`, `MovementPicker`, `WodEditorModal`, `ClassDetail`/`AttendeeBooking`/`AttendeesData` interfaces, `CF_MOVEMENTS` import, `API_BASE` import, lucide icons no usados. `openClass(id)` ahora hace `router.push('/dashboard/classes/' + id)` en lugar de `setSelectedId(id)`. Estado `selectedId` y render `<ClassPanel>` eliminados. `NewClassModal` y `ClassesParamsWatcher` conservados sin cambios. TypeScript: 0 errores (solo e2e/fixtures preexistentes).

**Pendiente para qa-engineer**: E2E del flujo click-en-clase → navega a `/dashboard/classes/:id` → sidebar visible, sin overlay; verificar botón Volver regresa al calendario; verificar flechas prev/next entre clases; verificar WOD editor se abre como overlay dentro de la página; verificar editar/eliminar clase desde la página dedicada.

**Última actuación previa**: 2026-06-13 — Acciones de membresía agregadas a `/dashboard/users/[id]`.

- `apps/web/app/dashboard/users/[id]/page.tsx`: 5 cambios quirúrgicos sin tocar lógica existente. (1) 5 estados nuevos: `showExtendModal`, `showReversalModal`, `extendDays`, `reversalNotes`, `membershipActionLoading`. (2) 3 handlers nuevos: `handleToggleMembership` (ACTIVE↔INACTIVE via `PATCH /memberships/:id` con `{status}`), `handleExtend` (extiende con `{extendDays}`), `handleReversal` (reversa con `{reversalNotes}`). Todos llaman `fetchData(false)` al terminar. (3) Row de 3 botones al pie de la card "Membresía activa": Extender (abre modal), Desactivar/Activar (toggle inline), Reversar pago (abre modal, estilo rojo). (4) Columna "Acciones" en tabla de historial de membresías — botón Desactivar/Activar por fila para status ACTIVE|TRIAL|INACTIVE. (5) 2 modales nuevos: ExtendModal (input days, preview fecha nuevo vencimiento) y ReversalModal (textarea motivo opcional). Ambos con overlay blur + confirmación. TypeScript: 0 errores nuevos (solo preexistentes en e2e/fixtures).
- Endpoint consumido: `PATCH /memberships/:id` (backend-dev 2026-06-13). Bodies: `{status}`, `{extendDays}`, `{reversalNotes}`.

**Pendiente para qa-engineer**: verificar botón "Desactivar" en card activa hace toggle y recarga; verificar modal Extender calcula fecha correctamente; verificar modal Reversar desactiva con motivo; verificar botones en tabla de historial para cada status; verificar `membershipActionLoading` bloquea doble-click.

**Última actuación previa**: 2026-06-13 — Selector de planes ("Restricción de planes") agregado a `NewClassModal` en `/dashboard/classes`.

- `apps/web/app/dashboard/classes/page.tsx`: 5 cambios quirúrgicos en `NewClassModal`: (1) estados `plans: any[]` y `allowedPlanIds: string[]` nuevos; (2) `api.get('/plans')` en el `Promise.all` de mount, filtra `isActive === true`; (3) función `togglePlan(planId)` para toggle; (4) sección "Restricción de planes" entre "Configuración base" y "Días de la semana" — oculta si no hay planes activos, pills toggleables con Trial badge, indicador "Todos los planes" cuando nada seleccionado, botón para limpiar selección; (5) `allowedPlanIds` incluido en el cuerpo del `POST /classes` solo si el array es no vacío. TypeScript: 0 errores nuevos (solo preexistentes en e2e/fixtures).
- Endpoints consumidos: `GET /plans` (nuevo), `POST /classes` (campo `allowedPlanIds` nuevo, aguarda backend-dev para activarlo en API).

**Pendiente para qa-engineer**: verificar que la sección aparece solo si hay planes activos; verificar toggle activo/inactivo de cada pill; verificar badge Trial; verificar botón "Limpiar selección"; verificar que al crear una clase con planes seleccionados el payload incluye `allowedPlanIds`; verificar que sin selección el campo se omite.

**Última actuación previa**: 2026-06-13 — Corrección de errores TypeScript en `apps/web/app/dashboard/classes/page.tsx`. 0 errores en el archivo (solo errores preexistentes en e2e/fixtures).

- Agregados imports `LayoutList` y `CalendarDays` de lucide-react (línea 7).
- Agregados estados faltantes en `ClassesPage`: `displayMode` ('list'|'calendar'), `view` (ViewMode), `currentDate`, `weekOffset`, `calendarClasses`, `calendarLoading` con type local `ViewMode`.
- Agregadas funciones faltantes: `navigate(dir)`, `titleLabel()`, `getCalendarWeekRange()`, `getClassesForDay(day)`, `getWeekDays()`, `getMonthDays()`, `groupByTime(cls)`, `refreshCurrentRange()` + `useEffect([weekOffset])` para fetch del modo calendario.
- Agregados componentes `WeekTimeline` y `CalendarWeekView` antes de `ClassesPage` (antes eran referencias a funciones/componentes indefinidos).
- Reemplazadas 3 llamadas a `fetchClasses()` (0 args, firma requiere 2) por `refreshCurrentRange()` que maneja ambos modos (lista + calendario) internamente.
- Total errores antes: 55 en `classes/page`. Total después: 0.

**Última actuación previa**: 2026-06-12 — Settings page modernizada con nav lateral de 9 secciones, sport theme selector visual y toast auto-dismiss.

- `apps/web/app/dashboard/settings/page.tsx`: reescrito completamente manteniendo toda la lógica CRUD existente. Layout 2 columnas (220px nav + contenido). 9 secciones: Perfil del box, Marca y diseño, Reservas y clases, Notificaciones, Asistencia, Lista de espera, Facturación, Pagos (cuenta bancaria + pasarelas), Avanzado. Sport theme selector: grid de cards visuales con emoji, color propio por tema, borde coloreado cuando activo, sombra glow, dispara `sport-theme-changed` event y persiste en localStorage + backend. Toast component fijo en bottom-right, auto-dismiss 3.5s. Spinner `Loader2` dentro de cada botón guardar mientras saving. `SectionCard`, `FieldLabel`, `PillSelector`, `Toggle`, `GatewayRow`, `SaveButton` como sub-componentes inline. `sportTheme` se lee/escribe en `PUT /gyms/me`. TypeScript: 0 errores nuevos.

**Pendiente para qa-engineer**: Verificar que nav lateral muestra sección activa con `--primary`; verificar sport theme selector aplica colores al panel en tiempo real; verificar toast de éxito/error con auto-dismiss 3s; verificar spinner en cada botón de guardar; verificar que toda la lógica CRUD de cada sección sigue funcionando.

**Última actuación previa**: 2026-06-12 — Sección "Registro de asistencia" integrada en `ClassPanel` de `/dashboard/classes`.

- `apps/web/app/dashboard/classes/page.tsx` líneas 227-408: nuevo componente `AttendanceSection({ classId })`. Fetcha `GET /classes/:id/attendees` al montar. Muestra resumen "N/M asistieron" con barra de progreso coloreada (verde ≥70%, brand-primary ≥40%, amarillo <40%). Lista de asistentes con avatar de iniciales, nombre, estado (hora si asistió / "Reservado" si no), toggle circular. Click en fila llama `PATCH /classes/:id/bookings/:userId/attend` con toggle optimista. Estado `toggling: Set<string>` por userId. Skeleton de 3 filas mientras carga. Interfaces TypeScript `AttendeeBooking` y `AttendeesData`.
- Integración en `ClassPanel` (líneas 1045-1053): nueva card `.card.rounded-xl` con header "REGISTRO DE ASISTENCIA" renderizada condicionalmente con `{canManage && ...}` al final de la columna derecha, después de la card de asistencia existente.
- No se tocó la lógica de edición/eliminación de clases ni la card de asistencia existente (bookingId-based).
- TypeScript: 0 errores nuevos. Solo errores preexistentes en e2e/fixtures.

**Pendiente para qa-engineer**: Verificar que la sección aparece para ADMIN y COACH pero no para MEMBER; verificar barra de progreso con distintos valores; verificar toggle asistencia marca/desmarca optimistamente; verificar skeleton durante carga; verificar que no se muestra si el fetch falla (devuelve null silenciosamente).

**Última actuación previa**: 2026-06-12 — Página `/dashboard/plans` modernizada con vista de pricing cards.

- `apps/web/app/dashboard/plans/page.tsx`: reescrita completamente manteniendo toda la lógica CRUD existente. Cambios: (1) Header mejorado con subtítulo "Configuracion de planes", h1 grande display font, descripción y botón "Nuevo plan" a la derecha; (2) `PlanCard` nuevo — tarjeta de pricing con badge "MAS POPULAR" para planes de 30 días (position absolute, gradient-btn), badge TRIAL (purple), badge PAUSADO (gris), precio prominente (34px display font, gradient en trial/gratis), features con iconos lucide (Calendar, Layers, FlaskConical, Clock) y colores de `--primary`, divider, botones Editar + Trash con hover states; (3) `EditCard` como componente separado con estado local — reemplaza el edit inline anterior, borde `--primary`, campos reutilizan `PlanFormFields`; (4) `SkeletonCard` — 3 cards skeleton con `.skeleton` CSS class mientras carga; (5) `EmptyState` — icono circular con `--primary-dim`, texto + botón "Crear primer plan"; (6) Grid 3 columnas `lg:grid-cols-3` (antes 2); (7) Summary strip al pie con total/activos/trial cuando hay datos; (8) `PlanFormFields` labels con `var(--text-3)` (antes slate-700 hardcodeado); (9) Toast de success auto-dismiss 3.5s; (10) `FormShape` con state local en `EditCard` en lugar de estado compartido `editForm` en el padre — evita race conditions. Toda la lógica CRUD `handleCreate`, `handleSaveEdit`, `handleDelete`, `fetchPlans` conservada idéntica. Importación: `Edit2, Trash2, Calendar, Layers, Infinity` (ya no `Tag, Clock` hardcoded).
- Endpoints: `GET /plans`, `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id` (sin cambios).
- TypeScript: 0 errores nuevos.

**Pendiente para qa-engineer**: Verificar que badge "MAS POPULAR" aparece en plan de 30 días; verificar skeleton 3 cards en carga; verificar empty state con botón cuando no hay planes; verificar que editar un plan abre EditCard inline en esa posición; verificar toast success auto-dismiss; verificar summary strip con contadores; verificar que CRUD completo sigue funcionando (crear, editar, eliminar).

**Última actuación previa**: 2026-06-12 — Botón "Exportar CSV" agregado a `/dashboard/users`. Solo visible para ADMIN y SUPER_ADMIN. Llama `GET /users/export?format=csv` con Axios (blob) y dispara descarga del archivo `miembros_YYYY-MM-DD.csv`.

- `apps/web/app/dashboard/users/page.tsx`: línea 9: `Download` agregado al import de lucide-react. Líneas 997-998: estado `exporting` nuevo. Líneas 1089-1112: `canExport` (ADMIN|SUPER_ADMIN) + `handleExportCSV` (GET blob → Blob → `<a>` temporal → click → revoke). Líneas 1137-1153: botón renderizado condicionalmente con spinner durante la exportación, ubicado antes de "Importar Excel" en el header.
- Endpoint consumido: `GET /users/export?format=csv` (implementado por backend-dev 2026-06-12).
- TypeScript: 0 errores nuevos. Solo errores preexistentes en e2e/fixtures.

**Pendiente para qa-engineer**: verificar que el botón aparece para ADMIN/SUPER_ADMIN y no para COACH; verificar que se descarga el CSV con nombre correcto; verificar spinner durante descarga; verificar alert en caso de error del endpoint.

**Última actuación previa**: 2026-06-12 — Tab "Analítica" agregado a `/dashboard/reports` (página de reportes). 5 secciones nuevas sin romper tabs existentes.

- `apps/web/app/dashboard/reports/page.tsx`: nuevo tab `'analitica'` con icono `Activity`. Helpers SVG inline nuevos: `OccupancyBarChart` (barras SVG sin librerías, gradient/verde por umbral 80%), `GenderDonut` (donut stroke-dasharray 3 segmentos: primario/rosa/gris), `Sparkline` (polyline bezier 64px). `SkeletonBlock` genérico reutilizable. Estados nuevos: `gymStats`, `occupancy`, `plans`, `occupancyPeriod`, `loadingAnalitica`, `errorAnalitica`. `fetchAnalitica` con `Promise.allSettled` (3 endpoints en paralelo). `fetchOccupancy` para cambio de período sin re-fetch de stats/plans. Sección 1: 4 KPI cards (retención con badge verde/amarillo/rojo, ocupación promedio con sparkline, clases hoy, membresías por vencer con badge naranja). Sección 2: gráfica de barras SVG con selector de 5 períodos (pills). Sección 3+4: grid 2 columnas (donut género + insights topType/topSlot). Sección 5: grid de planes con precio, duración, clases máx., membresías por vencer. Bonus: tabla de alumnos sin membresía activa (max 10 del backend). Error state con retry button. Skeletons en todas las secciones.
- Endpoints consumidos: `GET /gyms/me/stats`, `GET /gyms/me/occupancy?period=...`, `GET /plans`.
- TypeScript: 0 errores nuevos (solo errores preexistentes en e2e/fixtures).

**Pendiente para qa-engineer**: verificar que tabs Ingresos/Alertas/Evolución/Pagos no tienen regresiones; verificar 5 secciones del tab Analítica; verificar selector de período recarga solo ocupación; verificar donut con datos de género; verificar skeleton en carga lenta; verificar error state y retry; verificar que topType/topSlot muestran bien si son null.

**Última actuación previa**: 2026-06-12 — Vista de calendario semanal agregada a `/dashboard/classes`.

- `apps/web/app/dashboard/classes/page.tsx`: toggle "Lista / Semana" en header del main area. Estado nuevo: `displayMode` ('list'|'calendar'), `weekOffset` (int), `calendarClasses` (Class[]), `calendarLoading` (bool). Componente nuevo `CalendarWeekView` (inline en mismo archivo): CSS grid 8 columnas (48px labels + 7 días), 6am–22pm, bloques posicionados absolutamente por minutos. Fetch propio con `useEffect([displayMode, weekOffset])` → `GET /classes?from=...&to=...&limit=200`. Navegacion ← → Hoy para cambiar semana, label "DD MMM – DD MMM YYYY". Click en bloque abre `ClassPanel` existente. Modo 'list' conserva todas las vistas existentes (día/semana/mes) sin ninguna modificación. Iconos nuevos: `LayoutList`, `CalendarDays` de lucide-react. Import `React` explícito para usar `React.Fragment` con key en el map de horas.
- Endpoint consumido: `GET /classes?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=200` (ya existía en la API).

**Pendiente para qa-engineer**: verificar toggle Lista/Semana; verificar que navegacion de semana carga clases correctas; verificar que click en bloque abre ClassPanel; verificar que vista Lista no tiene regresiones; verificar highlight del día de hoy; verificar bloques con diferentes duraciones.

**Última actuación previa**: 2026-06-12 — Página de perfil de miembro mejorada (`/dashboard/users/[id]`).

- `apps/web/app/dashboard/users/[id]/page.tsx`: reescrito manteniendo toda la funcionalidad previa (edición, avatar, PaymentModal, ResetPasswordModal, renovar membresía). Cambios nuevos: (1) Skeleton loading completo con 5 niveles de placeholder mientras carga; (2) Header de perfil con Avatar de iniciales (72px, border-radius proporcional, gradiente `--gradient-btn`), badges de estado dinámicos (ACTIVE/TRIAL/EXPIRED/INACTIVE con colores semánticos), pill de membresía activa con fecha de vencimiento y días restantes, meta-row con ícono Phone/User2/Calendar para teléfono/género/edad calculada desde birthDate; (3) Sección de estadísticas rápidas 2x2/4x1 con 4 `QuickStatCard` (Membresías, Récords personales, Hitos gimnásticos, Días como miembro); (4) Historial de membresías en tabla HTML con columnas Plan/Inicio/Vencimiento/Método/Monto/Estado, reemplaza lista anterior; (5) Récords personales con hover highlight amarillo y fecha del registro; (6) Progresión gimnástica conservada sin cambios; (7) Botones de acción consolidados en el header (Renovar + Registrar pago + Editar). Sin endpoints nuevos: todo se extrae del payload de `GET /users/:id` que ya incluye `rmRecords`, `gymnasticProgress`, `memberships`, `birthDate`. `Promise.allSettled` no fue necesario (sólo 1 request de datos + `/plans`). Endpoints consumidos: `GET /users/:id`, `GET /plans`.

**Pendiente para qa-engineer**: Verificar skeleton durante carga lenta; verificar avatar con/sin imagen; verificar badge de estado en los 4 casos (ACTIVE/TRIAL/EXPIRED/INACTIVE); verificar tabla de historial con múltiples membresías; verificar stat cards con valores correctos; verificar funcionamiento de edición y modales de pago/resetPassword sin regresiones.

**Última actuación previa**: 2026-06-12 — Command palette (⌘K / Ctrl+K) implementado en el dashboard.

- `apps/web/app/dashboard/components/CommandPalette.tsx`: componente nuevo `'use client'`. Overlay global con backdrop blur. Panel centrado con animación slide-down. Input de búsqueda con debounce 250ms para `GET /users?role=MEMBER&search=QUERY&limit=5`. Resultados agrupados por categoría (Acciones rápidas / Miembros / Navegación / Configuración). Navegación con ↑↓ teclado + Enter para navegar + ESC para cerrar. Listener de evento personalizado `open-command-palette` para el hint del sidebar. 12 ítems de navegación estática + 1 acción rápida. Keyframe animations con prefijo `cp-` para evitar colisiones. TypeScript estricto, 0 errores.
- `apps/web/app/dashboard/layout.tsx`: import `CommandPalette` + `Search` de lucide-react agregados. Botón hint pill `⌘K` en el header del sidebar (visible solo cuando expandido), dispara `window.dispatchEvent(new CustomEvent('open-command-palette'))`. `<CommandPalette />` montado al final del JSX junto al `OnboardingWizard`.
- Endpoint consumido: `GET /users?role=MEMBER&search=QUERY&limit=5`.
- TypeScript: 0 errores nuevos (solo errores preexistentes en e2e/fixtures).

**Pendiente para qa-engineer**: Verificar que ⌘K/Ctrl+K abre el palette desde cualquier página del dashboard; verificar búsqueda de alumnos por nombre; verificar navegación con teclado (↑↓↵); verificar cierre con ESC y click en backdrop; verificar que el botón hint del sidebar abre el palette; verificar que el palette no aparece fuera del layout /dashboard.

**Última actuación previa**: 2026-06-12 — Centro de notificaciones (campana) implementado en sidebar.

- `apps/web/app/dashboard/components/NotificationBell.tsx`: componente nuevo `'use client'`. Poll cada 5 min a `GET /gyms/stats`. Genera notificaciones de tipo `expiring` (membresías por vencer) y `inactive` (alumnos sin membresía, máx 5). Badge numérico rojo (>= 2 días urgencia alta) o amarillo (urgencia media). Dropdown panel 320px con lista scrollable, íconos por tipo (Clock/UserX), colores por urgencia. Footer con link a `/dashboard/alerts`. Cierre al click fuera. En sidebar colapsado: panel abre a la derecha. En sidebar expandido: panel abre hacia arriba. Solo renderizado para roles ADMIN y SUPER_ADMIN.
- `apps/web/app/dashboard/layout.tsx`: import `NotificationBell` (línea 7). En footer colapsado: `{isAdmin && <NotificationBell collapsed={true} />}` entre toggleTheme y avatar (línea 587). En footer expandido: `{isAdmin && <div style={{marginTop:4}}><NotificationBell collapsed={false} /></div>}` en la fila de botones entre toggleTheme y logout (líneas 636-640).
- TypeScript: 0 errores nuevos (solo errores preexistentes en e2e/fixtures).
- Endpoint consumido: `GET /gyms/stats` (campos: `expiringMemberships[]{id,endsAt,user{id,name}}`, `inactiveMembers[]{id,name}`).

**Pendiente para qa-engineer**: Verificar que badge aparece con membresías por vencer; verificar click en notificación navega a /dashboard/users/:id; verificar cierre al click fuera; verificar que COACH no ve la campana; verificar posición del panel en sidebar colapsado vs expandido.

**Última actuación previa**: 2026-06-11 — Onboarding wizard implementado (overlay de 4 pasos para nuevos gyms).

- `apps/web/app/dashboard/onboarding/OnboardingWizard.tsx`: componente client nuevo. Overlay full-screen con backdrop blur. Tarjeta `card rounded-xl` centrada. Indicador de 4 pasos con dots conectados por línea. Paso 1 (perfil/link a settings), Paso 2 (crear tipo de clase via POST /class-types), Paso 3 (crear plan via POST /plans con priceCents=precio*100), Paso 4 (invitar staff via POST /users + pantalla de celebración con accesos rápidos). Botón X cierra en cualquier paso. "Hacer despues" en pasos 2 y 3 avanza sin bloquear. Pantalla celebración con 3 accesos rápidos (clases, alumnos, reportes). CSS vars en todos los colores.
- `apps/web/app/dashboard/layout.tsx`: import OnboardingWizard (línea 6). Estado `showOnboarding` (línea 115). useEffect que consulta GET /class-types + GET /plans en paralelo (líneas 198-220) — solo ADMIN/SUPER_ADMIN, respeta `fitapp_onboarding_done` en localStorage. Montura del wizard al final del JSX (líneas 773-783), cierre guarda `fitapp_onboarding_done`.
- TypeScript: 0 errores nuevos (solo errores preexistentes en e2e/fixtures).

**Pendiente para qa-engineer**: E2E del flujo wizard (gym sin class-types ni planes → wizard aparece → completar pasos → localStorage marca done → wizard no reaparece); verificar X cierra y guarda flag; verificar "Hacer despues" avanza; verificar pantalla celebración y navegación.

- `apps/web/app/dashboard/classes/page.tsx` (WodEditorModal): campo `scoreType` agregado al estado del formulario (default `'REPS'`, lee `wod.scoreType` si existe). Incluido en payload de `save()`. UI: bloque de pills con 5 opciones (REPS/TIME/WEIGHT/ROUNDS/CUSTOM) antes de la sección de bloques de movimientos.
- `apps/web/app/dashboard/wods/page.tsx`: reescrito desde redirect a página real. Lista WODs de últimos 60 días + próximos 14. Tarjeta por WOD con badge de scoreType y botón "Ver pizarra" → `/dashboard/wods/${id}/leaderboard`. Skeleton loading + error state con retry.
- `apps/web/app/dashboard/wods/[id]/leaderboard/page.tsx`: nueva página. Header con info del WOD (título, fecha, scoreType con icono). Dos columnas RX/Scaled. Skeleton + error con retry + empty state. Modal de registro de resultado (selector de atleta con búsqueda, campo score, toggle RX/Scaled, notas). Solo visible para COACH/ADMIN. Consume: `GET /wods/:id`, `GET /wods/:id/leaderboard`, `POST /wods/:id/results`, `GET /users?role=MEMBER`.
- `apps/web/app/dashboard/layout.tsx`: item "Pizarra" con icono `Trophy` agregado a `allNavItems` (entre Clases y Planes, `coachAllowed: true`). Import `Trophy` añadido a lucide-react.

**Pendiente para qa-engineer**: E2E del flujo registrar resultado; verificar columnas RX/Scaled; verificar que el scoreType guardado en el editor persiste al reabrir.

**Última actuación previa**: 2026-06-11 — Dashboard modernizado (5 mejoras UI en page.tsx).

- `DashboardSkeleton`: reemplaza el spinner de texto. Muestra header, KPI strip y grid con tarjetas placeholder animadas (`skeletonPulse` keyframe inline). Usado en admin view y coach view.
- `Sparkline`: reemplaza `MiniBarChart` (eliminado). SVG con línea suave bezier, área degradada y punto final. Dos referencias actualizadas en la sección de ocupación de clases.
- Tarjeta "Salud del box": nueva en columna derecha (entre Composición y Inactivos). Badge Excelente/Regular/Critico con color condicional, número grande de `activeRate%`, barra de progreso y 3 métricas (Por vencer / Sin membresía / En trial).
- Coach view rediseñado: fetch real de clases y WODs del día en `useEffect` (eliminado el `setLoading(false)` temprano). Grid 3+2 columnas con lista de clases (badge EN VIVO, color por ocupación), tarjeta WOD del día con botón Gestionar/Publicar, y 3 accesos rápidos en grid (sin WODs, ya está en la tarjeta).
- Animaciones escalonadas: `animationDelay: \`${i * 60}ms\`` en KPI cards y `animationDelay` en tarjetas del grid derecho (0ms, 60ms, 120ms, 180ms, 240ms).
- TypeScript: 0 errores nuevos. Errores preexistentes en e2e/fixtures sin cambio.

**Última actuación previa**: 2026-05-06 — Pantalla Fintoc conciliación bancaria implementada.

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

**Última actuación**: 2026-06-15 — Refactor BottomSheet: 7 bottom-sheets manuales reemplazados por el componente `BottomSheet` unificado en 7 archivos. Modales full-screen (BenchmarksScreen, MemberWodScreen, ProfileScreen) intactos.

**Archivos modificados**:
- `HomeScreen.tsx`: 1 bottom-sheet (detalle de clase). `Modal` eliminado del import.
- `PlanesScreen.tsx`: 1 bottom-sheet (`PayModal`). Modal Fintoc WebView (full-screen) conservado. `Modal` sigue en import para Fintoc.
- `ProgressScreen.tsx`: 2 BottomSheets independientes para el flujo de 2 pasos del modal RM (paso 1: picker de movimiento, paso 2: ingresar peso). `Modal` eliminado del import.
- `admin/CreateClassScreen.tsx`: 2 bottom-sheets (Type Picker + Coach Picker). `Modal` eliminado del import.
- `admin/CommunicationsScreen.tsx`: 1 bottom-sheet (Member Picker). `Modal` + `ScrollView` del sheet eliminados del import.
- `admin/CreateWodScreen.tsx`: 1 bottom-sheet (Type Picker). `Modal` eliminado del import.

**Estilos eliminados**: `modalOverlay`, `modalSheet`, `modalHandle`, `modalCard`, `overlay`, `sheet`, `sheetTitle`, `pickerSheet`, `weightSheet`, `modalHeaderRow`, `modalTitle`, `cancelText`, `modalMovName` — solo los relativos al wrapper del bottom-sheet. Contenido de los modales preservado exactamente.

**Anteriores**: todos los modales full-screen (`pageSheet`, WebView) sin cambios.

**Última actuación previa**: 2026-06-12 — ProfileScreen: mejoras menores en las secciones de días como miembro y récords personales. (1) Stat de días como miembro: texto `${memberDays} dias como miembro` → `🏋️ ${memberDays} días entrenando` (cero días → `🏋️ Miembro desde hoy`). (2) Sección "Mis récords": removida la condición `topRms.length > 0` del bloque exterior — la sección siempre se renderiza con el título "Mis récords"; cuando `topRms` está vacío muestra "Aún no tienes récords registrados" en lugar de ocultar la sección. El link "Ver todos" solo aparece si hay registros. Estilos de las tarjetas de RM ajustados a `flex: 1`, `alignItems: 'center'`, `backgroundColor: rgba(255,255,255,0.05)`, `borderColor: rgba(255,255,255,0.1)` — alineados con el diseño solicitado. Datos de membresía, auto-renovación, cambio de contraseña y logout sin cambios.

**Última actuación previa**: 2026-06-12 — Reserva rápida en HomeScreen (ajuste). La feature ya estaba implementada. Corregido: `Alert.alert('Error', msg)` → `Alert.alert('Aviso', msg)` en `handleBook` catch (linea 148). Sin cambios de comportamiento ni de lógica.

**Última actuación previa**: 2026-06-12 — Formulario "Registrar mi resultado" en MemberWodScreen. Modal slide-up con form adaptado por scoreType.

**MemberWodScreen — formulario de resultado** (`apps/mobile/src/screens/MemberWodScreen.tsx`):
- Estado nuevo: `myResult: MyResult | null`, `logModalVisible: boolean`.
- `fetchLeaderboard` usa `Promise.allSettled` para cargar leaderboard + `GET /wods/:id/results/me` en paralelo. Si la request de /me falla o devuelve null, `myResult` queda null sin bloquear la pantalla.
- Botón flotante visible solo para `user?.role === 'MEMBER'`. Estado visual dual: primario opaco si sin resultado, borde semitransparente si ya hay resultado con texto "Mi resultado: X (RX/Scaled)". Hint "Toca para actualizar".
- `LogResultModal`: `Modal` con `animationType="slide"` y `presentationStyle="pageSheet"`. `KeyboardAvoidingView` para iOS/Android. Preload de valores cuando `myResult` existe. Toggle RX/Scaled con accesibilidad (`accessibilityRole="radio"`). Inputs adaptativos por scoreType: TIME (dos campos min/seg separados con validación seg 0-59), REPS/ROUNDS/WEIGHT (un campo numérico con placeholder apropiado), CUSTOM (texto libre + número opcional). Notas multiline maxLength=200 con contador. Validación local antes del POST con `Alert.alert` para mensajes de error. Submit hace `POST /wods/:id/results/me`, llama `onSaved(data)` + cierra modal + refresca leaderboard.
- Endpoints: `GET /wods/:id/results/me`, `POST /wods/:id/results/me`.
- Scoreype default: `'REPS'` si ni leaderboard ni route.params lo proveen.

**Última actuación previa**: 2026-06-11 — MemberWodScreen nueva (leaderboard solo lectura para MEMBER). HomeScreen WOD card navegable.

**MemberWodScreen** (`apps/mobile/src/screens/MemberWodScreen.tsx`):
- Pantalla solo lectura. Acepta `route.params`: `wodId`, `wodTitle?`, `wodDate?`, `scoreType?`.
- Consume `GET /wods/:id/leaderboard`. Muestra RX y Scaled en secciones verticales separadas con `CategorySection`.
- Medallas 🥇🥈🥉 para top 3 de cada categoría. Fila del usuario actual resaltada (borde izquierdo primario + texto "yo").
- Stats row con totales: Resultados / RX / Scaled. `ScoreTypeBadge` en el header con color por tipo.
- Sin formularios ni botones de edición. `useNavigation + useRoute` (sin props de navegación directas).
- Header con boton ← navegación back. Error state con retry. Loading state con `ActivityIndicator`.

**AppNavigator.tsx** — `MemberHomeStack()` nuevo: wrappea `HomeScreen` (ruta `HomeMain`) y agrega `MemberWodScreen` (ruta `MemberWod`). Tab `Home` ahora usa `MemberHomeStack` en lugar de `HomeScreen` directamente.

**HomeScreen.tsx** — WOD card envuelto en `TouchableOpacity`. `onPress` navega a `MemberWod` con `{ wodId, wodTitle, wodDate, scoreType }`. Hint "Ver pizarra →" al pie del card (estilo `wodLeaderboardHint`).

**Última actuación previa**: 2026-06-11 — WODScreen rediseñado con Pizarra (leaderboard), tabs de tipo de clase y cargas personales.

**WODScreen rediseñado** (`apps/mobile/src/screens/WODScreen.tsx`):
- Tabs horizontales de tipo de clase con color dinámico por tipo. "Todos" seleccionado por defecto.
- Tarjeta glassmorphism (`rgba(255,255,255,0.05)`) por WOD con barra accent del color del tipo de clase.
- Badge de scoreType: TIME/REPS/WEIGHT/ROUNDS/CUSTOM con emoji e icono de color propio.
- Bloques con movimientos: inline con `MovementRow` (carga calculada del backend, weight Rx, o % si no hay RM).
- Pizarra: `GET /wods/:id/leaderboard` por WOD al cargar. Top 5 RX + Top 5 Scaled con medallas 🥇🥈🥉. Fila del usuario autenticado resaltada (borde izquierdo primario). Botón "Ver todos (+N)" para expandir. Cero recálculo en cliente.
- Mis cargas: `GET /wods/class/:classId/my-loads` por WOD, mostradas inline en cada movimiento y como bloque resumen.
- `RefreshControl` + `useSafeAreaInsets` para padding top correcto.
- TypeScript estricto: interfaces tipadas (`Wod`, `LeaderboardData`, `LeaderboardEntry`, `WodBlock`, `WodMovement`, `MyLoad`). Sin `any` en props. Llaves balanceadas (793 líneas).
- Nota: la pantalla existe pero no está en el tab navigator (ProgressScreen ocupa esa pestaña). Puede importarse cuando sea necesario o añadirse como pantalla dentro de un stack.

**Última actuación previa**: 2026-06-10 — HomeScreen refactorizado, ProgressScreen nueva, ProfileScreen limpiado, ClassesScreen mejorado.

**ProgressScreen nueva** (`apps/mobile/src/screens/ProgressScreen.tsx`):
- Reemplaza la pestaña WOD del navigator de MEMBER (ícono `trending-up`, label "Progreso").
- Tab "Marcas personales": RMs agrupados por categoría (usa `movementLibrary` del gym como fuente única). Card por categoría, peso actual destacado, indicador `+X kg ↑` en verde. Botón "Registrar nueva marca".
- Tab "Gimnasia": habilidades del gym desde `/skills`, barra de progreso por skill, hitos con dot check, tap para marcar como logrado (`POST /gymnastic-progress/me`). Badge "Siguiente: X" al pie.
- Modal de agregar RM en **2 pasos**: Paso 1 — picker de movimientos del gym con búsqueda (sin texto libre, `SectionList` agrupado por categoría). Paso 2 — peso y notas + botón Cancelar y "← Cambiar" para volver al listado.
- Categorías resueltas con `movementLibrary[i].category` si existe, fallback a tabla estándar CF.

**HomeScreen refactorizado** (`apps/mobile/src/screens/HomeScreen.tsx`):
- Membresía fusionada dentro del bloque hero (nombre + plan pill + días restantes + fecha de vencimiento). Ganancia de espacio vertical.
- Campana de notificaciones movida al interior del bloque hero, esquina superior derecha.
- "Mi próxima clase": muestra todas las clases del mismo día (no solo la primera).
- Pizarra: renderiza `wod.blocks[].movements` (corregido bug que usaba `wod.movements` inexistente). Con 2+ tipos de clase del día → tabs horizontales de selección; contenido único que cambia al tocar la pestaña.
- Colores del bloque hero alineados con estilo glass del bloque "próxima clase" (`rgba(255,255,255,0.08)` background, sin fondos sólidos chilenos en pills).

**ClassesScreen mejorado** (`apps/mobile/src/screens/ClassesScreen.tsx`):
- `cancelCutoffMins` cargado desde `/gyms/me`; botón Cancelar deshabilitado dentro de la ventana de corte.
- Booking map tipado con `confirmDeadline?: string | null`. Botón Confirmar muestra cuenta regresiva `⏱ Confirmar · Xm`.

**ProfileScreen limpiado** (`apps/mobile/src/screens/ProfileScreen.tsx`):
- Eliminadas secciones de RMs y progresión gimnástica (ahora viven en ProgressScreen).
- Eliminados: constantes `MOVEMENTS`, `DEFAULT_SKILLS`, `SKILL_GIFS`; estado `rms`, `progress`, `gymSkills`, `showRMModal`, `showSkillModal`, etc.; funciones `saveRM`, `saveProgress`, `saveProgressWithEvidence`, `isMilestoneCompleted`, `getSkillProgress`, `toLibras`; modales RM y Skill.
- Queda: hero con estadísticas de asistencia, info del gym, datos personales, cambio de contraseña, confirmaciones pendientes de waitlist, auto-renovación, QR, logout.

**AppNavigator.tsx**:
- `WODScreen` → `ProgressScreen`. Tab name `WOD` → `Progress`. `TAB_ICONS` actualizado a `trending-up/trending-up-outline`.

---

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

### devops
**Última actuación**: 2026-06-15 — Checklist pre-deploy ejecutado. 7 controles de seguridad aplicados. Dockerfiles creados. Plataforma elegida: Railway.

**Controles aplicados**:
- `@fastify/helmet` → HSTS + X-Content-Type + X-Frame en todos los responses de la API
- CORS restrictivo → origin: función que valida contra `FRONTEND_URL`; requests sin origin (mobile) siempre pasan
- Rate limit → global 120 req/min; auth routes 10 req/15min
- JWT_SECRET guard → `process.exit(1)` si no está configurado
- Error handler seguro → oculta stack traces en producción
- Next.js security headers → CSP, HSTS, X-Frame, Referrer, Permissions-Policy en `next.config.ts`
- RLS PostgreSQL → activo en 10 tablas; **pendiente middleware Fastify** que inyecte `app.current_gym_id` antes de cada query
- `@fastify/jwt` actualizado 10.0.0 → 10.1.0 (3 CVEs críticos resueltos)

**Archivos nuevos**: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/api/.dockerignore`, `apps/web/.dockerignore`, `apps/api/.env.example`, `apps/web/.env.example`, `apps/api/prisma/migrations/20260616000000_enable_rls/migration.sql`, `.claude/agents/security.md`

**Plataforma elegida**: Railway (API + Web + Postgres + Redis), dominio + CDN en Cloudflare. Ver `docs/SECURITY.md` y `docs/devops.md` para pasos detallados.

**Pendiente crítico**: middleware Fastify para `SET LOCAL app.current_gym_id = $gymId` antes de cada request autenticado. Sin esto el RLS no funciona. Ver `docs/SECURITY.md § P1`.

**2026-06-18 — Cumplimiento tiendas**:
- `apps/mobile/app.json`: NSLocation agregado, NSMicrophone eliminado, NSCamera corregido, android.permissions explícitos, plugins expo-camera/location/notifications añadidos
- `DELETE /users/me` en users.routes.ts (obligatorio Google Play — eliminación de cuenta desde la app)
- `ProfileScreen.tsx`: sección Legal (Privacidad + Términos) + botón "Eliminar mi cuenta" con BottomSheet de confirmación
- **Pendiente Cristian**: publicar Privacy Policy y ToS en URL pública → actualizar links en ProfileScreen → llenar Data Safety (Play) y App Privacy (App Store Connect)

---

## security

**Última actuación**: 2026-06-25 — Auditoría completa de auth/multi-tenancy. 6 vulnerabilidades corregidas.

**Hallazgos corregidos**:
- CRÍTICO: Path traversal en `/uploads/avatars/:filename`, `/uploads/:filename`, `/uploads/evidence/:filename` — `safeResolvePath()` implementado en `index.ts`
- ALTO: JWT sin expiresIn en `POST /gyms/switch-sede` — ahora usa `process.env.JWT_EXPIRES_IN ?? '15m'`
- ALTO: `POST /auth/refresh` sin rate limit — ahora usa `authRateLimit` (10 req/15min en prod)
- MEDIO: `/auth/me PUT` — email uniqueness verificaba cross-tenant; ahora filtra por `gymId`
- MEDIO: `PATCH /classes/:id` — `coachId` y `classTypeId` del body no verificados contra gymId; añadida validación
- MEDIO: `/uploads/evidence/:filename` sin autenticación — ahora requiere JWT + ownership del progress
- DISEÑO: `SUPER_ADMIN` con `gymId=null` podía pasar `requireAdmin` y llegar a endpoints de gym — bloqueado en middleware con allowlist de rutas permitidas
- BAJO: `GET /ai/athlete-projection/:userId` — MEMBER podía pasar userId arbitrario (aunque service lo ignoraba); denegación explícita añadida

**RLS ampliado** (nueva migración `20260625000000_rls_missing_tables`):
- 8 tablas adicionales cubiertas: Membership, Booking, RmRecord, GymnasticProgress, GymSkillMilestone, WodBlock, WodMovement, BenchmarkResult

**Pendiente (requiere acción externa)**:
- Middleware Fastify para inyectar `SET LOCAL app.current_gym_id` en cada request — sin esto el RLS no actúa
- Aplicar migración `20260625000000_rls_missing_tables` en producción
- `pnpm audit` en CI — verificar 0 high/critical tras cambios

**Riesgos residuales confirmados (aceptados por diseño)**:
- Lockout login es in-memory (se pierde al reiniciar instancia) — Redis recomendado si se escala horizontal
- `allowedPlanIds` en PATCH /classes/:id no verifica que los planIds sean del gym correcto (los planes de otro gym simplemente no existirían en producción por multi-tenancy, pero se debería añadir validación explícita)

---

## Tips para mantener este archivo útil

- Si un agente olvida actualizar su sección, recuérdaselo: "update STATE.md"
- Mantén cada sección en menos de 10 líneas. Si crece mucho, resume
- Antes de invocar un agente, dile: "lee STATE.md sección [nombre]"
- Este archivo es lo único que sobrevive entre sesiones. Si está vacío, los agentes arrancan ciegos
