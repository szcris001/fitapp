-- CreateEnum
CREATE TYPE "PillarType" AS ENUM ('STRENGTH', 'ATTENDANCE', 'TENURE', 'GYMNASTICS', 'MANUAL');

-- CreateTable
CREATE TABLE "Pillar" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "type" "PillarType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PillarAward" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pillarId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "awardedById" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PillarAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pillar_gymId_isActive_idx" ON "Pillar"("gymId", "isActive");

-- CreateIndex
CREATE INDEX "PillarAward_gymId_pillarId_idx" ON "PillarAward"("gymId", "pillarId");

-- CreateIndex
CREATE INDEX "PillarAward_userId_idx" ON "PillarAward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PillarAward_userId_pillarId_periodStart_key" ON "PillarAward"("userId", "pillarId", "periodStart");

-- AddForeignKey
ALTER TABLE "Pillar" ADD CONSTRAINT "Pillar_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarAward" ADD CONSTRAINT "PillarAward_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarAward" ADD CONSTRAINT "PillarAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarAward" ADD CONSTRAINT "PillarAward_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "Pillar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarAward" ADD CONSTRAINT "PillarAward_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sin filas globales: toda fila pertenece a un gym real, mismo patrón tenant_isolation
-- estándar de 20260927010000_rls_enforced / 20261017120000_add_consistency_badge.
ALTER TABLE "Pillar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pillar" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Pillar"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "PillarAward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PillarAward" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PillarAward"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());
