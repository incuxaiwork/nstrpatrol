-- AlterTable
ALTER TABLE "Patrol" ADD COLUMN     "armedStatus" TEXT,
ADD COLUMN     "avgSpeedKmh" DOUBLE PRECISION,
ADD COLUMN     "beat" TEXT,
ADD COLUMN     "caloriesEstimate" DOUBLE PRECISION,
ADD COLUMN     "detectedMethod" TEXT,
ADD COLUMN     "heartPointsEstimate" DOUBLE PRECISION,
ADD COLUMN     "memberCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "patrolMethod" TEXT,
ADD COLUMN     "teamLeader" TEXT;

