-- CreateEnum
CREATE TYPE "CndType" AS ENUM ('FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'FGTS', 'TRABALHISTA');

-- CreateEnum
CREATE TYPE "CndStatus" AS ENUM ('VALID', 'EXPIRED', 'PENDING', 'POSITIVE', 'POSITIVE_NEGATIVE', 'ERROR');

-- CreateTable
CREATE TABLE "Cnd" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CndType" NOT NULL,
    "status" "CndStatus" NOT NULL DEFAULT 'PENDING',
    "issueDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "protocolNumber" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cnd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cnd_companyId_idx" ON "Cnd"("companyId");

-- CreateIndex
CREATE INDEX "Cnd_expirationDate_idx" ON "Cnd"("expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "Cnd_companyId_type_key" ON "Cnd"("companyId", "type");

-- AddForeignKey
ALTER TABLE "Cnd" ADD CONSTRAINT "Cnd_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
