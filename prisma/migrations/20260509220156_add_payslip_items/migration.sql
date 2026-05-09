-- CreateEnum
CREATE TYPE "PayslipItemType" AS ENUM ('EARNING', 'DEDUCTION');

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "baseInss" DECIMAL(10,2),
ADD COLUMN     "baseIrrf" DECIMAL(10,2),
ADD COLUMN     "fgtsValue" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "PayslipItem" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "PayslipItemType" NOT NULL,
    "reference" TEXT,
    "value" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PayslipItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayslipItem_payslipId_idx" ON "PayslipItem"("payslipId");

-- AddForeignKey
ALTER TABLE "PayslipItem" ADD CONSTRAINT "PayslipItem_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
