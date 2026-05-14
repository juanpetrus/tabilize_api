-- AlterTable
ALTER TABLE "SefazNFe" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncCStat" TEXT,
ADD COLUMN     "lastSyncXMotivo" TEXT;
