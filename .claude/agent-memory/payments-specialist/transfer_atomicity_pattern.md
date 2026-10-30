---
name: transfer-atomicity-pattern
description: Patrón atómico check-y-set para confirmTransfer/rejectTransfer (y cualquier transición de estado de Payment/Membership) en payments.service.ts
metadata:
  type: feedback
---

**Regla**: cualquier transición de estado administrada manualmente (admin confirma/rechaza algo, no solo webhooks) DEBE hacer el chequeo de estado actual y el `update` en el MISMO `prisma.X.updateMany({ where: { id, <campoEstado>: <valorEsperado> }, data: {...} })`. Nunca `findFirst` + chequeo en JS + `update` separado — es un check-then-act clásico que dos requests casi simultáneos (doble clic, retry de red) pasan los dos antes de que ninguno haya escrito.

Si `count === 0` tras el `updateMany`, alguien más ya lo procesó — tirar el mismo error de "ya fue procesado" sin seguir. Si hay trabajo pesado después del claim (recalcular período, mandar email), solo debe ejecutarse si el claim se ganó.

**Por qué**: encontrado por qa-explorer 2026-10-30 en `confirmTransfer`/`rejectTransfer` (`payments.service.ts`) — devolvían 200 OK dos veces en confirmaciones/rechazos concurrentes sobre la misma transferencia, con doble recálculo de `nextMembershipPeriod` y doble email. Mismo patrón que ya existía correctamente en `completeCheckout` (reclamo con `completedAt: null` como filtro) y en `confirmPendingBooking` de `classes.service.ts` — este repo ya tenía el patrón bien resuelto en otros lados, solo faltaba aplicarlo a transferencias.

**Cómo aplicar**: antes de tocar cualquier función de `payments.service.ts` que haga `findFirst` → chequeo de estado en JS → `update`, convertirla al patrón de claim atómico. Candidatos a revisar si aparece otro bug similar: `confirmBankMovement`/`rejectBankMovement` (Fintoc), cualquier otro `confirm*`/`reject*`/`approve*` en pagos que no use `updateMany` con el estado actual en el `where`.

Ver [[email_rejection_pattern]] para el bug relacionado (falta de notificación al alumno) encontrado en la misma auditoría.
