-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "IndicadorIeDestinatario" AS ENUM ('CONTRIBUINTE_ICMS', 'ISENTO', 'NAO_CONTRIBUINTE');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "inscricaoEstadual" TEXT,
    "indicadorIe" "IndicadorIeDestinatario" NOT NULL DEFAULT 'NAO_CONTRIBUINTE',
    "inscricaoSuframa" TEXT,
    "email" TEXT,
    "phone" TEXT,
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
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "descricao" TEXT NOT NULL,
    "ncmCodigo" TEXT,
    "cestCodigo" TEXT,
    "cfopPadrao" TEXT,
    "unidade" TEXT NOT NULL,
    "origem" "MercadoriaOrigem" NOT NULL DEFAULT 'NACIONAL',
    "cstIcmsPadrao" TEXT,
    "csosnPadrao" TEXT,
    "aliquotaIcms" DECIMAL(5,2),
    "aliquotaPis" DECIMAL(5,2),
    "aliquotaCofins" DECIMAL(5,2),
    "aliquotaIpi" DECIMAL(5,2),
    "precoVenda" DECIMAL(10,2) NOT NULL,
    "precoCusto" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE INDEX "Customer_cpfCnpj_idx" ON "Customer"("cpfCnpj");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_cpfCnpj_key" ON "Customer"("companyId", "cpfCnpj");

-- CreateIndex
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

-- CreateIndex
CREATE INDEX "Product_descricao_idx" ON "Product"("descricao");

-- CreateIndex
CREATE INDEX "Product_ncmCodigo_idx" ON "Product"("ncmCodigo");

-- CreateIndex
CREATE INDEX "Product_cfopPadrao_idx" ON "Product"("cfopPadrao");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_codigoInterno_key" ON "Product"("companyId", "codigoInterno");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_ncmCodigo_fkey" FOREIGN KEY ("ncmCodigo") REFERENCES "NcmCode"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_cfopPadrao_fkey" FOREIGN KEY ("cfopPadrao") REFERENCES "CfopCode"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_cstIcmsPadrao_fkey" FOREIGN KEY ("cstIcmsPadrao") REFERENCES "CstIcmsCode"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_csosnPadrao_fkey" FOREIGN KEY ("csosnPadrao") REFERENCES "CsosnCode"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
