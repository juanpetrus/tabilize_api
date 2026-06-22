-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_planId_fkey";

-- DropColumn (plano agora vive exclusivamente na Subscription)
ALTER TABLE "Team" DROP COLUMN "planId";
