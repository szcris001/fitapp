-- Wod.date pasa a ser el inicio del día local del gym (lib/gym-day.ts: gymDayStart).
-- Antes se guardaba de 3 formas: la web enviaba el timestamp de la clase, mobile y la
-- importación un 'YYYY-MM-DD' (medianoche UTC). Regla para los datos existentes:
--   · exactamente 00:00 UTC → era una fecha sin hora → esa misma fecha local
--   · cualquier otro instante → su fecha local en la zona del gym
-- "date" es timestamp(3) sin zona que Prisma interpreta como UTC.
UPDATE "Wod" AS w
SET "date" = (
  (
    CASE
      WHEN w."date"::time = '00:00:00' THEN w."date"::date
      ELSE ((w."date" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(g."timezone", 'America/Santiago'))::date
    END
  )::timestamp AT TIME ZONE COALESCE(g."timezone", 'America/Santiago')
) AT TIME ZONE 'UTC'
FROM "Gym" AS g
WHERE g."id" = w."gymId";
