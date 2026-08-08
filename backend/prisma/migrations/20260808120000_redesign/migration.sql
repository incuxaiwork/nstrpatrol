-- NSTR Patrol — final redesign baseline
-- PostgreSQL + PostGIS. All geospatial data stored as geometry(4326).
-- This is a hand-written raw-SQL migration: GIST indexes, the geom
-- auto-population trigger, and the PostGIS extension are not expressible
-- in Prisma's schema language (fields are Unsupported("geometry(...)")).

-- ============================================================
-- PostGIS extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RANGER');
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');
CREATE TYPE "PatrolType" AS ENUM ('WALK', 'BICYCLE', 'VEHICLE', 'STATIONARY');
CREATE TYPE "PatrolStatus" AS ENUM ('ASSIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "IncidentType" AS ENUM ('HUMAN_IMPACT', 'ANIMAL_MORTALITY', 'SIGHTING', 'WATER_SOURCE', 'QUICK_CAPTURE', 'GENERAL');
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "IncidentStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'RESOLVED', 'REJECTED');
CREATE TYPE "ActivityMode" AS ENUM ('WALK', 'BICYCLE', 'VEHICLE', 'STATIONARY');
CREATE TYPE "CoverageType" AS ENUM ('OUTSIDE_BEAT', 'NON_FOREST', 'OFF_ROUTE', 'SPEED_MISMATCH', 'JUMP', 'WAYPOINT_MISSED', 'MOCK_LOCATION', 'DEVICE_STATIONARY', 'TIME_TAMPER');

-- ============================================================
-- Users & devices
-- ============================================================
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RANGER',
    "phone" TEXT,
    "refreshTokenHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pushToken" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");

-- ============================================================
-- Forest reference
-- ============================================================
CREATE TABLE "Forest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Forest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForestBoundary" (
    "id" TEXT NOT NULL,
    "forestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geom" geometry(Polygon,4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForestBoundary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForestGrid" (
    "id" TEXT NOT NULL,
    "forestId" TEXT NOT NULL,
    "gridCode" TEXT NOT NULL,
    "geom" geometry(Polygon,4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForestGrid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Forest_code_key" ON "Forest"("code");
CREATE INDEX "ForestBoundary_forestId_idx" ON "ForestBoundary"("forestId");
CREATE INDEX "ForestGrid_forestId_idx" ON "ForestGrid"("forestId");

-- ============================================================
-- Duty vs member
-- ============================================================
CREATE TABLE "Patrol" (
    "id" TEXT NOT NULL,
    "forestId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "type" "PatrolType" NOT NULL,
    "status" "PatrolStatus" NOT NULL DEFAULT 'ASSIGNED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patrol_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatrolAssignment" (
    "id" TEXT NOT NULL,
    "patrolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Patrol_forestId_idx" ON "Patrol"("forestId");
CREATE INDEX "Patrol_status_idx" ON "Patrol"("status");
CREATE INDEX "PatrolAssignment_userId_idx" ON "PatrolAssignment"("userId");
CREATE INDEX "PatrolAssignment_status_idx" ON "PatrolAssignment"("status");
CREATE UNIQUE INDEX "PatrolAssignment_patrolId_userId_key" ON "PatrolAssignment"("patrolId", "userId");

-- ============================================================
-- Coverage targets
-- ============================================================
CREATE TABLE "PatrolRoute" (
    "id" TEXT NOT NULL,
    "beatId" TEXT,
    "patrolType" TEXT,
    "name" TEXT NOT NULL,
    "geom" geometry(LineString,4326),
    "targetKm" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatrolDutyRoute" (
    "id" TEXT NOT NULL,
    "patrolId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatrolDutyRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatrolWaypoint" (
    "id" TEXT NOT NULL,
    "patrolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geom" geometry(Point,4326),
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatrolWaypoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaypointCheckin" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "waypointId" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL,
    "distanceMeters" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaypointCheckin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatrolRoute_beatId_idx" ON "PatrolRoute"("beatId");
CREATE INDEX "PatrolDutyRoute_routeId_idx" ON "PatrolDutyRoute"("routeId");
CREATE INDEX "PatrolWaypoint_patrolId_idx" ON "PatrolWaypoint"("patrolId");
CREATE INDEX "WaypointCheckin_waypointId_idx" ON "WaypointCheckin"("waypointId");
CREATE UNIQUE INDEX "PatrolDutyRoute_patrolId_routeId_assignmentId_key" ON "PatrolDutyRoute"("patrolId", "routeId", "assignmentId");
CREATE UNIQUE INDEX "WaypointCheckin_assignmentId_waypointId_key" ON "WaypointCheckin"("assignmentId", "waypointId");

-- ============================================================
-- Telemetry (per-assignment)
-- ============================================================
CREATE TABLE "PatrolPoint" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "gridId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "bearing" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "geom" geometry(Point,4326),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatrolPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StepReading" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "steps" INTEGER NOT NULL,
    "cadence" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BarometerReading" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "pressureHpa" DOUBLE PRECISION NOT NULL,
    "altitudeM" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarometerReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccelerometerReading" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccelerometerReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GyroscopeReading" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GyroscopeReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MagnetometerReading" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagnetometerReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivitySegment" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "mode" "ActivityMode" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoverageEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "type" "CoverageType" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeIntegrityLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "gnssTimeAvailable" BOOLEAN NOT NULL,
    "divergenceSeconds" INTEGER NOT NULL,
    "autoTimeEnabled" BOOLEAN NOT NULL,
    "tamperDetected" BOOLEAN NOT NULL,
    "satellites" INTEGER NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeIntegrityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatrolPoint_assignmentId_timestamp_idx" ON "PatrolPoint"("assignmentId", "timestamp");
CREATE INDEX "StepReading_assignmentId_timestamp_idx" ON "StepReading"("assignmentId", "timestamp");
CREATE INDEX "BarometerReading_assignmentId_timestamp_idx" ON "BarometerReading"("assignmentId", "timestamp");
CREATE INDEX "AccelerometerReading_assignmentId_timestamp_idx" ON "AccelerometerReading"("assignmentId", "timestamp");
CREATE INDEX "GyroscopeReading_assignmentId_timestamp_idx" ON "GyroscopeReading"("assignmentId", "timestamp");
CREATE INDEX "MagnetometerReading_assignmentId_timestamp_idx" ON "MagnetometerReading"("assignmentId", "timestamp");
CREATE INDEX "ActivitySegment_assignmentId_startTime_idx" ON "ActivitySegment"("assignmentId", "startTime");
CREATE INDEX "CoverageEvent_assignmentId_type_idx" ON "CoverageEvent"("assignmentId", "type");
CREATE INDEX "TimeIntegrityLog_assignmentId_timestamp_idx" ON "TimeIntegrityLog"("assignmentId", "timestamp");

-- ============================================================
-- Incidents
-- ============================================================
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'LOW',
    "status" "IncidentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "details" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "geom" geometry(Point,4326),
    "photos" TEXT[],
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Incident_assignmentId_idx" ON "Incident"("assignmentId");
CREATE INDEX "Incident_userId_idx" ON "Incident"("userId");
CREATE INDEX "Incident_status_idx" ON "Incident"("status");
CREATE INDEX "Incident_occurredAt_idx" ON "Incident"("occurredAt");
CREATE INDEX "Incident_verifiedById_idx" ON "Incident"("verifiedById");

-- ============================================================
-- Map reference data
-- ============================================================
CREATE TABLE "Beat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "rangeName" TEXT,
    "division" TEXT,
    "circle" TEXT,
    "district" TEXT,
    "areaHa" DOUBLE PRECISION,
    "geom" geometry(Polygon,4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Compartment" (
    "id" TEXT NOT NULL,
    "beatId" TEXT,
    "compNo" TEXT NOT NULL,
    "areaHa" DOUBLE PRECISION,
    "geom" geometry(Polygon,4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compartment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Beat_name_idx" ON "Beat"("name");
CREATE INDEX "Compartment_beatId_idx" ON "Compartment"("beatId");

-- ============================================================
-- Assets & sync audit
-- ============================================================
CREATE TABLE "MapAsset" (
    "id" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "patrolId" TEXT,
    "recordsCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MapAsset_resourceKey_key" ON "MapAsset"("resourceKey");

-- ============================================================
-- Foreign keys
-- ============================================================
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ForestBoundary" ADD CONSTRAINT "ForestBoundary_forestId_fkey" FOREIGN KEY ("forestId") REFERENCES "Forest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ForestGrid" ADD CONSTRAINT "ForestGrid_forestId_fkey" FOREIGN KEY ("forestId") REFERENCES "Forest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Patrol" ADD CONSTRAINT "Patrol_forestId_fkey" FOREIGN KEY ("forestId") REFERENCES "Forest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolAssignment" ADD CONSTRAINT "PatrolAssignment_patrolId_fkey" FOREIGN KEY ("patrolId") REFERENCES "Patrol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolAssignment" ADD CONSTRAINT "PatrolAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolDutyRoute" ADD CONSTRAINT "PatrolDutyRoute_patrolId_fkey" FOREIGN KEY ("patrolId") REFERENCES "Patrol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolDutyRoute" ADD CONSTRAINT "PatrolDutyRoute_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "PatrolRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolDutyRoute" ADD CONSTRAINT "PatrolDutyRoute_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatrolWaypoint" ADD CONSTRAINT "PatrolWaypoint_patrolId_fkey" FOREIGN KEY ("patrolId") REFERENCES "Patrol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolWaypoint" ADD CONSTRAINT "PatrolWaypoint_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaypointCheckin" ADD CONSTRAINT "WaypointCheckin_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaypointCheckin" ADD CONSTRAINT "WaypointCheckin_waypointId_fkey" FOREIGN KEY ("waypointId") REFERENCES "PatrolWaypoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolPoint" ADD CONSTRAINT "PatrolPoint_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolPoint" ADD CONSTRAINT "PatrolPoint_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES "ForestGrid"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StepReading" ADD CONSTRAINT "StepReading_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BarometerReading" ADD CONSTRAINT "BarometerReading_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccelerometerReading" ADD CONSTRAINT "AccelerometerReading_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GyroscopeReading" ADD CONSTRAINT "GyroscopeReading_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MagnetometerReading" ADD CONSTRAINT "MagnetometerReading_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivitySegment" ADD CONSTRAINT "ActivitySegment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoverageEvent" ADD CONSTRAINT "CoverageEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeIntegrityLog" ADD CONSTRAINT "TimeIntegrityLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Compartment" ADD CONSTRAINT "Compartment_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatrolRoute" ADD CONSTRAINT "PatrolRoute_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- PostGIS: GIST indexes on geometry columns
-- ============================================================
CREATE INDEX "ForestBoundary_geom_idx" ON "ForestBoundary" USING GIST ("geom");
CREATE INDEX "ForestGrid_geom_idx" ON "ForestGrid" USING GIST ("geom");
CREATE INDEX "PatrolWaypoint_geom_idx" ON "PatrolWaypoint" USING GIST ("geom");
CREATE INDEX "PatrolPoint_geom_idx" ON "PatrolPoint" USING GIST ("geom");
CREATE INDEX "Incident_geom_idx" ON "Incident" USING GIST ("geom");
CREATE INDEX "Beat_geom_idx" ON "Beat" USING GIST ("geom");
CREATE INDEX "Compartment_geom_idx" ON "Compartment" USING GIST ("geom");
CREATE INDEX "PatrolRoute_geom_idx" ON "PatrolRoute" USING GIST ("geom");

-- ============================================================
-- Trigger: auto-populate geometry from lat/long so app rows
-- written via Prisma (which cannot see Unsupported columns) get
-- a valid 4326 point for spatial queries.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_point_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."longitude" IS NOT NULL AND NEW."latitude" IS NOT NULL THEN
        NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PatrolPoint: a point is required, always derivable from lat/long.
DROP TRIGGER IF EXISTS trg_patrolpoint_geom ON "PatrolPoint";
CREATE TRIGGER trg_patrolpoint_geom
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "PatrolPoint"
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_point_geom();

-- Incident: point is optional, set only when coordinates are present.
DROP TRIGGER IF EXISTS trg_incident_geom ON "Incident";
CREATE TRIGGER trg_incident_geom
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "Incident"
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_point_geom();
