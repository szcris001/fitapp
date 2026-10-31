---
name: feedback-input-validation-pattern
description: Patrón exacto para validar query/body con Zod en payments y evitar fugas de errores crudos (Prisma, multipart, etc.)
metadata:
  type: feedback
---

Todo endpoint de `payments.routes.ts` que recibe datos externos (`request.query` o `request.body`) sin validar antes de pasarlos a una función de `payments.service.ts` termina, tarde o temprano, filtrando un error crudo del motor subyacente (Prisma, `@fastify/multipart`, etc.) directo al cliente — incluyendo rutas absolutas del filesystem del servidor. Van dos hallazgos QA de este tipo cerrados en `payments/`:

1. `POST /payments/transfer/receipt` sin `Content-Type: multipart` — el `await (request as any).file()` lanzaba fuera del `try/catch` del handler (2026-10-31, hallazgo H02 de `2026-10-30-2300`).
2. `GET /payments/fintoc/movements` sin Zod en `status`/`limit`/`offset` — `status` inválido llegaba crudo al `where.reconciliationStatus`, `limit`/`offset` con `parseInt` sin chequeo podían ser `NaN` o negativos, y Prisma devolvía su error nativo (con ruta absoluta) en el catch genérico `{ error: err.message }` (2026-10-31, hallazgo H02 de `2026-10-31-0801`).

**Why**: cualquier ruta de `payments.routes.ts` que haga `request.query as any` o similar sin `safeParse` es sospechosa de este mismo bug — vale la pena revisarlas todas como barrido preventivo la próxima vez que se toque el archivo.

**How to apply**: patrón exacto a copiar (ya usado en todo el repo, no solo en pagos): `const parsed = algunSchema.safeParse(request.query)` → si falla, `return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.flatten() })`. Los schemas de query string van en `payments.schema.ts` junto a los de body (`confirmTransferSchema`, `rejectTransferSchema`, `listBankMovementsSchema`), usando `z.coerce.number()` para campos numéricos que llegan de query string (siempre strings). Acotar rangos razonables (`limit` 1-100, `offset >= 0`). Para enums que reflejan un enum de Prisma (ej. `ReconciliationStatus`), confirmar los valores reales contra `prisma/schema.prisma` antes de escribirlos — no asumir desde el ticket/hallazgo qué valores tiene el enum, puede estar desactualizado.
