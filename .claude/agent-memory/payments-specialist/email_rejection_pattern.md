---
name: email-rejection-pattern
description: sendPaymentRejection existe en lib/email.ts (agregada 2026-10-30); confirmTransfer/rejectTransfer no mandan email por defecto salvo que se agregue explícitamente
metadata:
  type: project
---

`apps/api/src/lib/email.ts` tiene `sendPaymentRejection(gymId, { memberName, memberEmail, planName, reason })` (agregada 2026-10-30, mismo estilo que `sendPaymentConfirmation`: `wrapInLayout` + `escapeHtml`, header rojo `#ef4444` con emoji ⚠️). Se llama desde `rejectTransfer` en `payments.service.ts` con `.catch(() => {})`.

**Por qué**: qa-explorer encontró que el alumno nunca se enteraba de un rechazo de transferencia — solo `confirmTransfer` notificaba. El patrón general en este módulo es: cada transición de estado visible para el alumno (confirmación, rechazo, próximamente vencimiento/renovación fallida) debería tener su propio email. Antes de asumir que "ya debe estar implementado", grepear `lib/email.ts` por el nombre de la transición en cuestión — no asumir simetría entre confirmar/rechazar.

**Cómo aplicar**: si aparece una transición nueva de pago (ej. reembolso, cobro automático fallido con tarjeta expirada), revisar si ya hay plantilla de email análoga antes de dar por hecho que el flujo notifica al alumno. Ver [[transfer_atomicity_pattern]] para el bug de concurrencia relacionado encontrado en la misma auditoría.
