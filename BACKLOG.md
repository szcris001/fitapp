# BACKLOG.md — Trabajo Pendiente FitHub

> Este es el "20% que falta" del MVP, priorizado. Solo el **product-owner** puede agregar items nuevos. Los devs tachan al cerrar (`[x]`).

**Convenciones**:
- `[ ]` pendiente, `[x]` hecho, `[~]` en progreso, `[!]` bloqueado
- Prefijos: `[BUG]` reporte de qa, `[NEW]` feature nueva aprobada, `[CLOSE]` cierre de algo a medias
- Cada item tiene: descripción · sección del requirements · agente responsable · estimación

**Última revisión de código**: 2026-09-27 · revisión de estado contra `master` (PR #35)

---

## 🔴 Crítico (bloquea release MVP)

### Bugs de tests

- [x] `[BUG-SECURITY][CERRADO 2026-05-04]` `POST /users` expone `passwordHash` en la respuesta. Fix: helper `sanitizeUser` en `users.service.ts`. 348/348 tests pasando.

- [x] `[BUG-FLAKY][CERRADO 2026-05-05]` autorenew Caso 24 flaky en ejecución paralela. Fix: `orderBy: { createdAt: 'asc' }` en `runAutoRenewJob` real y en test. 528/528 estable en 8 runs consecutivos.

- [x] `[BUG-SECURITY][CERRADO 2026-05-04]` `GET /rms/user/:userId` y `GET /gymnastic-progress/user/:userId` sin validación de gymId. Fix: `getRmsByUser(userId, gymId)` valida pertenencia al gym, devuelve 404 si no coincide.

- [x] `[BUG-SECURITY][CERRADO 2026-05-22]` `POST /payments/callback/kushki`: gym sin Kushki habilitado lanza 'Pasarela Kushki no habilitada para este gimnasio' (línea 836 payments.service.ts). Fix verificado en código.

- [x] `[BUG][CERRADO 2026-05-22]` `POST /payments/callback/kushki`: mapeo de error "no tiene formato JWT" a 401. Fix: `includes('no tiene formato')` agregado en payments.routes.ts línea 279. Verificado en código.


### Pagos

- [x] `[CLOSE]` Integración Stripe checkout (sesión de pago, webhook, activación de membresía) · §3.4.2 · payments-specialist — **IMPLEMENTADO**: `payments.service.ts` tiene `createCheckoutSession`, `handleStripeWebhook`, `chargeAutoRenewMembership`
- [x] `[CLOSE]` Integración Mercado Pago checkout y webhook IPN · §3.4.2 · payments-specialist — **IMPLEMENTADO**: `createMercadoPagoCheckout`, `handleMercadoPagoWebhook`
- [x] `[CLOSE]` Subida y revisión de comprobante de transferencia · §3.4.3 modalidad A · web-dev + mobile-dev — **IMPLEMENTADO**: `submitTransferReceipt`, `confirmTransfer`, `rejectTransfer` + ruta web en `dashboard/payments/page.tsx`
- [x] `[CLOSE]` Auto-renovación (job + reintentos + notificaciones) · §3.4.4 · payments-specialist — **IMPLEMENTADO**: `runAutoRenewJob()` en `cron.ts` con lógica de reintentos y notificación push. Aplica solo a pasarelas activas en producción (Stripe excluido hasta post-MVP)
- [x] `[CLOSE]` Webhooks con idempotencia y validación de firma · §3.4.2 · payments-specialist — **IMPLEMENTADO 2026-05-05**: Stripe ✅, MP ✅ (HMAC-SHA256 x-signature), Khipu ✅ (HMAC-SHA256 raw body), Kushki ✅ (JWT+merchantId), MACH ✅ (Bearer timingSafeEqual), Fintoc ✅ (HMAC-SHA256). Flow/PayU/OpenPay tienen validación en requests salientes. 27 tests de firma verdes.

### Cálculos críticos

- [x] `[CLOSE]` Tests unitarios de cálculo de carga personalizada · §3.3.3 · qa-engineer — **RESUELTO**: `calculateLoad` en `wod.utils.ts`, integrada en `wod.service.ts`. 26 tests unitarios verdes, 45 tests integración WOD verdes.
- [x] `[CLOSE]` Verificar redondeo configurable por gym · §3.3.3 · backend-dev — **RESUELTO**: campo `weightRounding` en schema Gym, incluido en `GET /gyms/me` y aceptado en `PUT /gyms/me`.

### Multi-tenancy

- [x] `[CLOSE]` Suite de tests de aislamiento entre gyms · §8 · qa-engineer — **RESUELTO**: 24 tests multi-tenancy cross-module + aislamiento verificado en users, plans, gyms, classes, wods, payments, analytics, Fintoc. 0 vulnerabilidades encontradas.
- [x] `[CLOSE]` Auditoría de queries Prisma sin `gymId` · §8 · backend-dev — **RESUELTO**: bug de tenancy en analytics corregido. Todos los endpoints filtran por gymId del JWT.

### Seed de benchmarks

- [x] `[CLOSE]` Script de seed con Girls, Heroes, Open, Games · §3.3.3 · devops — **IMPLEMENTADO**: `prisma/seed.ts` tiene 27 Girls, 10 Heroes, 66 Open (desde 2011), 10 Games. Total: 113 benchmarks con idempotencia via `externalId` upsert.
- [ ] `[CLOSE]` Script de append anual para Open/Games · §3.3.3 · devops · 0.5 día — **PARCIAL**: el upsert permite agregar años nuevos pero no hay proceso documentado/automatizado para actualizaciones anuales.
- [x] `[CLOSE]` Test del seed (idempotencia + conteos correctos) · qa-engineer — **RESUELTO**: 20 tests verdes, 113 benchmarks verificados, 3x corridas idempotentes.

---

## 🟡 Importante (necesario para MVP pero no bloquea release inicial)

### Pasarelas restantes

- [x] Khipu: checkout + callback implementados · payments-specialist — **IMPLEMENTADO** en `payments.service.ts` (`createKhipuCheckout`, `handleKhipuCallback`)
- [x] Flow: checkout + callback implementados · payments-specialist — **IMPLEMENTADO** (`createFlowCheckout`, `handleFlowCallback`)
- [x] MACH Business: checkout + webhook implementados · payments-specialist — **IMPLEMENTADO** (`createMachCheckout`, `handleMachWebhook`)
- [x] Kushki: checkout + callback implementados · payments-specialist — **IMPLEMENTADO** (`createKushkiCheckout`, `handleKushkiCallback`)
- [x] PayU LATAM: checkout + callback implementados · payments-specialist — **IMPLEMENTADO** (`createPayUCheckout`, `handlePayUCallback`)
- [x] OpenPay: checkout + callback implementados · payments-specialist — **IMPLEMENTADO** (`createOpenPayCheckout`, `handleOpenPayCallback`)
- [x] Cerrar Flow sandbox · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-06**: 16/16 tests pasando — checkout (7 casos: auth, Zod, plan inexistente, gym sin config, API error, code≠0, éxito+firma HMAC) + callback (9 casos: sin params, getStatus falla, status 3 rechazado, status 1 pendiente, éxito membresía ACTIVE, idempotencia, cross-gym gymId, cross-gym userId bug documentado). Falta sandbox real contra Flow API.
- [x] Cerrar Khipu sandbox · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-06**: 16/16 tests pasando — checkout (7 casos: auth, Zod, plan inexistente, gym sin config, API error, éxito+firma HMAC-SHA256 Authorization header verificado) + callback (9 casos: sin params, getPayment falla, status pending, sin firma con secret→401, firma inválida→401, éxito membresía ACTIVE, idempotencia 2x→1 membresía, cross-gym userId→400 fix aplicado, bug secret=undefined documentado). Falta sandbox real contra Khipu API. · **PRIORIDAD 2**
- [x] `[CLOSE]` Cerrar Mercado Pago contra sandbox · §3.4.2 · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-07**: 16/16 tests pasando — checkout (7 casos: sin auth→401, Zod→400, plan inexistente→400, gym sin config→400, MP API error→400, éxito→{url,preferenceId}, external_reference gymId|planId|userId verificado) + webhook (9 casos: action desconocida→received:true, sin data.id→received:true, getPayment falla→no activa, status pending→no activa, gymId no coincide→no activa, éxito completo→membresía ACTIVE, idempotencia 2x→1 membresía, firma global inválida→401, payment.updated activa). Falta sandbox real contra MP API. · **PRIORIDAD 3**
- [x] Cerrar MACH sandbox · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-07**: 16/16 tests pasando — checkout (7 casos: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config MACH→400, MACH API error→400, éxito→200+{url,externalId,linkId}, Authorization:Bearer apiKey verificado en request a biz.soymach.com + amount=priceCents/100 + currency=CLP) + webhook (9 casos: sin Authorization→401, token incorrecto→401, status PENDING→no activa, PAID+token válido→membresía ACTIVE+paymentNotes mach:{id}, COMPLETED+token válido→igual, idempotencia 2x→1 membresía, cross-gym gymBId prefix sin MACH→{received:true} sin membresía, external_id malformado→{received:true}, sin external_id→{received:true}). 0 bugs. Falta sandbox real contra MACH API.
- [x] Cerrar Kushki sandbox · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-07**: 19/19 tests pasando — checkout (6 casos: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config→400, Kushki API error→400, API sin URL→400, éxito→200+{url,chargeToken}+Private-Merchant-Id+callbackURL verificados) + callback (13 casos: sin gymId→400, gymId inexistente→400, sin x-kushki-token con privateMerchantId→401, JWT sin puntos→400 (mapeo a 401 no aplica para "no tiene formato JWT"), merchantId incorrecto→401, status DECLINED→400, status FAILED→400, éxito APPROVAL→membresía ACTIVE+paymentNotes kushki:{id}+paymentMethod kushki, idempotencia 2x→1 membresía, cross-gym gymBId→200 [BUG-SEC documentado], plan inexistente→400, status ausente→200+membresía activa). 2 bugs encontrados y documentados. Falta sandbox real contra Kushki API.
- [x] Cerrar PayU sandbox · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-07**: 15/15 tests pasando — checkout (6 casos: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config PayU→400, éxito→200 {url,params,referenceCode} con URL sandbox.checkout.payulatam.com, firma MD5 verificada en params.signature + test=1 + buyerEmail correcto); callback (9 casos: sin query params→400, firma inválida→400, transactionState 5→400, transactionState 6→400, éxito state "4"→membresía ACTIVE paymentMethod payu, idempotencia 2x→1 membresía, cross-gym gymId→400; [BUG-SEC] sin campo sign acepta sin verificar, [BUG-SEC] userId cross-gym no validado). 2 bugs de seguridad documentados, asignados a backend-dev. Falta sandbox real contra PayU API.
- [x] Cerrar OpenPay sandbox · payments-specialist + qa-engineer · **TESTS INTEGRACIÓN COMPLETOS 2026-05-07**: 20/20 tests pasando — checkout (9 casos: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config→400, OpenPay API error→400, sin URL de pago→400, éxito→{url,transactionId,orderId}, Basic Auth(privateKey:) verificado en request a OpenPay, redirect_url en root→200); callback GET (11 casos: sin params→redirect cancelled, gymId inexistente→redirect cancelled, getStatus falla→redirect cancelled, pago pending→redirect cancelled, pago failed→redirect cancelled, éxito completed→membresía ACTIVE+redirect success, idempotencia 2x→1 membresía, cross-gym gymBId sin openpay→redirect cancelled, array vacío→redirect cancelled, objeto directo completed→membresía ACTIVE, URL sandbox con order_id verificada). 0 bugs encontrados. Falta sandbox real contra OpenPay API.
- [ ] PayPal: dejar codeado pero desactivado por defecto · payments-specialist · 0.5 día — **NO EXISTE** en el código actual
- [x] `[NEW]` Fintoc Payments (Pay by Bank) · §3.4.2 · payments-specialist + architect · 2-3 días — **IMPLEMENTADO 2026-05-06**: schema+migración+service+routes (payments-specialist). **TESTS 2026-05-06**: 19 tests de integración, 19/19 passing — 3 endpoints cubiertos (checkout mock fetch, status ownership, webhook HMAC+idempotencia+FAILED). qa-engineer. Falta sandbox real contra API Fintoc.

### Conciliación bancaria

- [x] Integración con Fintoc para CL · §3.4.3 · payments-specialist — **IMPLEMENTADO 2026-05-05**: tablas `FintocLink` + `BankMovement`, matcher 2 fases, webhook HMAC. **2026-09**: sync server-side contra la API de Fintoc (`/v1/accounts/{id}/movements`, solo movimientos entrantes) y link vía widget.
- [x] Lógica de matcher (monto + RUT + código de referencia) · §3.4.3 · payments-specialist — **IMPLEMENTADO**: Fase 1 exact_rut (confirma auto), Fase 2 amount_only ±72h (requiere revisión admin).
- [x] Tests del matcher · §3.4.3 · qa-engineer — **RESUELTO**: 4 tests unit (Fase 1, Fase 2, sin match) + 57 tests integración.
- [x] Pantalla web de conciliación Fintoc · web-dev — **IMPLEMENTADO**: `apps/web/app/dashboard/fintoc/page.tsx` (conexión con widget Fintoc vía `link-intent` + `link/exchange`, sync server-side, confirmar/rechazar movimientos). Falta prueba contra sandbox real de Fintoc.

### Importación Excel

- [x] `[CLOSE]` Importación de WODs por Excel (frontend) · §3.3.3 · web-dev — **IMPLEMENTADO**: `apps/web/app/dashboard/wods/import/page.tsx` parsea Excel con `xlsx` lib y sube WODs vía API
- [x] `[CLOSE]` Importación de clases por Excel (frontend) · §3.3.3 · web-dev — **IMPLEMENTADO**: `apps/web/app/dashboard/classes/import/page.tsx`
- [x] `[CLOSE]` Importación de tipos de clase por Excel · §3.3.3 · web-dev — **IMPLEMENTADO**: `apps/web/app/dashboard/settings/class-types/import/page.tsx`
- [x] `[CLOSE]` Validación de la importación en el backend · §3.3.3 · backend-dev — **RESUELTO 2026-09-27 (PR #35)**: el Excel se parsea en el frontend; `POST /wods/import` valida el JSON con Zod (fechas, bloques, límites) y rechaza WODs duplicados por tipo de clase y día.
- [x] `[CLOSE]` Tests de importación de WODs · qa-engineer — **RESUELTO 2026-09-27**: suite «validación de entrada y POST /api/wods/import» en `wod.integration.test.ts` (body inválido, fecha inválida, duplicado, classType de otro gym, rol MEMBER).

### IA de retención

- [x] `[CLOSE]` Endpoint de alertas proactivas (riesgo de abandono, vencimiento, inactividad) · §3.7 · backend-dev — **IMPLEMENTADO**: `getRetentionAlerts()` en `ai.service.ts`, ruta en `ai.routes.ts`, pantalla en web `dashboard/alerts/page.tsx` y mobile `AIAlertsScreen.tsx`. **TESTEADO 2026-05-07**: 7 tests integración — atRisk, expiringSoon con daysLeft, inactive, multi-tenancy gymA/gymB.
- [x] `[CLOSE]` Proyección de objetivos del atleta · §3.7 · backend-dev + mobile-dev — **IMPLEMENTADO**: `getAthleteProjection()` usa Claude API, ruta expuesta, pantalla en mobile. **TESTEADO 2026-05-07**: 9 tests integración — cross-gym→500, admin→200+athlete+projections+coachTip, MEMBER usa token userId, prompt con RMs, fallback raw, backticks.
- [x] `[CLOSE]` Insights generales del gym con IA · §3.7 · backend-dev — **IMPLEMENTADO**: `getAiInsights()` con prompt a Claude y respuesta JSON. **TESTEADO 2026-05-07**: 6 tests integración — llama Anthropic con datos del gym, insights+summary, backticks, fallback raw, type≠text→500. Gotcha: vi.hoisted() obligatorio (Anthropic instanciado en top-level del módulo).

---

## 🟢 Menor (pulir antes de release)

- [x] Branding dinámico (3 colores) consistente en web y mobile · §3.6 · web-dev + mobile-dev — **IMPLEMENTADO**: `brandColors` en schema Gym, `theme-preview` en web, `ThemeDemoScreen` en mobile
- [x] Indicador de planificación sin WOD en dashboard · §3.1 · web-dev — **IMPLEMENTADO**: tarjeta «WOD del día» muestra «Sin WOD publicado hoy».
- [x] Indicador de asistencia por horario · §3.1 · web-dev — **IMPLEMENTADO**: ocupación del dashboard (`GET /gyms/me/occupancy`) con horario de mayor ocupación (`topSlot`).
- [~] Panel de evolución de alumnos colectivo e individual · §3.1 · web-dev — **PARCIAL**: `dashboard/evolution/page.tsx` (colectivo) ya está en el menú y es visible para COACH (PR #34). Falta revisar la vista individual.
- [x] Términos y condiciones propios del centro · §3.6 · web-dev — **IMPLEMENTADO**: campo `termsAndConditions` en schema Gym, visible en settings
- [x] Notificaciones push (Firebase/OneSignal) vía Expo · §3.5, §7 · devops + mobile-dev — **IMPLEMENTADO**: `expo-server-sdk` en API, `sendPushNotification` en `lib/push.ts`, campo `pushToken` en User, integrado en cron jobs
- [x] Correos automatizados (nodemailer + SMTP) · §3.5, §7 · devops + backend-dev + qa-engineer — **IMPLEMENTADO + TESTEADO 2026-05-07**: `lib/email.ts` con nodemailer, SMTP configurable por gym, plantillas personalizables. 21 tests unitarios, 21/21 passing — sendExpiryReminder, sendPaymentConfirmation, sendBulkEmail, sendWelcomeEmail, sendTestEmail, sendBulkToGyms. Gotcha hoisting vi.mock() documentado.
- [x] QR de asistencia · web + mobile · — **IMPLEMENTADO**: `QRScreen.tsx` en mobile, `QRScannerScreen.tsx` admin

---

## 🚀 Pre-release

- [~] Setup de Sentry en api, web, mobile · devops — **PARCIAL**: API activo cuando existe `SENTRY_DSN` (errores 5xx reportados desde el error handler). Pendiente: DSN real en producción + web + mobile.
- [ ] Configurar staging con seed completo · devops · 0.5 día — **PENDIENTE**: docker-compose.prod.yml listo, falta dominio y plataforma real.
- [x] E2E de flujo crítico: alumno se registra → paga (transferencia) → reserva → ve WOD · qa-engineer · **COMPLETADO 2026-05-07**: `apps/api/src/__tests__/e2e.critical-flow.test.ts` — 16 pasos, 16/16 passing. Sin mocks, DB real, Fastify real. Gotcha de timezone documentado en memoria.
- [ ] Smoke test manual de todos los flujos en staging · qa-engineer + Cristian · 0.5 día — **PENDIENTE**
- [x] Configurar deploy a producción con aprobación manual · devops — **IMPLEMENTADO 2026-05-05**: `.github/workflows/deploy.yml` con `environment: production`. Pendiente: crear environment en GitHub y elegir plataforma.
- [x] Configurar framework de testing (Vitest) en apps/api · qa-engineer — **RESUELTO**: vitest 4.1.5 instalado, 645/645 tests pasando.
- [x] Dockerfiles (API + Web) · devops — **IMPLEMENTADO**: `apps/api/Dockerfile` y `apps/web/Dockerfile` (contexto = raíz del repo, usuario `node`, migraciones + rol `fitapp_app` al arrancar). Ver `docs/devops.md`.
- [ ] Elegir plataforma de deploy (Railway / Render / VPS) · Cristian — **DECISIÓN PENDIENTE**: descomentar bloque en deploy.yml según elección.

---

## 📦 Backlog post-MVP (NO tocar ahora — solo product-owner puede mover acá)

- Multiplanes por alumno · §5 · v2
- Multi-sede · §5 · v2
- Marketplace de profesionales · §4 · Fase 2
- Webpay Plus (Transbank CL) · §5
- Multi-idioma inglés · §8
- Exportación/importación CSV de alumnos · §5
- Reportes avanzados · §5
- **Stripe (cobros domésticos CL)**: código implementado pero no viable como pasarela principal en Chile. Cerrar sandbox y activar en producción solo si hay demanda de clientes internacionales. Decisión: 2026-05-06 por Cristian.
- **Stripe sandbox** (10 puntos del checklist) · §3.4.2 · payments-specialist · 2-3 días — código existe, nunca probado contra sandbox. Postergado hasta decisión de activación.

---

---

## 📱 Mobile — mejoras UX (2026-06-10)

- [x] `[BUG][CERRADO 2026-06-10]` **Timezone bookings**: reservar clase de CrossFit para el jueves bloqueaba por clase del miércoles. Root cause: `setUTCHours(0,0,0,0)` en UTC ponía clases nocturnas chilenas (23:00 → 02:00 UTC siguiente día) en el día incorrecto. Fix: helper `startOfDayUTC(date, timezone)` en `classes.service.ts` usando `Intl.DateTimeFormat`; campo `timezone` agregado al modelo `Gym` (migración `20260611014306_add_gym_timezone`). Cron de waitlist también corregido para calcular `minsUntilClass` correctamente. · backend-dev

- [x] `[NEW][CERRADO 2026-06-10]` **ProgressScreen** (reemplaza pestaña WOD): pantalla nueva en `apps/mobile/src/screens/ProgressScreen.tsx` con dos tabs — "Marcas personales" (RMs agrupados por categoría del gym, indicador de mejora, modal dos pasos con picker exclusivo del `movementLibrary` del gym + buscador, sin texto libre) y "Gimnasia" (habilidades del gym, hitos con progress dots, marcar logrado). `AppNavigator.tsx` actualizado: tab `WOD` → `Progress`, ícono `trending-up`. · mobile-dev

- [x] `[NEW][CERRADO 2026-06-10]` **HomeScreen — refactoring UX**: fusión del bloque membresía dentro del hero (ahorro de espacio), campana de notificaciones en esquina superior derecha del hero, "Mi próxima clase" muestra todas las clases del mismo día, Pizarra del Box corregida para iterar `wod.blocks[].movements` (antes usaba `wod.movements` inexistente), tabs horizontales para múltiples tipos de clase del día, colores glass sutiles (sin pills sólidos). · mobile-dev

- [x] `[NEW][CERRADO 2026-06-10]` **ProfileScreen — limpieza**: eliminadas secciones de RMs y gimnasia (ahora en ProgressScreen). Quedan solo: info del gym, datos personales, estadísticas de asistencia, contraseña, confirmaciones pendientes de waitlist, auto-renovación, QR, logout. · mobile-dev

- [x] `[NEW][CERRADO 2026-06-10]` **ClassesScreen — mejoras de ventana**: `cancelCutoffMins` cargado del gym, botón cancelar deshabilitado dentro del corte. Botón confirmar (waitlist) muestra cuenta regresiva de minutos. · mobile-dev

---

## Bugs reportados por qa-engineer

- [x] `[BUG-SECURITY][CERRADO 2026-05-22]` `POST /payments/callback/payu` — firma obligatoria: `if (!sign) throw new Error('Falta firma PayU')` en línea 719 payments.service.ts. Verificado en código y tests (47/47).

- [x] `[BUG-SECURITY][CERRADO 2026-05-22]` `POST /payments/callback/payu` — userId cross-gym: `getUser(userId, gymId)` en Promise.all línea 705 payments.service.ts. Verificado en código y tests.

- [x] `[BUG-SECURITY][CERRADO 2026-05-22]` `POST /payments/callback/flow` — userId cross-gym: `getUser(userId, gymId)` en Promise.all línea 520 payments.service.ts. Verificado en código y tests.

- [x] `[BUG][CERRADO 2026-05-22]` `handleKhipuCallback` — `cfg.secret ?? ''` en línea 633 payments.service.ts. TypeError eliminado. Verificado en código y tests.

- `[CERRADO 2026-05-04]` ~~Cálculo de carga personalizada no implementado~~ — `calculateLoad` existe en `wod.utils.ts`, integrada en `wod.service.ts`, 26 tests.
- `[CERRADO 2026-05-04]` ~~Redondeo configurable no existe~~ — campo `weightRounding` en schema Gym, migración aplicada, incluido en GET/PUT /gyms/me.
- `[CERRADO 2026-04-30]` ~~Stripe webhook usa JSON en lugar de raw body~~ — corregido con `addContentTypeParser + parseAs: 'buffer'`.
- `[PENDIENTE-BAJA]` Seed borra y recrea movimientos de benchmarks al re-correr (`deleteMany + create`). Funcional, no duplica, pero puede perder IDs externos. Assignee: devops.

---

**Total estimado del cierre crítico (🔴 items restantes)**: ~3-4 días de trabajo concentrado.
**Total estimado de todo (items restantes incluyendo 🟡+🟢+pre-release)**: ~8-10 días de trabajo concentrado.

> Nota al 2026-05-07: implementación ~90% completa. Tests: 895/895 pasando (32 suites). IA retención: 22/22 verde. E2E flujo crítico API: 16/16 verde. Lo que falta: sandboxes reales de pasarelas (MP, Flow, Khipu, MACH, Kushki), E2E web/mobile, Dockerfiles, staging, elegir plataforma de deploy.
>
> Nota al 2026-06-10: Mobile ~88% completo. Bug timezone bookings cerrado. ProgressScreen nueva reemplaza WOD tab. HomeScreen, ClassesScreen y ProfileScreen mejorados. Estimación global sube a ~92%.
>
> Nota al 2026-09-27: RLS de PostgreSQL activo (la app corre como `fitapp_app`), montos en unidad mínima ISO 4217 (CLP = pesos; las menciones antiguas a `priceCents/100` ya no aplican), membresías siempre de 30 días, días calculados en la zona horaria del gym. CI verde con Postgres real: 1035 tests. Pendiente: sandboxes reales de pasarelas y Fintoc, Sentry web/mobile, staging, plataforma de deploy, errores TypeScript preexistentes en mobile.
