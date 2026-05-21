-- CreateEnum
CREATE TYPE "CndSyncStatus" AS ENUM ('IDLE', 'QUEUED', 'PROCESSING', 'FAILED');

-- AlterTable
ALTER TABLE "Cnd" ADD COLUMN     "syncStatus" "CndSyncStatus" NOT NULL DEFAULT 'IDLE',
ADD COLUMN     "syncStartedAt" TIMESTAMP(3);
