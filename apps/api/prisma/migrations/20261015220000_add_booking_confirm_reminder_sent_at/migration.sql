-- Marca cuándo se mandó el push de recordatorio de confirmación previa a la clase
-- (null = todavía no) — evita reenviarlo en cada corrida del cron mientras el
-- booking sigue PENDING_CONFIRM dentro de la ventana de aviso. Ver
-- runPendingConfirmReminderJob en cron.ts.
ALTER TABLE "Booking" ADD COLUMN "confirmReminderSentAt" TIMESTAMP(3);
