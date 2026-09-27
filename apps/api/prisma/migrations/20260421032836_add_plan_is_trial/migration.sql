-- DropForeignKey
ALTER TABLE "Wod" DROP CONSTRAINT "Wod_classTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Wod" DROP CONSTRAINT "Wod_gymId_fkey";

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Wod" ADD CONSTRAINT "Wod_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wod" ADD CONSTRAINT "Wod_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
