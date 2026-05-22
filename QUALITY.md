# QUALITY.md — Termómetro de Calidad FitHub

> Mantenido por el **qa-engineer**. Es lo primero que mira Cristian en la mañana.

**Última actualización**: 2026-05-09 (34) — qa-engineer (bugs Flow/Khipu/PayU/Kushki cerrados en tracking)

**Leyenda**:
- ✅ Verde: tests cubriendo, todos pasando
- ⚠️ Amarillo: parcialmente cubierto, o algunos fallando
- ❌ Rojo: sin cobertura o fallando crítico
- ⏸️ No aplica todavía (feature no implementada)

---

## 🎯 Resumen ejecutivo

| Categoría | Estado | Notas |
|---|---|---|
| Cálculos críticos | ✅ | calculateLoad: 26/26 tests unitarios. wod.service: 45 tests integración (cargas calculadas por género con rmKg incluido) |
| Multi-tenancy | ✅ | 24 tests de integración, 24/24 passing, 0 vulnerabilidades |
| Pasarelas | ⚠️ | Stripe webhook: 12/12. Transfer bancaria: 23. Firmas MP/Khipu/Kushki/MACH: 27/27. Flow Chile: 16/16. Khipu Chile: 16/16. Mercado Pago: 16/16. MACH Business: 16/16. PayU LATAM: 15/15. OpenPay: 20/20. Kushki: 19/19. Sin sandboxes reales. |
| Conciliación bancaria | ✅ | 57 tests integration — 7 endpoints Fintoc, matcher 2 fases, HMAC, cross-gym, idempotencia |
| Fintoc Pay by Bank | ✅ | 19 tests integration — checkout (mock fetch), status (ownership/404), webhook (HMAC, idempotencia, FAILED, sin firma→401) |
| Reservas / Waitlist | ✅ | 30 tests integration — bookClass, cancelBooking, waitlist, confirmar cupo |
| Renovación automática | ✅ | 27 tests passing, estable en paralelo. Bug flaky Caso 24 corregido 2026-05-05 (orderBy + try/finally) |
| activateMembership | ✅ | 20 tests integration — extensión, solapamientos, idempotencia, cross-gym |
| Email automatizado | ✅ | 21 tests unit — sendExpiryReminder, sendPaymentConfirmation, sendBulkEmail, sendWelcomeEmail, sendTestEmail, sendBulkToGyms |
| Push notifications | ✅ | 13 tests unit — sendPushNotification + sendPushToMany: token inválido, chunks, data, swallow errors, múltiples chunks |
| Superadmin | ✅ | 41 tests integración — gyms CRUD, stats, fitapp-plans CRUD, gym-subscriptions, platform config, control de acceso (sin token→401, ADMIN→403, MEMBER→403, SUPER_ADMIN→200) |
| IA de retención y proyecciones | ✅ | 22 tests integración — retention-alerts (DB pura, multi-tenancy), insights (mock Anthropic, backticks, fallback raw), athlete-projection (cross-gym, prompt content, fallback) |
| Importación Excel | ❌ | Sin tests |
| Seed de benchmarks | ✅ | 20 tests — 113 benchmarks, 4 categorías, idempotencia 3x corridas, integridad |
| Auth y multi-rol | ✅ | 18+21=39 tests de integración pasando (incluye refresh token, rotación, revocación, idempotencia, flujo E2E) |
| E2E flujo crítico API | ✅ | 16 pasos: ClassType→Class→WOD→reserva→asistencia→pago transferencia→confirmación→membresía ACTIVE. Sin mocks. |
| Web admin (E2E) | ✅ | 28/28 Playwright (6 flujos: login+dashboard, crear plan, clase+WOD, excel import, fintoc, alertas IA) |
| App móvil (E2E) | ❌ | Sin E2E Maestro/Detox |

**Veredicto**: NO APTO PARA RELEASE. Cobertura de integración ~55%. Falta E2E web/mobile, sandboxes reales de pasarelas, Dockerfiles y staging.

---

## 🧮 Capa 1 — Tests unitarios (lógica pura)

| Suite | Estado | Tests | Cobertura |
|---|---|---|---|
| Cálculo de carga personalizada | ✅ | 26 | 100% |
| Validación de Zod schemas | ❌ | 0 | 0% |
| Transición de estados de Payment | ❌ | 0 | 0% |
| Lógica de redondeo configurable | ❌ | 0 | 0% |
| Validación de planes (tipos de clase, fechas, capacidad) | ❌ | 0 | 0% |
| Matcher de conciliación (Fintoc) | ✅ | 4 | 100% ramas Fase 1 + Fase 2 |
| Cálculo de proyecciones IA | ❌ | 0 | 0% |

**Objetivo**: 90%+ cobertura en lógica pura.

---

## 🔌 Capa 2 — Tests de integración (API + DB real)

