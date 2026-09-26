---
name: Auditoría de código real vs. BACKLOG — 2026-04-30
description: Estado real de implementación al 2026-04-30, hallazgos no obvios, discrepancias con BACKLOG original
type: project
---

Auditoría completa del código en `apps/api/src/modules/`, `apps/web/app/`, `apps/mobile/src/screens/` y `apps/api/prisma/schema.prisma`.

**Por qué:** El BACKLOG original marcaba items como pendientes que ya estaban implementados, y viceversa. Esta auditoría alineó la realidad.

**Hallazgos clave:**

1. Las 8 pasarelas de pago (Stripe, MercadoPago, Flow, Khipu, PayU, Kushki, OpenPay, MACH) están TODAS implementadas en `payments.service.ts`. El BACKLOG original las tenía como "Ola 2". PayPal y Fintoc son las únicas que no existen.

2. IA de retención (`getRetentionAlerts`, `getAiInsights`, `getAthleteProjection`) está implementada con llamadas reales a la API de Anthropic Claude. Las pantallas de alerta existen tanto en web como en mobile.

3. Auto-renovación con Stripe está implementada como cron job en `lib/cron.ts` (`runAutoRenewJob`). Incluye reintentos, notificaciones push y desactivación tras max retries.

4. Seed de benchmarks: 113 benchmarks oficiales (27 Girls, 10 Heroes, 66 Open, 10 Games) con idempotencia via campo `externalId` usando `findUnique` + `update/create` manual (no upsert de Prisma).

5. Excel import: existe en el FRONTEND (web), no en el backend. El parser JS está en `apps/web/app/dashboard/wods/import/page.tsx`. El backend solo recibe el JSON ya parseado. No hay validación de esquema Excel en el servidor.

6. `calculateLoad` / `recommendedKg`: NO EXISTE en ningún archivo del proyecto. `wod.service.ts` retorna `recommendedKg: null` hardcodeado en línea 49. El campo `percentage` en `wod.schema.ts` está definido pero ningún servicio lo procesa.

7. `weightRounding` configurable por gym: NO EXISTE en el schema Prisma ni en ningún servicio.

8. Framework de tests: 0 archivos `.test.ts`, 0 archivos `.spec.ts`, no hay vitest ni jest en ningún `package.json` de ninguna app.

**Completitud estimada:** ~75% implementación, 0% tests.

**How to apply:** Antes de asignar trabajo a cualquier agente, verificar en esta auditoría si el feature ya está implementado. El orden de prioridad real es: (1) instalar vitest, (2) que backend-dev implemente calculateLoad, (3) tests unitarios de calculateLoad, (4) tests de integración de multi-tenancy, (5) sandbox Stripe.
