-- CreateTable
CREATE TABLE "PaymentCheckout" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "membershipId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentCheckout_gymId_idx" ON "PaymentCheckout"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckout_gateway_externalRef_key" ON "PaymentCheckout"("gateway", "externalRef");

-- AddForeignKey
ALTER TABLE "PaymentCheckout" ADD CONSTRAINT "PaymentCheckout_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheckout" ADD CONSTRAINT "PaymentCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheckout" ADD CONSTRAINT "PaymentCheckout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS (ver 20260927010000_rls_enforced): checkouts del gym del contexto; los
-- callbacks de pasarela corren sin request autenticado (bypass)
ALTER TABLE "PaymentCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentCheckout" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentCheckout"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());
