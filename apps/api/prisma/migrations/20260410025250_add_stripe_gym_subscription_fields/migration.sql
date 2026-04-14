-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "GymSubscription" ADD COLUMN     "stripeCheckoutSessionId" TEXT;
