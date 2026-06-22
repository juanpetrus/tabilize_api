-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "planId" TEXT;

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: deriva planId do enum existente (PRO→plan_pro, ENTERPRISE→plan_scale, STARTER→plan_starter)
UPDATE "Subscription" SET "planId" = 'plan_pro' WHERE "plan" = 'PRO' AND "planId" IS NULL;
UPDATE "Subscription" SET "planId" = 'plan_scale' WHERE "plan" = 'ENTERPRISE' AND "planId" IS NULL;
UPDATE "Subscription" SET "planId" = 'plan_starter' WHERE "plan" = 'STARTER' AND "planId" IS NULL;
