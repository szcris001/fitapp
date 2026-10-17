-- CreateTable
CREATE TABLE "ConsistencyBadge" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "eligibleCount" INTEGER NOT NULL,
    "loggedCount" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsistencyBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsistencyBadge_gymId_periodStart_idx" ON "ConsistencyBadge"("gymId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ConsistencyBadge_userId_periodStart_key" ON "ConsistencyBadge"("userId", "periodStart");

-- AddForeignKey
ALTER TABLE "ConsistencyBadge" ADD CONSTRAINT "ConsistencyBadge_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsistencyBadge" ADD CONSTRAINT "ConsistencyBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sin filas globales (a diferencia de Benchmark/Movement): toda fila pertenece a un
-- gym real, mismo patrón tenant_isolation estándar de 20260927010000_rls_enforced.
ALTER TABLE "ConsistencyBadge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsistencyBadge" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsistencyBadge"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());
