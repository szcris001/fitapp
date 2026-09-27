-- CreateEnum
CREATE TYPE "WodScoreType" AS ENUM ('TIME', 'REPS', 'WEIGHT', 'ROUNDS', 'CUSTOM');

-- AlterTable
ALTER TABLE "Wod" ADD COLUMN     "scoreType" "WodScoreType" NOT NULL DEFAULT 'REPS';

-- CreateTable
CREATE TABLE "WodResult" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "wodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreText" TEXT,
    "rx" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WodResult_gymId_wodId_idx" ON "WodResult"("gymId", "wodId");

-- CreateIndex
CREATE INDEX "WodResult_wodId_rx_score_idx" ON "WodResult"("wodId", "rx", "score");

-- CreateIndex
CREATE UNIQUE INDEX "WodResult_wodId_userId_key" ON "WodResult"("wodId", "userId");

-- AddForeignKey
ALTER TABLE "WodResult" ADD CONSTRAINT "WodResult_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodResult" ADD CONSTRAINT "WodResult_wodId_fkey" FOREIGN KEY ("wodId") REFERENCES "Wod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodResult" ADD CONSTRAINT "WodResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodResult" ADD CONSTRAINT "WodResult_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