| Suite | Estado | Tests |
|---|---|---|
| Auth (login, rutas protegidas, roles, expiración, refresh token, logout) | ✅ | 18+21=39 |
| Users CRUD (listar, crear, actualizar, reset-password, permisos, multi-tenant) | ✅ | 45 |
| Classes CRUD (ClassType + Class instancias) | ✅ | 42 (ClassType CRUD permisos/aislamiento/bloques, Class CRUD + filtros fecha, recurrentes, bulk delete, attendance) |
| bookClass / cancelBooking / waitlist | ✅ | 31 (ventanas, cutoff, capacidad, TRIAL, waitlist confirm enabled/disabled, doble reserva, admin sin restricción, cross-gym) |
| Plans CRUD (listPlans, createPlan, updatePlan, deactivatePlan, assignMembership, renewMembership) | ✅ | 49 (permisos por rol, validaciones Zod, tenancy, endsAt calculado, isTrial→TRIAL+pricePaid=0, membresía previa desactivada, plan inexistente→400/404) |
| Payments CRUD (history, revenue, gateways, my-memberships, auto-renew, manual, checkout, checkout-self) | ✅ | 54 |
| Transferencia bancaria (submit/confirm/reject) | ✅ | 23 |
| Gyms/settings (GET/PUT me, movements-library, skills CRUD, cross-gym isolation) | ✅ | 53 |
| Analytics / RMs / progresión gimnástica | ✅ | 39 |
| Analytics / IA retención (retention-alerts, insights, athlete-projection) | ✅ | 22 (retention-alerts: sin token→401, MEMBER→403, estructura, atRisk, expiringSoon daysLeft, inactive, multi-tenancy gymA/gymB; insights: 401, 403, llama Anthropic con datos, insights+summary, backticks, fallback raw, type≠text→500; athlete-projection: 401, cross-gym→500, admin→200 athlete+projections+coachTip, MEMBER usa userId del token, prompt con RMs, fallback raw, backticks) |
| WOD planning (POST/GET/PUT/DELETE, class loads, cross-gym) | ✅ | 45 |
| **Multi-tenancy (aislamiento entre gyms)** | ✅ | 24 |
| Webhooks de pasarelas (idempotencia) | ⚠️ | 12 (Stripe: firma válida/inválida, duplicados, timestamp expirado, eventos desconocidos) |
| Validación firma entrante (Mercado Pago, Khipu, Kushki, MACH) | ✅ | 27 (unit puro + HTTP: firma válida, inválida, ausente, malformada, sin secret=pasa, mapeo 401) |
| Job de renovación automática (con time-travel) | ⚠️ | 27 passing en individual. Caso 24 flaky en paralelo (condición de carrera: mock consumido por otro test) |
| **activateMembership (lógica central de membresías)** | ✅ | 20 (primera membresía, extensión vs. hoy, TRIAL, vencida, solapamientos, updateMany, idempotencia, plan inexistente, extraData, cross-gym) |
| Superadmin (gyms CRUD, stats, fitapp-plans, gym-subscriptions, platform config) | ✅ | 41 (control de acceso 4, gyms lista+campos 3, stats 2, POST /gyms 6, PATCH status 4, DELETE soft 4, GET detalle 2, fitapp-plans CRUD 6, gym-subscriptions 5, platform config 5) |
| Importación Excel | ❌ | 0 |
| Seed de benchmarks (idempotencia) | ✅ | 20 (113 benchmarks, 4 categorías, 3x corridas idempotentes, integridad de datos) |

**Objetivo**: 70%+ de endpoints cubiertos.

---

## 💳 Capa 3 — Tests de pasarelas (sandbox real)

Cada pasarela debe pasar el checklist de 10 puntos definido en `payments-specialist.md`.

