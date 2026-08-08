-- AlterTable
-- Add aggregate telemetry columns to Patrol, mirroring the mobile
-- PatrolSessionEntity table synced from the device at patrol end.
ALTER TABLE "Patrol"
    ADD COLUMN "totalDistanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "totalSteps" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "moveMinutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "caloriesEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "heartPointsEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "avgSpeedKmh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "pointCount" INTEGER NOT NULL DEFAULT 0;
