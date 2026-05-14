-- CreateTable
CREATE TABLE "NfeInutilizacao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "numeroInicial" INTEGER NOT NULL,
    "numeroFinal" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "protocolo" TEXT,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "dhRecbto" TIMESTAMP(3),
    "xmlEnvio" TEXT,
    "xmlResposta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfeInutilizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NfeInutilizacao_companyId_idx" ON "NfeInutilizacao"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NfeInutilizacao_companyId_serie_numeroInicial_numeroFinal_a_key" ON "NfeInutilizacao"("companyId", "serie", "numeroInicial", "numeroFinal", "ano");

-- AddForeignKey
ALTER TABLE "NfeInutilizacao" ADD CONSTRAINT "NfeInutilizacao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
