-- CreateEnum
CREATE TYPE "FintocLinkStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'CONFIRMED', 'REJECTED', 'MANUAL');

-- CreateTable
CREATE TABLE "FintocLink" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "linkToken" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountNumber" TEXT,
    "bankName" TEXT,
    "holderName" TEXT,
    "holderRut" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "status" "FintocLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FintocLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMovement" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "fintocLinkId" TEXT NOT NULL,
    "fintocMovementId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "postedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "senderRut" TEXT,
    "senderName" TEXT,
    "referenceCode" TEXT,
    "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "membershipId" TEXT,
    "matchConfidence" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FintocLink_gymId_key" ON "FintocLink"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMovement_fintocMovementId_key" ON "BankMovement"("fintocMovementId");

-- CreateIndex
CREATE INDEX "BankMovement_gymId_reconciliationStatus_idx" ON "BankMovement"("gymId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "BankMovement_gymId_postedAt_idx" ON "BankMovement"("gymId", "postedAt");

-- AddForeignKey
ALTER TABLE "FintocLink" ADD CONSTRAINT "FintocLink_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_fintocLinkId_fkey" FOREIGN KEY ("fintocLinkId") REFERENCES "FintocLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
