-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "attended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attendedAt" TIMESTAMP(3);
