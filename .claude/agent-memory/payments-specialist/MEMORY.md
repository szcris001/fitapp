# MEMORY.md — payments-specialist

- [project_fintoc.md](project_fintoc.md) — Fintoc MVP implementado 2026-05-05: arquitectura, decisiones y gotchas del matcher
- [feedback_language.md](feedback_language.md) — Responder siempre en español
- [gateway_signature_gotchas.md](gateway_signature_gotchas.md) — Gotchas de firma por pasarela: MP x-signature formato ts+v1, Khipu rawBody, Kushki JWT sin clave pública en sandbox, MACH Bearer token no documentado, PayU sign lowercase, OpenPay sin firma (GET redirect)
- [transfer_atomicity_pattern.md](transfer_atomicity_pattern.md) — confirm/reject (y cualquier transición manual de estado) debe ser updateMany atómico, no findFirst+check+update
- [email_rejection_pattern.md](email_rejection_pattern.md) — sendPaymentRejection existe en lib/email.ts desde 2026-10-30; no asumir simetría confirmar/rechazar sin grepear
- [zod_validation_leak_pattern.md](zod_validation_leak_pattern.md) — endpoints de payments.routes.ts sin Zod filtran stack trace de Prisma; copiar el wrapper de error exacto más cercano, no uno genérico
- [create_side_duplicate_lock_pattern.md](create_side_duplicate_lock_pattern.md) — advisory lock (no updateMany) para evitar duplicar la fila al CREAR un pendiente por primera vez (ej. submitTransferReceipt, doble submit de comprobante)
