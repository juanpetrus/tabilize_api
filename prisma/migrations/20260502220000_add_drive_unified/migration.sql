-- CreateTable
CREATE TABLE "DriveItem" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isDirectory" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "description" TEXT,
    "competenceMonth" INTEGER,
    "competenceYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveItemShare" (
    "id" TEXT NOT NULL,
    "driveItemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "canUpload" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveItemShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriveItem_teamId_path_idx" ON "DriveItem"("teamId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "DriveItem_teamId_path_key" ON "DriveItem"("teamId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "DriveItemShare_driveItemId_companyId_key" ON "DriveItemShare"("driveItemId", "companyId");

-- AddForeignKey
ALTER TABLE "DriveItem" ADD CONSTRAINT "DriveItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveItemShare" ADD CONSTRAINT "DriveItemShare_driveItemId_fkey" FOREIGN KEY ("driveItemId") REFERENCES "DriveItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveItemShare" ADD CONSTRAINT "DriveItemShare_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
