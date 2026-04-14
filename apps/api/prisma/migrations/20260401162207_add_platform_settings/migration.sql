-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFrom" TEXT,
    "subExpiryReminderDays" INTEGER NOT NULL DEFAULT 7,
    "subExpirySubject" TEXT,
    "subExpiryBody" TEXT,
    "promoSubject" TEXT,
    "promoBody" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
