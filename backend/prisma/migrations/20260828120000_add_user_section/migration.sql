-- AlterTable: Add section column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "section" TEXT;
