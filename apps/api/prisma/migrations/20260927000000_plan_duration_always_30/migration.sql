-- Toda membresía dura 30 días (lib/membership.ts). Se normalizan los planes existentes
-- para que lo que muestran web/mobile coincida con lo que se cobra y se otorga.
UPDATE "Plan" SET "durationDays" = 30 WHERE "durationDays" <> 30;

ALTER TABLE "Plan" ALTER COLUMN "durationDays" SET DEFAULT 30;
