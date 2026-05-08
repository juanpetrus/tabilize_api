/*
  Warnings:

  - You are about to drop the `Document` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DriveFile` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_companyId_fkey";

-- DropForeignKey
ALTER TABLE "DriveFile" DROP CONSTRAINT "DriveFile_teamId_fkey";

-- AlterTable
ALTER TABLE "CompanyUser" ADD COLUMN     "activeCompanyId" TEXT;

-- AlterTable
ALTER TABLE "SefazNFe" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "Document";

-- DropTable
DROP TABLE "DriveFile";

-- CreateTable
CREATE TABLE "CompanyUserCompany" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyUserCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUserCompany_companyUserId_companyId_key" ON "CompanyUserCompany"("companyUserId", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_activeCompanyId_fkey" FOREIGN KEY ("activeCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUserCompany" ADD CONSTRAINT "CompanyUserCompany_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "CompanyUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUserCompany" ADD CONSTRAINT "CompanyUserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
