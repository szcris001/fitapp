-- CreateEnum
CREATE TYPE "BenchmarkCategory" AS ENUM ('GIRL', 'HERO', 'OPEN', 'GAMES', 'CUSTOM');

-- AlterTable
ALTER TABLE "ClassType" ADD COLUMN     "discipline" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoRenewConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoRenewFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextAutoRenewAt" TIMESTAMP(3),
ADD COLUMN     "stripePaymentMethodId" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "autoRenewDaysBefore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "autoRenewEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoRenewMaxRetries" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "ClassTypeBlock" (
    "id" TEXT NOT NULL,
    "classTypeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "notes" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClassTypeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "gymId" TEXT,
    "nombre" TEXT NOT NULL,
    "categoria" "BenchmarkCategory" NOT NULL,
    "año" INTEGER,
    "formato" TEXT NOT NULL,
    "duracionMins" INTEGER,
    "tiempoEstMin" INTEGER,
    "descripcion" TEXT,
    "notas" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkMovement" (
    "id" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "repsEsquema" TEXT,
    "cargaRxKgHombre" DOUBLE PRECISION,
    "cargaRxKgMujer" DOUBLE PRECISION,
    "alturaRxCmHombre" INTEGER,
    "alturaRxCmMujer" INTEGER,
    "cargaScaled" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BenchmarkMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_externalId_key" ON "Benchmark"("externalId");

-- AddForeignKey
ALTER TABLE "ClassTypeBlock" ADD CONSTRAINT "ClassTypeBlock_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkMovement" ADD CONSTRAINT "BenchmarkMovement_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "Benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
