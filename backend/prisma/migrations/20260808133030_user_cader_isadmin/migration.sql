/*
  Warnings:

  - Added the required column `cader` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Cader" AS ENUM ('FRO', 'DyRO', 'FSO', 'FBO', 'ABO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cader" "Cader" NOT NULL,
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;
