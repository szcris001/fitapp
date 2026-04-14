-- Add ownerEmail to Gym for multi-sede support
ALTER TABLE "Gym" ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT;

-- Back-fill ownerEmail from the ADMIN user of each gym
UPDATE "Gym" g
SET "ownerEmail" = (
  SELECT u.email FROM "User" u
  WHERE u."gymId" = g.id AND u.role = 'ADMIN'
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE "ownerEmail" IS NULL;
