/*
  Warnings:

  - Added the required column `boardId` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable (nullable to support existing rows)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "boardId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Board" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (only if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Board_teamId_fkey'
  ) THEN
    ALTER TABLE "Board" ADD CONSTRAINT "Board_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_boardId_fkey'
  ) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
