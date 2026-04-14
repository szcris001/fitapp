-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_CONFIRM';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "confirmDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "waitlistConfirmEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitlistConfirmMins" INTEGER NOT NULL DEFAULT 30;