| Pasarela | Estado | Puntos del checklist |
|---|---|---|
| Stripe | ⚠️ | 4/10 — webhook OK (firma, duplicados, timestamp, eventos desconocidos). Falta: pago sandbox real, tokenización, cobro con token expirado, logs en DB |
| Mercado Pago | ⚠️ | 5/10 — checkout (sin auth→401, Zod→400, plan inexistente→400, gym sin config→400, MP API error→400, éxito→{url,preferenceId}, external_reference verificado) + webhook (action desconocida→received:true, sin data.id→received:true, MP falla→no activa, status pending→no activa, gymId no coincide→no activa, éxito completo→membresía ACTIVE, idempotencia 2x→1 membresía, firma global inválida→401, payment.updated también activa). Falta sandbox real. |
| Khipu | ⚠️ | 7/8 — checkout: sin JWT→401, Zod no-uuid→400, plan inexistente→400, gym sin config→400, API ok:false→400, éxito→200 url+paymentId, firma Authorization={receiverId}:{khipuSign} verificada. Callback: sin params→400, getPayment falla→400, status pending→400, sin firma con secret→401, firma inválida→401, éxito→membresía ACTIVE+paymentNotes khipu:{id}+paymentMethod khipu, idempotencia→1 sola membresía, cross-gym userId→400. [CERRADO] secret=undefined: fix cfg.secret ?? '' aplicado (línea 599 payments.service.ts). Falta sandbox real. |
| Flow | ⚠️ | 5/8 — checkout (ok, firma HMAC, API error, code≠0, plan inválido, gym sin config); callback (status 2 aprobado, status 3/1 rechazado, ok false→400, idempotencia, cross-gym gymId, cross-gym userId→400). [CERRADO] cross-gym userId: Promise.all([getGym, getUser(userId,gymId)]) aplicado (línea 486 payments.service.ts). Falta sandbox real. |
| PayU | ⚠️ | 7/9 — checkout: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config→400, éxito→200 {url,params,referenceCode}, firma MD5 verificada, test=1 sandbox, buyerEmail verificado; callback: sin query params→400, firma inválida→400, state 5/6 rechazado/pendiente→400, éxito state "4"→membresía ACTIVE, idempotencia 2x→1 membresía, cross-gym gymId→400, cross-gym userId→400, sin sign→400. [CERRADO] BUG-SEC sign obligatorio + BUG-SEC userId cross-gym: ambos fixes aplicados (líneas 671+685 payments.service.ts). Falta sandbox real. |
| Kushki | ⚠️ | 8/10 — checkout: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config→400, API error→400, API sin URL→400, éxito→200 {url,chargeToken}; callback: sin gymId→400, gymId inexistente→400, sin x-kushki-token→401, JWT sin puntos→401, merchantId incorrecto→401, DECLINED→400, FAILED→400, éxito APPROVAL→membresía ACTIVE, idempotencia 2x→1 membresía, plan inexistente→400, status ausente→200+activa, gym sin Kushki habilitado→400. [CERRADO] BUG-SEC enabled check + BUG JWT format→401: ambos fixes aplicados (líneas 802+283 service/routes). Falta sandbox real + verificación criptográfica JWT. |
| OpenPay | ⚠️ | 20 tests — checkout (sin JWT→401, Zod→400, plan inexistente→400, gym sin config→400, API error→400, sin URL→400, éxito→{url,transactionId,orderId}, Basic Auth verificado, redirect_url directo→200); callback GET (sin params→redirect cancelled, gymId inexistente→redirect cancelled, getStatus falla→redirect cancelled, pago pending→redirect cancelled, pago failed→redirect cancelled, éxito→membresía ACTIVE+redirect success, idempotencia 2x→1 membresía, cross-gym→redirect cancelled, array vacío→redirect cancelled, objeto directo→membresía ACTIVE, URL sandbox verificada). 0 bugs. Falta sandbox real. |
| MACH | ⚠️ | 7/8 — checkout: sin JWT→401, Zod no-uuid→400, plan inexistente→400, gym sin config→400, MACH API error→400, éxito→200 {url,externalId,linkId}, Authorization:Bearer apiKey verificado en request a MACH; webhook: sin Authorization→401, token inválido→401, status PENDING→no activa+{received:true}, éxito PAID→membresía ACTIVE+paymentNotes mach:{id}+paymentMethod mach, éxito COMPLETED→igual, idempotencia 2x→1 membresía, cross-gym gymId→{received:true} sin membresía, external_id malformado→{received:true}, sin external_id→{received:true}. Falta sandbox real. |
| PayPal | ⏸️ | desactivado por defecto |
| Fintoc (conciliación) | ✅ | 57 tests integration — link/status/sync/movements/confirm/reject/webhook. Matcher 2 fases verificado. HMAC SHA-256. |
| Fintoc Payments (Pay by Bank) | ✅ | 19 tests integration — checkout mock fetch (pasarela habilitada/no, Fintoc API 500, plan inexistente, DB verify); status (:intentId ownership, PENDING/SUCCEEDED, cross-user→404, inexistente→404); webhook HMAC-SHA256 (sin firma→401, firma inválida→401, succeeded crea membresía, idempotencia 2x, failed→FAILED+sin membresía, sin gymId→400) |

**Cuándo se considera ✅**: 100% del checklist verde para esa pasarela.

---

## 🌐 Capa 4 — Tests E2E

### Flujo crítico API (Vitest + Fastify + DB real) — NUEVO 2026-05-07

