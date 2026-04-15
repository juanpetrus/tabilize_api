-- CreateTable
CREATE TABLE "SefazDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "chave" TEXT,
    "schema" TEXT NOT NULL,
    "tipo" TEXT,
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "destinCnpj" TEXT,
    "destinNome" TEXT,
    "valor" DECIMAL(15,2),
    "dataEmissao" TIMESTAMP(3),
    "xmlGzip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SefazDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SefazDocument_companyId_nsu_key" ON "SefazDocument"("companyId", "nsu");

-- AddForeignKey
ALTER TABLE "SefazDocument" ADD CONSTRAINT "SefazDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
