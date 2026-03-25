-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTH';