| Paso | Estado |
|---|---|
| Admin crea ClassType y Class (mañana 09:00) | ✅ |
| Admin crea WOD con bloque Strength (Back Squat percentageOfRm=70) | ✅ |
| Alumno adquiere membresía activa (DB directo) | ✅ |
| Alumno reserva la clase via POST /bookings → CONFIRMED | ✅ |
| Alumno registra RM de Back Squat via POST /rms | ✅ |
| Alumno consulta WOD de su clase via GET /wods/class/:id | ✅ |
| Admin registra asistencia via PATCH /bookings/:id/attend → ATTENDED | ✅ |
| Alumno sube comprobante (service directo) → INACTIVE+PENDING_REVIEW | ✅ |
| Admin lista transferencias pendientes → aparece la del alumno | ✅ |
| Admin confirma transferencia → ACTIVE+CONFIRMED+paidAt | ✅ |
| Alumno consulta GET /payments/my-memberships → membresía ACTIVE visible | ✅ |
| Verificación DB: booking sigue ATTENDED | ✅ |
| Verificación DB: membresía transferida ACTIVE con paidAt | ✅ |
| Verificación DB: WOD intacto con bloques y movimientos | ✅ |
| Verificación HTTP: GET /gyms/me → gym operativo | ✅ |

**Resultado**: 16/16 pasos, 0 mocks, DB real, servidor Fastify real.

### Web admin (Playwright)

| Flujo | Estado | Tests |
|---|---|---|
| Login admin → ver dashboard con métricas | ✅ | 5/5 |
| Crear plan → ver disponible para alumno | ✅ | 4/4 (1 skip intencional: asignar pasarelas pendiente UI) |
| Crear tipo de clase → calendario clases → WOD redirect | ✅ | 5/5 (1 skip intencional: form data-testid pendiente) |
| Importar planificación por Excel → validar datos cargados | ✅ | 3/3 |
| Conciliación bancaria Fintoc (4 tabs, sync, sidebar nav) | ✅ | 5/5 |
| Ver alerta IA de retención (heading, insights, generate button) | ✅ | 5/5 |

### Mobile alumno (Maestro/Detox)

| Flujo | Estado |
|---|---|
| Registro → login → ver clase del día | ❌ |
| Reservar clase dentro de ventana configurada | ❌ |
| Registrar RM nuevo → ver carga calculada en próximo WOD | ❌ |
| Marcar hito de progresión gimnástica | ❌ |
| Pagar plan con Stripe → ver plan activado | ❌ |
| Subir comprobante de transferencia | ❌ |
| Activar/desactivar auto-renew | ❌ |

**Objetivo**: 5-8 flujos críticos verdes. No más.

---

## 🚨 Bloqueadores actuales para release MVP

1. ⚠️ **Stripe pago sandbox real pendiente** — webhook OK (12/12 tests), pero nunca se ha ejecutado un pago real contra tarjetas de test de Stripe. Riesgo de cobros fallidos en producción.
2. ✅ **Multi-tenancy cubierto** — 24 tests + aislamiento verificado en todos los módulos. 0 vulnerabilidades.
3. ✅ **Cálculo de carga** — 26 tests unitarios + 45 tests integración WOD. `calculateLoad` integrada y funcionando.
4. ✅ **Renovación automática** — 27 tests estables en paralelo. Bug flaky corregido 2026-05-05.
5. ✅ **E2E flujo crítico API** — 16 pasos verde: ClassType→Class→WOD→reserva→asistencia→transferencia→membresía ACTIVE. Sin mocks. Falta E2E web (Playwright) y mobile (Maestro).
6. ❌ **Sin staging** — no hay ambiente de staging con datos reales. Decisión de plataforma pendiente (Railway / Render / VPS).
7. ❌ **Pantalla web Fintoc** — backend implementado (57 tests), sin UI para gestionar movimientos bancarios.

---

## 📈 Histórico

[El qa-engineer agrega entradas aquí cuando algo cambia de rojo a verde, para ver progreso]

