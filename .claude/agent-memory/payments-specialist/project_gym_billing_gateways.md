---
name: project-gym-billing-gateways
description: Cobro Tribu-Box -> gyms (suscripción de plataforma) implementado 2026-11-22 en rama feat/gym-billing-gateways; decisiones D1-D5 y gotchas de implementación
metadata:
  type: project
---

Diseño en `docs/design/gym-billing-gateways.md`; código en `apps/api/src/modules/gym-billing/`. Decisiones de Cristian: D2 Stripe de gyms SOLO env (no en `billingGateways`; PUT es `.strict()` y rechaza `stripe`), D3 activar crea `GymSubscription` nueva, D4 transferencias sin comprobante expiran a 7 días (cron 00:30), D5 prepago extiende desde `endsAt` vigente, D1 (cifrado AES-GCM) pendiente: toda lectura/escritura de credenciales pasa por `billing-config.service.ts`.

**Why:** el flujo viejo de Flow superadmin no era idempotente, no activaba y renovar perdía días/plan.

**How to apply / gotchas:**
- `Prisma.TransactionClient` NO tipa con el prisma extendido del repo: usar `Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]` (exportado como `Tx` en `activation.service.ts`).
- `@fastify/formbody` NO está instalado: el confirm de Flow usa un `addContentTypeParser` urlencoded encapsulado en el plugin (igual que `payments.routes.ts`). El alias viejo del confirm se registra en el mismo plugin para heredar el parser.
- `.env` de dev trae STRIPE_*/FLOW_*: los tests deben borrarlos de `process.env` (resolver lee env en cada llamada) y restaurar.
- `ALLOWED_SUSPENDED_PATHS` y `SUPER_ADMIN_NO_GYM_PATHS` (auth.middleware) necesitaron `/api/gyms/me/billing` para que un gym SUSPENDED vea las pasarelas y SUPER_ADMIN sin gym reciba 400 (no 403).
- Rate limit por ruta (`config.rateLimit`) es por IP (el hook corre antes de authenticate); inerte en tests porque el plugin no se registra.
- Confirm Flow: busca el pago por `gatewayData.token` (JSON path) antes de llamar a Flow; token desconocido = 200 sin llamada saliente.
