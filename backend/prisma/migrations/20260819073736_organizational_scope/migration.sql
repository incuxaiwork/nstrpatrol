-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Cader" ADD VALUE 'DFO';
ALTER TYPE "Cader" ADD VALUE 'DyDFO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "beatId" TEXT,
ADD COLUMN     "divisionId" TEXT,
ADD COLUMN     "rangeId" TEXT,
ADD COLUMN     "subDivisionId" TEXT;

-- CreateTable
CREATE TABLE "SubDivision" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SubDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Range" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subDivisionId" TEXT,

    CONSTRAINT "Range_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubDivision_code_key" ON "SubDivision"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Range_name_key" ON "Range"("name");

-- CreateIndex
CREATE INDEX "Range_subDivisionId_idx" ON "Range"("subDivisionId");

-- AddForeignKey
ALTER TABLE "Range" ADD CONSTRAINT "Range_subDivisionId_fkey" FOREIGN KEY ("subDivisionId") REFERENCES "SubDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
