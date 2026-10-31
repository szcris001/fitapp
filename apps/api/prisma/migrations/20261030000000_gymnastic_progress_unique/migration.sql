-- CreateIndex
CREATE UNIQUE INDEX "GymnasticProgress_userId_skillName_milestone_key" ON "GymnasticProgress"("userId", "skillName", "milestone");

