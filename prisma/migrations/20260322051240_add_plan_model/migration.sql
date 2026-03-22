-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "priceYearly" INTEGER NOT NULL,
    "features" TEXT[],
    "abacateProductMonthly" TEXT,
    "abacateProductYearly" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- Seed plans before adding FK
INSERT INTO "Plan" ("id", "name", "description", "priceMonthly", "priceYearly", "features", "isActive", "createdAt", "updatedAt") VALUES
('starter', 'Starter', 'Para escritórios em início de operação', 9700, 97000, ARRAY['Até 20 empresas', 'Tarefas ilimitadas', 'Documentos ilimitados', 'Suporte por e-mail'], true, NOW(), NOW()),
('pro', 'Pro', 'Para escritórios em crescimento', 19700, 197000, ARRAY['Empresas ilimitadas', 'Tarefas ilimitadas', 'Documentos ilimitados', 'Importação de planilha CSV', 'Suporte prioritário'], true, NOW(), NOW());

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
