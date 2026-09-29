---
name: testing-e2e-payments-gotchas
description: Gotchas de la suite Playwright (apps/web/e2e/modules) para Pagos, Fintoc, Alertas IA y Comunicaciones, incluido el rate limit 429 al correr varios agentes en paralelo
metadata:
  type: project
---

Hallazgos de 2026-09-29 al escribir payments/fintoc/ai/communications.spec.ts:

- **Rate limit global 120 req/min por IP** (apps/api/src/index.ts). Cada página del panel hace unas 10 llamadas, así que con 4 agentes en paralelo aparecen 429. Síntomas engañosos: el wizard «Bienvenido a FitHub» aparece (layout.tsx lo muestra si /class-types y /plans fallan, porque el catch devuelve []), y /dashboard/users/:id vuelve a la lista (el catch hace router.push). **How to apply:** si ves esos síntomas, sospecha primero de un 429. Corre con `--output=<scratchpad>` (test-results/ es compartido) y espera a que no haya otro `npm exec playwright test` corriendo.
- La pestaña de Conciliación que ya está activa (Pendientes) no vuelve a pedir la lista al hacer clic: no esperes el response ahí.
- Solo se pueden crear movimientos Fintoc mediante un webhook firmado con `paymentGateways.fintoc.webhookSecret`, que el seed no configura. FIN-02 y FIN-03 consumen los movimientos del seed: se saltan si no hay seed fresco.
- Patrón re-ejecutable para transferencias: POST /users (admin) → login del alumno con gymSlug → POST multipart /payments/transfer/receipt?planId= (FormData+Blob) → limpiar con DELETE /users/me del propio alumno (no existe un DELETE /users/:id para admin).
- Formatos de monto distintos: Pagos muestra "35.000 CLP", Conciliación "$ 35.000" y el helper clp() "$35.000".
- Bugs abiertos: submitTransferReceipt desactiva la membresía vigente antes de la revisión (PAY-06), y la UI de Comunicación dice «enviado» aunque failed>0 (COM-01).

Relacionado: [[testing-fintoc-gotchas]], [[testing-payments-crud-gotchas]]
