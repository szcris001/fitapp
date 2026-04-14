/*
  Warnings:

  - You are about to drop the column `promoBody` on the `PlatformSettings` table. All the data in the column will be lost.
  - You are about to drop the column `promoSubject` on the `PlatformSettings` table. All the data in the column will be lost.
  - You are about to drop the column `subExpiryBody` on the `PlatformSettings` table. All the data in the column will be lost.
  - You are about to drop the column `subExpirySubject` on the `PlatformSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PlatformSettings" DROP COLUMN "promoBody",
DROP COLUMN "promoSubject",
DROP COLUMN "subExpiryBody",
DROP COLUMN "subExpirySubject";

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "placeholders" JSONB NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_slug_key" ON "EmailTemplate"("slug");
