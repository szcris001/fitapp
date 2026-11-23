-- Pasarelas de cobro Tribu-Box -> gyms (docs/design/gym-billing-gateways.md)
-- Pre-check: SELECT gateway,"gatewayOrderId",count(*) FROM "GymSubscriptionPayment"
--   WHERE "gatewayOrderId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;  (debe dar 0 filas)
ALTER TABLE "PlatformSettings" ADD COLUMN "billingGateways" JSONB;

ALTER TABLE "GymSubscriptionPayment"
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "receiptUrl" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "confirmedById" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "GymSubscriptionPayment_gateway_gatewayOrderId_key"
  ON "GymSubscriptionPayment"("gateway","gatewayOrderId");
