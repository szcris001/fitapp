-- Reservas marcadas ATTENDED por flujos que no escribían attended/attendedAt
-- (asistencia masiva, check-in por ubicación/QR, cron). /classes/:id/attendees
-- cuenta por attended, así que mostraban 0 asistentes.
UPDATE "Booking"
SET "attended" = true,
    "attendedAt" = COALESCE("attendedAt", "updatedAt")
WHERE "status" = 'ATTENDED' AND "attended" = false;
