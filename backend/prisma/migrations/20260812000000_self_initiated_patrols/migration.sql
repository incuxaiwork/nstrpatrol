-- ============================================================================
-- Self-initiated patrols: rangers patrol on their own.
-- Removes the admin assignment / duty-route / waypoint machinery.
--  * Patrol gains userId (the ranger who started it), defaults to ACTIVE.
--  * All telemetry + Incident rows are keyed directly on Patrol.patrolId
--    instead of PatrolAssignment.id.
--  * PatrolAssignment, PatrolDutyRoute, PatrolWaypoint, WaypointCheckin are
--    dropped.
-- The DB currently holds only early smoke-test data, so backfill is trivial.
-- Every telemetry table adds a fresh patrolId column and remaps it from the
-- assignment map BEFORE dropping the old assignmentId column + FK.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Telemetry tables: add patrolId, remap, drop assignmentId + FK.
-- ---------------------------------------------------------------------------

-- PatrolPoint
ALTER TABLE "PatrolPoint" ADD COLUMN "patrolId" TEXT;
UPDATE "PatrolPoint" pp SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = pp."assignmentId";
ALTER TABLE "PatrolPoint" DROP CONSTRAINT "PatrolPoint_assignmentId_fkey";
DROP INDEX IF EXISTS "PatrolPoint_assignmentId_timestamp_idx";
ALTER TABLE "PatrolPoint" DROP COLUMN "assignmentId";
ALTER TABLE "PatrolPoint" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "PatrolPoint" ADD CONSTRAINT "PatrolPoint_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PatrolPoint_patrolId_timestamp_idx" ON "PatrolPoint"("patrolId", "timestamp");

-- StepReading
ALTER TABLE "StepReading" ADD COLUMN "patrolId" TEXT;
UPDATE "StepReading" s SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = s."assignmentId";
ALTER TABLE "StepReading" DROP CONSTRAINT "StepReading_assignmentId_fkey";
DROP INDEX IF EXISTS "StepReading_assignmentId_timestamp_idx";
ALTER TABLE "StepReading" DROP COLUMN "assignmentId";
ALTER TABLE "StepReading" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "StepReading" ADD CONSTRAINT "StepReading_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StepReading_patrolId_timestamp_idx" ON "StepReading"("patrolId", "timestamp");

-- BarometerReading
ALTER TABLE "BarometerReading" ADD COLUMN "patrolId" TEXT;
UPDATE "BarometerReading" b SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = b."assignmentId";
ALTER TABLE "BarometerReading" DROP CONSTRAINT "BarometerReading_assignmentId_fkey";
DROP INDEX IF EXISTS "BarometerReading_assignmentId_timestamp_idx";
ALTER TABLE "BarometerReading" DROP COLUMN "assignmentId";
ALTER TABLE "BarometerReading" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "BarometerReading" ADD CONSTRAINT "BarometerReading_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BarometerReading_patrolId_timestamp_idx" ON "BarometerReading"("patrolId", "timestamp");

-- AccelerometerReading
ALTER TABLE "AccelerometerReading" ADD COLUMN "patrolId" TEXT;
UPDATE "AccelerometerReading" a SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = a."assignmentId";
ALTER TABLE "AccelerometerReading" DROP CONSTRAINT "AccelerometerReading_assignmentId_fkey";
DROP INDEX IF EXISTS "AccelerometerReading_assignmentId_timestamp_idx";
ALTER TABLE "AccelerometerReading" DROP COLUMN "assignmentId";
ALTER TABLE "AccelerometerReading" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "AccelerometerReading" ADD CONSTRAINT "AccelerometerReading_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AccelerometerReading_patrolId_timestamp_idx" ON "AccelerometerReading"("patrolId", "timestamp");

-- GyroscopeReading
ALTER TABLE "GyroscopeReading" ADD COLUMN "patrolId" TEXT;
UPDATE "GyroscopeReading" g SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = g."assignmentId";
ALTER TABLE "GyroscopeReading" DROP CONSTRAINT "GyroscopeReading_assignmentId_fkey";
DROP INDEX IF EXISTS "GyroscopeReading_assignmentId_timestamp_idx";
ALTER TABLE "GyroscopeReading" DROP COLUMN "assignmentId";
ALTER TABLE "GyroscopeReading" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "GyroscopeReading" ADD CONSTRAINT "GyroscopeReading_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GyroscopeReading_patrolId_timestamp_idx" ON "GyroscopeReading"("patrolId", "timestamp");

-- MagnetometerReading
ALTER TABLE "MagnetometerReading" ADD COLUMN "patrolId" TEXT;
UPDATE "MagnetometerReading" m SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = m."assignmentId";
ALTER TABLE "MagnetometerReading" DROP CONSTRAINT "MagnetometerReading_assignmentId_fkey";
DROP INDEX IF EXISTS "MagnetometerReading_assignmentId_timestamp_idx";
ALTER TABLE "MagnetometerReading" DROP COLUMN "assignmentId";
ALTER TABLE "MagnetometerReading" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "MagnetometerReading" ADD CONSTRAINT "MagnetometerReading_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MagnetometerReading_patrolId_timestamp_idx" ON "MagnetometerReading"("patrolId", "timestamp");

