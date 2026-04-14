-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "bankAccount" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "transferReceiptUrl" TEXT,
ADD COLUMN     "transferStatus" TEXT;
