-- CreateEnum
CREATE TYPE "FintocPayStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "FintocPaymentIntent" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fintocIntentId" TEXT NOT NULL,
    "widgetUrl" TEXT NOT NULL,
    "status" "FintocPayStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "membershipId" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FintocPaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FintocPaymentIntent_fintocIntentId_key" ON "FintocPaymentIntent"("fintocIntentId");

-- AddForeignKey
ALTER TABLE "FintocPaymentIntent" ADD CONSTRAINT "FintocPaymentIntent_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