```
2026-04-30  Setup vitest en apps/api: ❌ → ✅ (vitest 4.1.5 + @vitest/coverage-v8)
2026-04-30  calculateLoad unitario: ❌ → ✅ (26 tests, 26/26 passing, 100% cobertura de wod.utils.ts)
2026-04-30  Auth integración: ❌ → ✅ (18 tests, 18/18 passing, auth.routes.ts 61.5% cobertura, 0 bugs encontrados)
2026-04-30  Stripe webhook: ❌ → ⚠️ (12 tests, 12/12 passing — 2 bugs corregidos: rawBody nunca disponible en prod, body vacío causaba 500)
2026-04-30  Multi-tenancy: ❌ → ✅ (24 tests, 24/24 passing — 5 suites: listados, acceso por ID, escritura, creación, token. 0 vulnerabilidades. Nuevo endpoint DELETE /bookings/:bookingId/admin cubierto)
2026-04-30  Seed benchmarks: ⏸️ → ✅ (20 tests, 20/20 passing — 113 benchmarks totales, 4 categorías correctas, 3x corridas idempotentes, integridad de nombres/movimientos/formato/año. Total acumulado: 100/100 tests)
2026-04-30  Transferencia bancaria: ❌ → ✅ (23 tests, 23/23 passing — submit, confirm, reject, pendientes, idempotencia, cross-gym, permisos, desactivación membresía previa. Total acumulado: 123/123 tests)
2026-05-04  Auto-renovación: ❌ → ✅ (27 tests, 27/27 passing — filtros del job, maxRetries configurable, cobro exitoso, extensión desde endsAt, carry-forward, cobro fallido, idempotencia, fake timers, múltiples usuarios. Total acumulado: 150/150 tests)
2026-05-04  bookClass/cancelBooking/waitlist: ❌ → ✅ (30 tests, 30/30 passing — ventanas temporales, cutoff reserva y cancelación, membresía INACTIVE/vencida, TRIAL maxClasses, clase llena→WAITLIST, doble reserva, reactivación CANCELLED, waitlist confirm enabled/disabled, admin sin restricción de tiempo, cross-gym. Total acumulado: 181/181 tests)
2026-05-04  activateMembership: ❌ → ✅ (20 tests, 20/20 passing — primera membresía, extensión desde endsAt vs. hoy, TRIAL extiende, vencida no extiende, INACTIVE ignorada, múltiples ACTIVE→todas INACTIVE, solo 1 ACTIVE post-activación, doble activación encadena extensiones, plan inexistente→early return, extraData autoRenew+stripePaymentMethodId, aislamiento cross-user. Total acumulado: 201/201 tests)
2026-05-04  seedBenchmarks verificado: 20/20 passing — confirmados 27 GIRL + 10 HERO + 66 OPEN + 10 GAMES = 113. Idempotencia verificada 3x corridas. Seed usa findUnique+create/update (no prisma.upsert). Ningún bug de duplicación encontrado.
2026-05-04  autorenew Caso 24: ✅ → ⚠️ — bug flaky detectado. 27/27 en individual, 26/27 en paralelo. Condición de carrera: mock consumido por test anterior que no limpió membresía. Asignado a backend-dev.
2026-05-04  Users CRUD: ❌ → ✅ (45 tests, 45/45 passing — GET listar con aislamiento multi-tenant, filtros role/status, GET by ID, POST crear con validaciones + email/RUT duplicado, PUT actualizar, reset-password, permisos MEMBER/COACH/SUPER_ADMIN. Total acumulado: 246/246 tests). Bug de seguridad encontrado: POST /users expone passwordHash en respuesta.
2026-05-04  Gyms/settings: ❌ → ✅ (53 tests, 53/53 passing — GET/PUT /gyms/me, movements-library GET/PUT, GymSkills seed automático idempotente, skills CRUD completo, aislamiento cross-gym en todos los endpoints. Total acumulado: 254/254 tests)
2026-05-04  Plans CRUD: ❌ → ✅ (49 tests, 49/49 passing — listPlans, createPlan, updatePlan, deactivatePlan, assignMembership, renewMembership. Gotcha: fake UUIDs todo-ceros fallan Zod z.string().uuid() en body — usar UUID v4 reales. deactivatePlan no bloquea por membresías activas. Total acumulado: 348/348 tests)
2026-05-04  Classes CRUD: ❌ → ✅ (42 tests, 42/42 passing — ClassType GET/POST/PUT/DELETE con bloques, aislamiento cross-gym, validaciones Zod; Class GET listado con filtros fecha + myBookingStatus, GET por ID con coach+classType+wods, POST ONCE y RECURRING, PATCH, DELETE individual y bulk, GET attendance por hora. Total acumulado: 429/429 tests)
2026-05-04  WOD planning: ❌ → ✅ (45 tests, 45/45 passing — POST crear con dupl-check, GET by class, GET my-loads con rmKg, GET list filtros from/to, PUT replace bloques, DELETE cascade blocks+movements, aislamiento cross-gym en 5 endpoints, permisos MEMBER/COACH/ADMIN, estructura jerárquica WodBlock→WodMovement. Gotcha: Class_coachId_fkey requiere borrar clases antes que usuarios en cleanup. Total acumulado: 528/528 tests)
2026-05-04  Payments CRUD: ❌ → ✅ (54 tests, 54/54 passing — GET history/revenue/gateways con permisos MEMBER/COACH/ADMIN, tenancy Gym A vs Gym B; GET my-memberships solo ve las propias; PUT auto-renew con/sin stripePaymentMethodId, membresía INACTIVE→404; POST manual con validaciones Zod, cross-gym, desactivación previa, pago en cascada; POST checkout/checkout-self con mock Stripe, validaciones planId/userId cross-gym. Stripe mockeado: no hay llamadas reales. Total acumulado: 528/528 tests)
2026-05-05  Refresh token: ❌ → ✅ (21 tests, 21/21 passing — login devuelve refreshToken+exp en JWT; POST /auth/refresh: token válido→rotación, revocado→401, expirado→401, inexistente→401, body inválido→400, sin Authorization→200; rotación encadenada: token rotado funciona, anterior no; POST /auth/logout: sin JWT→401, idempotente (2x→200), token de otro usuario→no-op, token inexistente→no-op; flujo E2E completo login→refresh→/me→logout→refresh falla. Total acumulado: 549/549 tests)
2026-05-05  Validación firma entrante pasarelas: ❌ → ✅ (27 tests, 27/27 passing — Mercado Pago: sin secret pasa, con secret sin firma→error, formato malformado→error, hash incorrecto→error, firma válida pasa, template sin notificationId/requestId; Khipu: sin header→error, hash equivocado→error, firma válida string/Buffer pasa, body tampered→error; Kushki: token ausente→error, no-JWT→error, 2-segmentos→error, merchantId correcto pasa, merchant_id guion-bajo pasa, merchantId no-coincide→error, payload inválido→error; MACH: sin header→error, Bearer correcto pasa, sin Bearer pasa, Bearer incorrecto→error, longitud diferente→error, vacío→error. Mapeo 401 en rutas verificado. Total acumulado: 588/588 tests)
2026-05-05  Fintoc conciliación bancaria: ❌ → ✅ (57 tests, 57/57 passing — POST /fintoc/link: upsert idempotente, campos opcionales, gymId del JWT no del body, auth/permisos, cross-gym; GET /fintoc/status: sin link, con link, pendingCount real; POST /fintoc/sync: 2 nuevos, idempotencia exacta, mezcla, lastSyncAt, sin FintocLink→400; Matcher: Fase 1 exact_rut confirma automáticamente membresía+movimiento, RUT no coincide→no confirma, Fase 2 amount_only MATCHED sin confirmar, sin candidatos→PENDING; GET /fintoc/movements: filtros status, paginación limit/offset, cross-gym gymA vs gymB; PATCH /confirm: flujo feliz, doble→400, cross-gym→400; PATCH /reject: con/sin reason, ya rechazado→400, ya confirmado→400, cross-gym→400; POST /webhook/fintoc: sin gymId→400, body.gymId, body.metadata.gymId, sin firma→pasa, HMAC válido, HMAC inválido→401, idempotencia, gymId inexistente→400, movements vacíos. Total acumulado: 645/645 tests)
2026-05-06  Flow Chile: ❌ → ⚠️ (16 tests, 16/16 passing — Suite checkout: sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin flow→400, Flow API ok:false→400, code≠0→400, éxito→200 url/token/commerceOrder, verificación firma HMAC-SHA256 campo s; Suite callback: sin params→400, getStatus ok:false→400, status 3→400, status 1→400, status 2→200+membresía ACTIVE+paymentNotes flow:token+paymentMethod flow, idempotencia 2x→1 membresía, cross-gym gymId→400, cross-gym userId→bug documentado [BUG-SEC] no rechaza userId de otro gym. Total acumulado: 680/680 tests)
2026-05-06  Fintoc Pay by Bank: ❌ → ✅ (19 tests, 19/19 passing — Suite checkout: sin JWT→401, planId faltante/inválido→400, gym sin pasarela→400, plan inexistente→400, Fintoc API 500→400, éxito→200+DB verify PENDING+campos gymId/userId/planId/amountCents; Suite status: sin JWT→401, PENDING→{status,membershipId:null}, SUCCEEDED→{status,membershipId}, cross-user→404, inexistente→404; Suite webhook: sin firma→401, HMAC inválida→401, succeeded+firma válida→200+membresía ACTIVE+intent SUCCEEDED, idempotencia 2x→1 sola membresía, failed+firma válida→intent FAILED+sin membresía+count=0, gymId inexistente→error≥400, sin gymId en metadata→400. Gotcha: prisma.fintocPaymentIntent requiere regenerar cliente tras migración (pnpm prisma generate). Total acumulado: 664/664 tests)
2026-05-06  Khipu Chile: ❌ → ⚠️ (16 tests, 16/16 passing — Suite checkout (7): sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config Khipu→400, Khipu API ok:false→400, éxito→200 {url,paymentId}, verificación firma Authorization={receiverId}:{khipuSign(POST,url,body,secret)}; Suite callback (9): sin params→400, getPayment ok:false→400, status pending→400, sin x-khipu-signature con secret→401, x-khipu-signature inválida→401, éxito+firma válida→200+membresía ACTIVE+paymentNotes khipu:{id}+paymentMethod khipu, idempotencia 2x→1 membresía, cross-gym userId→400 (fix 2026-05-06 aplicado con getUser), bug khipuSign secret=undefined→TypeError documentado (gym sin secret no puede procesar callbacks). Bug asignado a backend-dev. Total acumulado: 696/696 tests)
2026-05-07  Mercado Pago: ❌ → ⚠️ (16 tests, 16/16 passing — Suite checkout (7): sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin MP→400, MP API ok:false→400, éxito→200 {url,preferenceId}, external_reference=gymId|planId|userId verificado; Suite webhook (9): action desconocida→received:true, sin data.id→received:true, MP getPayment ok:false→received:true sin membresía, status pending→no activa, gymId no coincide→no activa, éxito completo payment.created→membresía ACTIVE paymentMethod mercadopago paymentNotes mp:{id}, idempotencia 2x→1 sola membresía, firma global inválida→401, payment.updated también activa. 0 bugs encontrados. Total acumulado: 712/712 tests)
2026-05-07  MACH Business: 1/8 → ⚠️ (16 tests, 16/16 passing — Suite checkout (7): sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config MACH→400, MACH API ok:false→400, éxito→200 {url,externalId,linkId} externalId=gymId8-planId8-userId8-timestamp, Authorization:Bearer apiKey verificado en request + amount=priceCents/100 + currency=CLP; Suite webhook (9): sin Authorization con gym.webhookSecret→401, Bearer incorrecto→401, status PENDING→no activa+{received:true}, PAID+token válido→membresía ACTIVE+paymentNotes mach:{id}+paymentMethod mach, COMPLETED+token válido→igual, idempotencia 2x→1 sola membresía, cross-gym gymBId prefix sin MACH→{received:true} sin membresía, external_id malformado→{received:true}, sin external_id→{received:true}. 0 bugs encontrados. Total acumulado: 728/728 tests)
```

