-- Drop tabela antiga
DROP TABLE IF EXISTS "SefazDocument";

-- Criar SefazNFe
CREATE TABLE "SefazNFe" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nsu" TEXT,
    "tipo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AUTORIZADA',
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "destinCnpj" TEXT,
    "destinNome" TEXT,
    "valor" DECIMAL(15,2),
    "serie" TEXT,
    "numero" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "xmlGzip" TEXT,
    "temXmlCompleto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SefazNFe_pkey" PRIMARY KEY ("id")
);

-- Criar SefazEvento
CREATE TABLE "SefazEvento" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nfeId" TEXT,
    "chaveNFe" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "tpEvento" TEXT,
    "xEvento" TEXT,
    "dataEvento" TIMESTAMP(3),
    "protocolo" TEXT,
    "schema" TEXT NOT NULL,
    "xmlGzip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SefazEvento_pkey" PRIMARY KEY ("id")
);

-- Índices únicos
CREATE UNIQUE INDEX "SefazNFe_companyId_chave_key" ON "SefazNFe"("companyId", "chave");
CREATE UNIQUE INDEX "SefazEvento_companyId_nsu_key" ON "SefazEvento"("companyId", "nsu");

-- Foreign keys
ALTER TABLE "SefazNFe" ADD CONSTRAINT "SefazNFe_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SefazEvento" ADD CONSTRAINT "SefazEvento_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SefazEvento" ADD CONSTRAINT "SefazEvento_nfeId_fkey"
    FOREIGN KEY ("nfeId") REFERENCES "SefazNFe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
