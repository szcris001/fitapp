-- Horas de anticipación desde las que una reserva normal queda PENDING_CONFIRM en
-- vez de CONFIRMED directo (el alumno debe confirmar manualmente antes de que
-- falten estas horas para la clase, o el cupo se libera). Ver Gym.preClassConfirmHours
-- en schema.prisma.
ALTER TABLE "Gym" ADD COLUMN "preClassConfirmHours" INTEGER NOT NULL DEFAULT 2;
