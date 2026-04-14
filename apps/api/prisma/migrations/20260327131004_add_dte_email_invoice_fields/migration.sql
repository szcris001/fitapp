-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "bsaleBoletaTypeId" INTEGER,
ADD COLUMN     "bsaleFacturaTypeId" INTEGER,
ADD COLUMN     "bsaleOfficeId" INTEGER,
ADD COLUMN     "bsalePriceListId" INTEGER,
ADD COLUMN     "bsaleToken" TEXT,
ADD COLUMN     "dteCiudad" TEXT,
ADD COLUMN     "dteComuna" TEXT,
ADD COLUMN     "dteDireccion" TEXT,
ADD COLUMN     "dteGiro" TEXT,
ADD COLUMN     "dteRazonSocial" TEXT,
ADD COLUMN     "dteRut" TEXT,
ADD COLUMN     "expiryReminderDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "smtpFrom" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPass" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpUser" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "invoiceNumber" INTEGER,
ADD COLUMN     "invoicePdfUrl" TEXT,
ADD COLUMN     "invoiceReceiverName" TEXT,
ADD COLUMN     "invoiceReceiverRut" TEXT,
ADD COLUMN     "invoiceType" TEXT;
