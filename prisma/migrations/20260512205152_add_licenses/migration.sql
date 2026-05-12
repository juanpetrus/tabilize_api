-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('ALVARA_FUNCIONAMENTO', 'BOMBEIROS_AVCB', 'SANITARIA', 'AMBIENTAL', 'INSCRICAO_MUNICIPAL', 'INSCRICAO_ESTADUAL', 'JUNTA_COMERCIAL', 'CONSELHO_CLASSE', 'OUTRO');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "LicenseType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDING',
    "issuingBody" TEXT,
    "number" TEXT,
    "protocolNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "notes" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "renewedFromId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_renewedFromId_key" ON "License"("renewedFromId");

-- CreateIndex
CREATE INDEX "License_companyId_idx" ON "License"("companyId");

-- CreateIndex
CREATE INDEX "License_expirationDate_idx" ON "License"("expirationDate");

-- CreateIndex
CREATE INDEX "License_companyId_type_idx" ON "License"("companyId", "type");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
