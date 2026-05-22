-- Step 1: add new columns (nullable first for data migration)
ALTER TABLE "Wod" ADD COLUMN "classTypeId" TEXT;
ALTER TABLE "Wod" ADD COLUMN "gymId" TEXT;

-- Step 2: populate from the class that was previously linked
UPDATE "Wod" w
SET
  "classTypeId" = c."classTypeId",
  "gymId"       = c."gymId"
FROM "Class" c
WHERE c.id = w."classId";

-- Step 3: delete orphan WODs (class was deleted)
DELETE FROM "Wod" WHERE "classTypeId" IS NULL;

-- Step 4: if multiple WODs exist for same gymId+classTypeId+date, keep only the most recent
DELETE FROM "Wod"
WHERE id NOT IN (
  SELECT DISTINCT ON ("gymId", "classTypeId", date::date) id
  FROM "Wod"
  ORDER BY "gymId", "classTypeId", date::date, "createdAt" DESC
);

-- Step 5: make NOT NULL
ALTER TABLE "Wod" ALTER COLUMN "classTypeId" SET NOT NULL;
ALTER TABLE "Wod" ALTER COLUMN "gymId" SET NOT NULL;

-- Step 6: drop old column
ALTER TABLE "Wod" DROP COLUMN "classId";

-- Step 7: add FK constraints
ALTER TABLE "Wod" ADD CONSTRAINT "Wod_classTypeId_fkey"
  FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Wod" ADD CONSTRAINT "Wod_gymId_fkey"
  FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 8: recreate indexes
DROP INDEX IF EXISTS "Wod_classId_idx";
CREATE INDEX "Wod_gymId_classTypeId_idx" ON "Wod"("gymId", "classTypeId");
