---
name: zod-validation-leak-pattern
description: payments.routes.ts endpoints sin Zod filtran stack traces de Prisma en 400; patrón de fix y cómo testear sin asumir el formato exacto del mensaje de error
metadata:
  type: feedback
---

**Hallazgo (2026-10-30, qa-explorer)**: los endpoints `PATCH /payments/transfer/:id/confirm` y `/reject` tomaban `notes`/`reason` del body sin Zod y los pasaban directo a Prisma. Un body con tipo incorrecto (ej. `{"reason": {"a":1}}`) daba 400 pero el body de la respuesta incluía el stack trace completo de Prisma (ruta absoluta del archivo del servidor, nombres de columnas internas) — fuga de información.

**Gotcha de estilo en este archivo**: no todos los endpoints de `payments.routes.ts` usan el mismo wrapper de error para Zod. Algunos (`fintocLinkSchema`) usan `{ error: parsed.error.flatten() }` directo, no `{ error: 'Datos inválidos', details: ... }`. Antes de asumir el formato del mensaje, grepear el archivo por `safeParse` y copiar el patrón exacto más cercano a la ruta que se está tocando, no un formato genérico asumido de memoria.

**Patrón de fix**: agregar schema a `payments.schema.ts` (`z.object({ campo: z.string().max(N).nullish() })` si el campo es opcional) y en la ruta: `const parsed = schema.safeParse(request.body || {}); if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })` ANTES del `try/catch` que llama al service — así el error de Zod nunca llega a Prisma.

**Cómo testear el "no leak"**: no asumir que el bug siempre se manifiesta igual — verificar con `JSON.stringify(body)` contra `/\.ts:\d+/`, `/payments\.service\.ts/` y `/node_modules/`, no solo buscar la palabra "stack". Ver [[transfer_atomicity_pattern]] y [[email_rejection_pattern]] — los 3 bugs se encontraron juntos en la misma auditoría de `qa/charters/pagos.md` sobre transferencia bancaria.
