-- CreateTable: WodBlock
CREATE TABLE "WodBlock" (
    "id" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "title" TEXT,
    "timecap" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WodBlock_pkey" PRIMARY KEY ("id")
);

-- Data migration: create one default WodBlock per existing Wod and reassign movements
-- Step 1: insert a default block for each wod
INSERT INTO "WodBlock" ("id", "wodId", "title", "timecap", "order")
SELECT
    gen_random_uuid()::text,
    w.id,
    NULL,
    NULL,
    0
FROM "Wod" w;

-- Step 2: add blockId column (nullable first)
ALTER TABLE "WodMovement" ADD COLUMN "blockId" TEXT;
ALTER TABLE "WodMovement" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Step 3: populate blockId from the default block of each wod
UPDATE "WodMovement" wm
SET "blockId" = (
    SELECT b.id FROM "WodBlock" b WHERE b."wodId" = wm."wodId" LIMIT 1
);

-- Step 4: make blockId NOT NULL now that it's populated
ALTER TABLE "WodMovement" ALTER COLUMN "blockId" SET NOT NULL;

-- Step 5: drop old columns from WodMovement
ALTER TABLE "WodMovement" DROP COLUMN "wodId";
ALTER TABLE "WodMovement" DROP COLUMN "blockTitle";
ALTER TABLE "WodMovement" DROP COLUMN "timecap";
ALTER TABLE "WodMovement" DROP COLUMN "percentage";

-- Step 6: drop description from Wod
ALTER TABLE "Wod" DROP COLUMN "description";

-- AddForeignKey
ALTER TABLE "WodBlock" ADD CONSTRAINT "WodBlock_wodId_fkey" FOREIGN KEY ("wodId") REFERENCES "Wod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodMovement" ADD CONSTRAINT "WodMovement_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WodBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
