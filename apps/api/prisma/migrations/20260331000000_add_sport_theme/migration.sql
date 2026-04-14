-- AlterTable: add sportTheme to Gym
ALTER TABLE "Gym" ADD COLUMN "sportTheme" TEXT NOT NULL DEFAULT 'neutral';
