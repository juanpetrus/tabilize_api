-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "url" TEXT,
ALTER COLUMN "priceMonthly" DROP NOT NULL,
ALTER COLUMN "priceYearly" DROP NOT NULL;
