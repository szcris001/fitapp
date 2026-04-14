/*
  Warnings:

  - A unique constraint covering the columns `[gymId,rut]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rut" TEXT;

-- CreateIndex
CREATE INDEX "Booking_classId_status_idx" ON "Booking"("classId", "status");

-- CreateIndex
CREATE INDEX "Class_gymId_startsAt_idx" ON "Class"("gymId", "startsAt");

-- CreateIndex
CREATE INDEX "Class_gymId_classTypeId_startsAt_idx" ON "Class"("gymId", "classTypeId", "startsAt");

-- CreateIndex
CREATE INDEX "Membership_userId_status_endsAt_idx" ON "Membership"("userId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "RmRecord_userId_movementName_idx" ON "RmRecord"("userId", "movementName");

-- CreateIndex
CREATE UNIQUE INDEX "User_gymId_rut_key" ON "User"("gymId", "rut");

-- CreateIndex
CREATE INDEX "Wod_classId_idx" ON "Wod"("classId");

-- CreateIndex
CREATE INDEX "Wod_date_idx" ON "Wod"("date");
