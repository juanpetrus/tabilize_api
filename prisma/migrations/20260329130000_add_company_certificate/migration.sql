-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyCertificate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "certUrl" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyCertificate_companyId_key" ON "CompanyCertificate"("companyId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanyCertificate_companyId_fkey'
  ) THEN
    ALTER TABLE "CompanyCertificate" ADD CONSTRAINT "CompanyCertificate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
