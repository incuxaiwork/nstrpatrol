-- AlterTable
-- Drift repair: the deployment database recorded 20260818201823_patrol_session_fields
-- as applied but never received its "memberCount" and "teamLeader" columns
-- (every other column from that migration exists). Restore the missing columns
-- to match the Prisma schema exactly. Both columns are additive and nullable-safe.
ALTER TABLE "Patrol" ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "teamLeader" TEXT;