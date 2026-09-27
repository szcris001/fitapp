-- CreateTable
CREATE TABLE "_ClassAllowedPlans" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClassAllowedPlans_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ClassAllowedPlans_B_index" ON "_ClassAllowedPlans"("B");

-- AddForeignKey
ALTER TABLE "_ClassAllowedPlans" ADD CONSTRAINT "_ClassAllowedPlans_A_fkey" FOREIGN KEY ("A") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassAllowedPlans" ADD CONSTRAINT "_ClassAllowedPlans_B_fkey" FOREIGN KEY ("B") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
