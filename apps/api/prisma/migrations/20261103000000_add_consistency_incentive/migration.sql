-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "consistencyIncentiveText" TEXT,
ADD COLUMN     "consistencyMinClasses" INTEGER NOT NULL DEFAULT 20;
