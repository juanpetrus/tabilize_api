-- CreateEnum
CREATE TYPE "NfeStatus" AS ENUM ('RASCUNHO', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'DENEGADA', 'CANCELADA', 'INUTILIZADA');

-- CreateEnum
CREATE TYPE "NfeFinalidade" AS ENUM ('NORMAL', 'COMPLEMENTAR', 'AJUSTE', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "NfeTipoOperacao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "NfeModFrete" AS ENUM ('POR_CONTA_EMITENTE', 'POR_CONTA_DESTINATARIO', 'POR_CONTA_TERCEIROS', 'TRANSPORTE_PROPRIO_EMITENTE', 'TRANSPORTE_PROPRIO_DESTINATARIO', 'SEM_TRANSPORTE');

-- CreateTable
CREATE TABLE "Nfe" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" INTEGER,
    "chave" TEXT,
    "status" "NfeStatus" NOT NULL DEFAULT 'RASCUNHO',
    "finalidade" "NfeFinalidade" NOT NULL DEFAULT 'NORMAL',
    "naturezaOperacao" TEXT NOT NULL,
    "tipoOperacao" "NfeTipoOperacao" NOT NULL,
    "modFrete" "NfeModFrete" NOT NULL DEFAULT 'SEM_TRANSPORTE',
    "indicadorPresenca" TEXT,
    "totalProdutos" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalFrete" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDesconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalSeguro" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalOutros" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalIcms" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalIcmsSt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalIpi" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPis" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalCofins" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalNota" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "observacoesFiscais" TEXT,
    "observacoesContrib" TEXT,
    "protocoloAutorizacao" TEXT,
    "dataAutorizacao" TIMESTAMP(3),
    "cStat" TEXT,
    "xMotivo" TEXT,
    "xmlAssinado" TEXT,
    "xmlAutorizado" TEXT,
    "justifCancelamento" TEXT,
    "dataCancelamento" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nfe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfeItem" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cfop" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(15,4) NOT NULL,
    "valorUnitario" DECIMAL(15,4) NOT NULL,
    "desconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(15,2) NOT NULL,
    "origem" "MercadoriaOrigem" NOT NULL,
    "cstIcms" TEXT,
    "baseCalcIcms" DECIMAL(15,2),
    "aliquotaIcms" DECIMAL(5,2),
    "valorIcms" DECIMAL(15,2),
    "baseCalcIcmsSt" DECIMAL(15,2),
    "aliquotaIcmsSt" DECIMAL(5,2),
    "valorIcmsSt" DECIMAL(15,2),
    "cstPis" TEXT,
    "baseCalcPis" DECIMAL(15,2),
    "aliquotaPis" DECIMAL(5,2),
    "valorPis" DECIMAL(15,2),
    "cstCofins" TEXT,
    "baseCalcCofins" DECIMAL(15,2),
    "aliquotaCofins" DECIMAL(5,2),
    "valorCofins" DECIMAL(15,2),
    "cstIpi" TEXT,
    "baseCalcIpi" DECIMAL(15,2),
    "aliquotaIpi" DECIMAL(5,2),
    "valorIpi" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfePagamento" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "formaPagamento" TEXT NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NfePagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfeEvento" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "tpEvento" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "justificativa" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "protocolo" TEXT,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "xmlEnvio" TEXT,
    "xmlResposta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfeEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nfe_chave_key" ON "Nfe"("chave");

-- CreateIndex
CREATE INDEX "Nfe_companyId_idx" ON "Nfe"("companyId");

-- CreateIndex
CREATE INDEX "Nfe_customerId_idx" ON "Nfe"("customerId");

-- CreateIndex
CREATE INDEX "Nfe_status_idx" ON "Nfe"("status");

-- CreateIndex
CREATE INDEX "Nfe_dataAutorizacao_idx" ON "Nfe"("dataAutorizacao");

-- CreateIndex
CREATE UNIQUE INDEX "Nfe_companyId_serie_numero_key" ON "Nfe"("companyId", "serie", "numero");

-- CreateIndex
CREATE INDEX "NfeItem_nfeId_idx" ON "NfeItem"("nfeId");

-- CreateIndex
CREATE INDEX "NfeItem_productId_idx" ON "NfeItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "NfeItem_nfeId_ordem_key" ON "NfeItem"("nfeId", "ordem");

-- CreateIndex
CREATE INDEX "NfePagamento_nfeId_idx" ON "NfePagamento"("nfeId");

-- CreateIndex
CREATE INDEX "NfeEvento_nfeId_idx" ON "NfeEvento"("nfeId");

-- CreateIndex
CREATE UNIQUE INDEX "NfeEvento_nfeId_tpEvento_sequencia_key" ON "NfeEvento"("nfeId", "tpEvento", "sequencia");

-- AddForeignKey
ALTER TABLE "Nfe" ADD CONSTRAINT "Nfe_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nfe" ADD CONSTRAINT "Nfe_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfeItem" ADD CONSTRAINT "NfeItem_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "Nfe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfeItem" ADD CONSTRAINT "NfeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfePagamento" ADD CONSTRAINT "NfePagamento_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "Nfe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfeEvento" ADD CONSTRAINT "NfeEvento_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "Nfe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
