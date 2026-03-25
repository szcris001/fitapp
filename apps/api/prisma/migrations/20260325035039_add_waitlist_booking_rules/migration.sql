-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'WAITLIST';

-- DropIndex
DROP INDEX "User_gymId_email_key";

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "bookingCutoffMins" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "cancelCutoffMins" INTEGER NOT NULL DEFAULT 30,
ALTER COLUMN "brandColors" SET DEFAULT '{"primary":"#6366f1","secondary":"#4f46e5","accent":"#818cf8"}';
