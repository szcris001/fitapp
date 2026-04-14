-- CreateTable
CREATE TABLE "GymSkill" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymSkillMilestone" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GymSkillMilestone_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GymSkill" ADD CONSTRAINT "GymSkill_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSkillMilestone" ADD CONSTRAINT "GymSkillMilestone_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "GymSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