2026-05-07  PayU LATAM: ❌ → ⚠️ (15 tests, 15/15 passing — Suite checkout (6): sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config PayU→400, éxito→200 {url,params,referenceCode} con URL sandbox.checkout.payulatam.com, firma MD5(apiKey~merchantId~referenceCode~amount~currency) verificada en params.signature + test=1 + buyerEmail correcto; Suite callback (9): sin query params→400, firma inválida→400, transactionState 5 rechazado→400, transactionState 6 pendiente→400, éxito state "4" firma válida→membresía ACTIVE paymentMethod payu paymentNotes payu:{ref}, idempotencia 2x→1 membresía, cross-gym gymId→400; [BUG-SEC] sin campo sign aceptado sin verificar firma, [BUG-SEC] userId cross-gym no validado. 2 bugs de seguridad nuevos asignados a backend-dev. Total acumulado: 743/743 tests)
2026-05-07  OpenPay: ❌ → ⚠️ (20 tests, 20/20 passing — Suite checkout (9): sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config OpenPay→400, OpenPay API ok:false→400, sin URL de pago→400, éxito→200 {url,transactionId,orderId}, Basic Auth base64(privateKey:) verificado + merchant URL sandbox + body.customer.email + redirect_url con gymId/planId/userId, redirect_url en root del objeto→200; Suite callback GET (11): sin params→redirect cancelled, gymId inexistente→redirect cancelled, getStatus falla→redirect cancelled, pago pending→redirect cancelled, pago failed→redirect cancelled, éxito completed→membresía ACTIVE+paymentMethod openpay+paymentNotes openpay:{chargeId}+redirect success, idempotencia 2x→1 membresía, cross-gym gymBId sin openpay→redirect cancelled, array vacío→redirect cancelled, objeto directo→membresía ACTIVE, URL sandbox con order_id verificada. Nota: callback es GET sin firma — diseño correcto. 0 bugs. Total acumulado: 763/763 tests)
2026-05-07  E2E flujo crítico API: ❌ → ✅ (16 pasos, 16/16 passing — ClassType→Class→WOD→reserva→asistencia→transfer receipt→confirm→membresía ACTIVE. Gotcha: POST /wods recibe date string YYYY-MM-DD que Prisma guarda como UTC medianoche; dayRange() usa setHours local — desfase de timezone hace que el WOD no aparezca en consulta de clase. Solución: crear WOD via Prisma con new Date() que respeta timezone local. Sin mocks, DB real, Fastify real. Total acumulado: 798/798 tests)
2026-05-07  Email module: ❌ → ✅ (21 tests, 21/21 passing — sendExpiryReminder: 5 tests (gym inexistente→sin sendMail, Ethereal fallback, subject por defecto gymName+días, subject personalizado con {{nombre}}/{{dias}}/{{plan}}, singular "día" con daysLeft=1); sendPaymentConfirmation: 5 tests (gym inexistente, Ethereal fallback to:memberEmail, subject contiene planName, placeholders reemplazados, HTML contiene monto 29.900 CLP); sendBulkEmail: 3 tests (gym inexistente→{sent:0,failed:N}, 2 recipients éxito con placeholders resueltos, 1 falla→{sent:1,failed:1}); sendWelcomeEmail: 3 tests (to:adminEmail, subject contiene gymName, HTML contiene tempPassword+gymSlug); sendTestEmail: 3 tests (gym inexistente→throws, Ethereal→{success:true}, to=gym.email cuando existe); sendBulkToGyms: 2 tests (sin SMTP→{sent:0,failed:N,errors:["SMTP no configurado"]}, con SMTP→iteración y envío a ownerEmail con placeholders). Gotcha: vi.mock() factory no puede referenciar variables del módulo (hoisting). Solución: currentSendMail se recrea en beforeEach y se pasa como impl de createTransport. vi.restoreAllMocks() en afterEach restaura solo spyOn de prisma. Total acumulado: 819/819 tests)
2026-05-07  Kushki: 1/10 → ⚠️ 6/10 (19 tests, 19/19 passing — Suite checkout (6): sin JWT→401, planId no-uuid→400 Zod, plan inexistente→400, gym sin config Kushki→400, Kushki API ok:false→400, API sin URL→400, éxito→200 {url,chargeToken}, Private-Merchant-Id+callbackURL(gymId+planId+userId)+URL sandbox api-uat.kushkipagos.com verificados; Suite callback (13): sin gymId→400, gymId inexistente→400, sin x-kushki-token con privateMerchantId→401, JWT sin puntos→400 (bug: mapeo 401 no aplica para "no tiene formato JWT"), merchantId incorrecto→401, DECLINED→400, FAILED→400, éxito APPROVAL→membresía ACTIVE+paymentNotes kushki:{id}+paymentMethod kushki, idempotencia 2x→1 membresía, cross-gym gymBId→200 [BUG-SEC gym sin Kushki habilitado no lanza error→activa cross-plan], plan inexistente→400, status ausente→200+activa. 2 bugs documentados asignados a backend-dev. Total acumulado: 782/782 tests)
2026-05-07  Push notifications: ❌ → ✅ (13 tests, 13/13 passing — sendPushNotification: token inválido→no llama send, token válido→chunkPushNotifications con mensaje correcto (to/title/body/sound:default), send llamado con el chunk, data opcional incluida en mensaje, data undefined no lanza, sendPushNotificationsAsync lanza→swallow silencioso (no propaga error), retorna undefined siempre; sendPushToMany: array vacío→no filtra ni envía, todos inválidos→0 válidos→no envía, mixto 2 válidos 1 inválido→chunk recibe solo 2, 3 tokens→send llamado 1 vez, lanza→swallow silencioso, 2 chunks→send llamado 2 veces (una por chunk). Gotcha: vi.hoisted() obligatorio para exponer mocks al factory de vi.mock() — expo instancia Expo en top-level del módulo. Total acumulado: 832/832 tests)
2026-05-07  IA de retención: ❌ → ✅ (22 tests, 22/22 passing — Suite retention-alerts (7): sin token→401, MEMBER→403, estructura {atRisk/expiringSoon/inactive}, miembro ACTIVE sin bookings 7d→atRisk, membresía vencimiento 3d→expiringSoon con daysLeft[2..4], usuario sin membresía→inactive, multi-tenancy gymA no ve gymB y viceversa; Suite insights (6): sin token→401, MEMBER→403, llama anthropic.messages.create con prompt de datos del gym, respuesta con insights+summary, backticks json→parse limpio sin campo raw, texto no-JSON→{raw:texto}, type!='text'→500; Suite athlete-projection (9): sin token→401, userId cross-gym→500 "Usuario no encontrado" sin llamar Anthropic, admin consulta miembro su gym→200+athlete+projections+coachTip, MEMBER usa userId del token no el param→200, RMs en DB→prompt contiene movement+initial+current kg, texto no-JSON→{athlete,raw}, backticks→parse limpio. Gotcha clave: ai.service.ts instancia Anthropic en top-level → vi.hoisted() obligatorio para mock (mismo patrón que expo-server-sdk en push.ts). Total acumulado: 895/895 tests)
2026-05-09  E2E web Playwright: ❌ → ✅ (28/28 tests, 2 skip intencionales — 6 flujos: login+dashboard KPI (5/5), crear plan monthly+trial+validación+cancelar (4/4+1skip), class-types+calendario+wods-redirect+import (5/5+1skip), excel import UI+upload+WODs page (3/3), fintoc 4tabs+nav+sync+sidebar (5/5), alertas IA heading+insights+generate+nav+no-error-JS (5/5). Gotcha crítico: Zustand race condition — useEffect([user]) con user=null redirige a /login antes de que loadFromStorage() actualice el store. Solución: loginUI() hace SPA navigation via Next.js router → store permanece en memoria → user != null en primer render de la nueva página. Los labels del dashboard NO tienen htmlFor → usar getByPlaceholder(). El sidebar usa <button>, no <a href>. FintocPage.waitForLoad() con getByText('Pendientes') causa strict mode violation → usar getByRole('button', { name: 'Pendientes' }). PlansPage inputs → getByPlaceholder() porque labels sin for. Test user en DB: e2e-admin@fitapp.test / E2eAdmin123! / gym slug: e2e-test-gym)