-- CreateEnum
CREATE TYPE "Crt" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_NACIONAL_EXCESSO_SUBLIMITE', 'REGIME_NORMAL', 'MEI');

-- CreateEnum
CREATE TYPE "RegimeEspecial" AS ENUM ('SEM_REGIME', 'MICROEMPRESA', 'EMPRESA_PEQUENO_PORTE', 'MICROEMPRESA_MUNICIPAL', 'SOCIEDADE_PROFISSIONAIS', 'COOPERATIVA', 'ESTIMATIVA', 'PRODUTOR_RURAL', 'SUBSTITUTO_TRIBUTARIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "Estabelecimento" AS ENUM ('MATRIZ', 'FILIAL');

-- CreateEnum
CREATE TYPE "IndicadorAtividade" AS ENUM ('INDUSTRIAL', 'EQUIPARADO_INDUSTRIAL', 'COMERCIANTE', 'PRESTADOR_SERVICO', 'ATIVIDADE_FINANCEIRA', 'TRANSPORTE', 'COMUNICACAO', 'OUTROS');

-- CreateEnum
CREATE TYPE "UsarCstCsosn" AS ENUM ('CST', 'CSOSN', 'NAO');

-- CreateEnum
CREATE TYPE "AmbienteSefaz" AS ENUM ('PRODUCAO', 'HOMOLOGACAO');

-- CreateEnum
CREATE TYPE "TipoContingencia" AS ENUM ('NORMAL', 'SVC_AN', 'SVC_RS', 'EPEC', 'FS_IA', 'OFFLINE');

-- CreateTable
CREATE TABLE "CnaeCode" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "secao" CHAR(1) NOT NULL,
    "secaoDesc" TEXT NOT NULL,
    "divisao" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CnaeCode_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "CompanyFiscalProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyCode" TEXT,
    "inscricaoEstadual" TEXT,
    "inscricaoEstadualST" TEXT,
    "inscricaoMunicipal" TEXT,
    "nomeFantasia" TEXT,
    "cnaePrincipal" TEXT,
    "crt" "Crt",
    "regimeEspecial" "RegimeEspecial" NOT NULL DEFAULT 'SEM_REGIME',
    "estabelecimento" "Estabelecimento",
    "indicadorAtividade" "IndicadorAtividade",
    "produtorRural" BOOLEAN NOT NULL DEFAULT false,
    "usarCstCsosn" "UsarCstCsosn" NOT NULL DEFAULT 'NAO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFiscalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cep" TEXT,
    "codIbgeMunicipio" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "codPais" TEXT DEFAULT '1058',
    "pais" TEXT DEFAULT 'BRASIL',
    "referencia" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyNfeConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serie" TEXT NOT NULL DEFAULT '1',
    "ultimaNfe" INTEGER NOT NULL DEFAULT 0,
    "aliquotaCreditoSimples" DECIMAL(5,2),
    "danfeSimplificado" BOOLEAN NOT NULL DEFAULT false,
    "ambiente" "AmbienteSefaz" NOT NULL DEFAULT 'HOMOLOGACAO',
    "observacoes" TEXT,
    "tipoContingencia" "TipoContingencia" NOT NULL DEFAULT 'NORMAL',
    "contingenciaJustificativa" TEXT,
    "contingenciaInicio" TIMESTAMP(3),
    "calcularIcmsDesonerado" BOOLEAN NOT NULL DEFAULT false,
    "incluirFreteBaseIcms" BOOLEAN NOT NULL DEFAULT true,
    "destacarValorIcmsSt" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyNfeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CnaeCode_descricao_idx" ON "CnaeCode"("descricao");

-- CreateIndex
CREATE INDEX "CnaeCode_secao_idx" ON "CnaeCode"("secao");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFiscalProfile_companyId_key" ON "CompanyFiscalProfile"("companyId");

-- CreateIndex
CREATE INDEX "CompanyFiscalProfile_cnaePrincipal_idx" ON "CompanyFiscalProfile"("cnaePrincipal");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAddress_companyId_key" ON "CompanyAddress"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyNfeConfig_companyId_key" ON "CompanyNfeConfig"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyFiscalProfile" ADD CONSTRAINT "CompanyFiscalProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFiscalProfile" ADD CONSTRAINT "CompanyFiscalProfile_cnaePrincipal_fkey" FOREIGN KEY ("cnaePrincipal") REFERENCES "CnaeCode"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyNfeConfig" ADD CONSTRAINT "CompanyNfeConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
