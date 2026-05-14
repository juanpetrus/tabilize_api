-- CreateEnum
CREATE TYPE "MercadoriaOrigem" AS ENUM ('NACIONAL', 'ESTRANGEIRA_IMPORTACAO_DIRETA', 'ESTRANGEIRA_MERCADO_INTERNO', 'NACIONAL_CI_SUPERIOR_40', 'NACIONAL_PPB', 'NACIONAL_CI_INFERIOR_40', 'ESTRANGEIRA_IMP_DIRETA_SEM_SIMILAR', 'ESTRANGEIRA_MERCADO_INTERNO_SEM_SIMILAR', 'NACIONAL_CI_SUPERIOR_70');

-- CreateTable
CREATE TABLE "NcmCode" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "capitulo" TEXT NOT NULL,
    "posicao" TEXT NOT NULL,
    "subposicao" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NcmCode_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "CfopCode" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "aplicacao" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CfopCode_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "CstIcmsCode" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "observacao" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CstIcmsCode_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "CsosnCode" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "observacao" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsosnCode_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "IbgeMunicipio" (
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IbgeMunicipio_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE INDEX "NcmCode_capitulo_idx" ON "NcmCode"("capitulo");

-- CreateIndex
CREATE INDEX "NcmCode_descricao_idx" ON "NcmCode"("descricao");

-- CreateIndex
CREATE INDEX "CfopCode_grupo_idx" ON "CfopCode"("grupo");

-- CreateIndex
CREATE INDEX "CfopCode_natureza_idx" ON "CfopCode"("natureza");

-- CreateIndex
CREATE INDEX "IbgeMunicipio_uf_idx" ON "IbgeMunicipio"("uf");

-- CreateIndex
CREATE INDEX "IbgeMunicipio_uf_nome_idx" ON "IbgeMunicipio"("uf", "nome");

-- CreateIndex
CREATE INDEX "IbgeMunicipio_nome_idx" ON "IbgeMunicipio"("nome");
