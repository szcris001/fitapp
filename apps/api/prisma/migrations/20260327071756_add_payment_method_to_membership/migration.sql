-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentNotes" TEXT;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
