/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GymStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_gymId_fkey";

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "status" "GymStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "subscriptionPlan" TEXT NOT NULL DEFAULT 'trial';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "gymId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