-- ActivitySegment
ALTER TABLE "ActivitySegment" ADD COLUMN "patrolId" TEXT;
UPDATE "ActivitySegment" seg SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = seg."assignmentId";
ALTER TABLE "ActivitySegment" DROP CONSTRAINT "ActivitySegment_assignmentId_fkey";
DROP INDEX IF EXISTS "ActivitySegment_assignmentId_startTime_idx";
ALTER TABLE "ActivitySegment" DROP COLUMN "assignmentId";
ALTER TABLE "ActivitySegment" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "ActivitySegment" ADD CONSTRAINT "ActivitySegment_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ActivitySegment_patrolId_startTime_idx" ON "ActivitySegment"("patrolId", "startTime");

-- CoverageEvent
ALTER TABLE "CoverageEvent" ADD COLUMN "patrolId" TEXT;
UPDATE "CoverageEvent" ce SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = ce."assignmentId";
ALTER TABLE "CoverageEvent" DROP CONSTRAINT "CoverageEvent_assignmentId_fkey";
DROP INDEX IF EXISTS "CoverageEvent_assignmentId_type_idx";
ALTER TABLE "CoverageEvent" DROP COLUMN "assignmentId";
ALTER TABLE "CoverageEvent" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "CoverageEvent" ADD CONSTRAINT "CoverageEvent_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CoverageEvent_patrolId_type_idx" ON "CoverageEvent"("patrolId", "type");

-- TimeIntegrityLog
ALTER TABLE "TimeIntegrityLog" ADD COLUMN "patrolId" TEXT;
UPDATE "TimeIntegrityLog" t SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = t."assignmentId";
ALTER TABLE "TimeIntegrityLog" DROP CONSTRAINT "TimeIntegrityLog_assignmentId_fkey";
DROP INDEX IF EXISTS "TimeIntegrityLog_assignmentId_timestamp_idx";
ALTER TABLE "TimeIntegrityLog" DROP COLUMN "assignmentId";
ALTER TABLE "TimeIntegrityLog" ALTER COLUMN "patrolId" SET NOT NULL;
ALTER TABLE "TimeIntegrityLog" ADD CONSTRAINT "TimeIntegrityLog_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TimeIntegrityLog_patrolId_timestamp_idx" ON "TimeIntegrityLog"("patrolId", "timestamp");

-- Incidents (nullable relation; backfill via assignment map)
ALTER TABLE "Incident" ADD COLUMN "patrolId" TEXT;
UPDATE "Incident" i SET "patrolId" = pa."patrolId"
  FROM "PatrolAssignment" pa WHERE pa.id = i."assignmentId";
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_assignmentId_fkey";
DROP INDEX IF EXISTS "Incident_assignmentId_idx";
ALTER TABLE "Incident" DROP COLUMN "assignmentId";
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_patrolId_fkey"
  FOREIGN KEY ("patrolId") REFERENCES "Patrol"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Incident_patrolId_idx" ON "Incident"("patrolId");

-- ---------------------------------------------------------------------------
-- 2. Patrol: add owner (userId), flip default status to ACTIVE.
-- ---------------------------------------------------------------------------
ALTER TABLE "Patrol" ADD COLUMN "userId" TEXT;
UPDATE "Patrol" p
  SET "userId" = pa."userId"
  FROM "PatrolAssignment" pa
  WHERE pa."patrolId" = p.id;
ALTER TABLE "Patrol" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Patrol" ADD CONSTRAINT "Patrol_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Patrol_userId_idx" ON "Patrol"("userId");

-- Newly self-initiated patrols start ACTIVE; migrate any ASSIGNED rows.
ALTER TABLE "Patrol" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
UPDATE "Patrol" SET "status" = 'ACTIVE' WHERE "status" = 'ASSIGNED';

-- ---------------------------------------------------------------------------
-- 3. Drop assignment / duty-route / waypoint machinery.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "WaypointCheckin";
DROP TABLE IF EXISTS "PatrolWaypoint";
DROP TABLE IF EXISTS "PatrolDutyRoute";
DROP TABLE IF EXISTS "PatrolAssignment";

-- Drop the now-unused enum type.
DROP TYPE IF EXISTS "AssignmentStatus";

-- ---------------------------------------------------------------------------
-- 4. PatrolStatus: remove ASSIGNED from the enum (Postgres cannot delete an
--    enum label, so we rebuild the type).
-- ---------------------------------------------------------------------------
CREATE TYPE "PatrolStatus_new" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Patrol" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Patrol" ALTER COLUMN "status" TYPE "PatrolStatus_new"
  USING ("status"::text::"PatrolStatus_new");
ALTER TABLE "Patrol" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "PatrolStatus";
ALTER TYPE "PatrolStatus_new" RENAME TO "PatrolStatus";