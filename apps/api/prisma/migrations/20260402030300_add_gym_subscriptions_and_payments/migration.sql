-- CreateEnum
CREATE TYPE "GymSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GymPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'CL';

-- CreateTable
CREATE TABLE "FitAppPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceCLP" INTEGER NOT NULL DEFAULT 0,
    "priceUSD" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "features" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitAppPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymSubscription" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "GymSubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GymSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymSubscriptionPayment" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "country" TEXT NOT NULL DEFAULT 'CL',
    "gateway" TEXT NOT NULL,
    "gatewayOrderId" TEXT,
    "gatewayData" JSONB,
    "status" "GymPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GymSubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitAppPlan_slug_key" ON "FitAppPlan"("slug");

-- AddForeignKey
ALTER TABLE "GymSubscription" ADD CONSTRAINT "GymSubscription_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSubscription" ADD CONSTRAINT "GymSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FitAppPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSubscriptionPayment" ADD CONSTRAINT "GymSubscriptionPayment_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSubscriptionPayment" ADD CONSTRAINT "GymSubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "GymSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
