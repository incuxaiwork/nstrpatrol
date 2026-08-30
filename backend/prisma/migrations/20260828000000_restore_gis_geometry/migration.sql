-- Restore GIS geometry columns that were dropped.
-- MUST run against a PostGIS-enabled database (CREATE EXTENSION postgis succeeds).
-- Rebuilds geometry from intact non-spatial columns + source GeoJSON (via script).
-- This migration is data-safe: only re-adds columns and backfills point geometry
-- from the intact latitude/longitude columns. Polygon geometry (Beat, Compartment,
-- ForestBoundary, ForestGrid) is restored by scripts/restore-gis-geometry.ts which
-- re-imports mark_beat.json / mark_comp.json.

-- Guard: abort cleanly with a clear error if PostGIS is unavailable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'PostGIS extension is required to restore geometry columns. Deploy the backend against a PostGIS-enabled database first.';
  END IF;
END $$;

-- ---- PatrolPoint: point geometry from latitude/longitude ----
ALTER TABLE "PatrolPoint" ADD COLUMN IF NOT EXISTS "geom" geometry(Point, 4326);
UPDATE "PatrolPoint"
SET "geom" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)
WHERE "longitude" IS NOT NULL AND "latitude" IS NOT NULL
  AND "longitude" <> 0 AND "latitude" <> 0
  AND "geom" IS NULL;
CREATE INDEX IF NOT EXISTS "PatrolPoint_geom_idx" ON "PatrolPoint" USING GIST ("geom");

-- ---- Incident: point geometry from latitude/longitude ----
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "geom" geometry(Point, 4326);
UPDATE "Incident"
SET "geom" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)
WHERE "longitude" IS NOT NULL AND "latitude" IS NOT NULL
  AND "longitude" <> 0 AND "latitude" <> 0
  AND "geom" IS NULL;
CREATE INDEX IF NOT EXISTS "Incident_geom_idx" ON "Incident" USING GIST ("geom");

-- ---- Beat, Compartment, ForestBoundary, ForestGrid, PatrolRoute: ----
-- Add the geometry columns (empty for now; populated by scripts/restore-gis-geometry.ts).
ALTER TABLE "Beat"         ADD COLUMN IF NOT EXISTS "geom" geometry(Geometry, 4326);
ALTER TABLE "Compartment"  ADD COLUMN IF NOT EXISTS "geom" geometry(Geometry, 4326);
ALTER TABLE "ForestBoundary" ADD COLUMN IF NOT EXISTS "geom" geometry(Geometry, 4326);
ALTER TABLE "ForestGrid"   ADD COLUMN IF NOT EXISTS "geom" geometry(Geometry, 4326);
ALTER TABLE "PatrolRoute"  ADD COLUMN IF NOT EXISTS "geom" geometry(Geometry, 4326);

CREATE INDEX IF NOT EXISTS "Beat_geom_idx"             ON "Beat" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "Compartment_geom_idx"      ON "Compartment" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "ForestBoundary_geom_idx"   ON "ForestBoundary" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "ForestGrid_geom_idx"       ON "ForestGrid" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "PatrolRoute_geom_idx"      ON "PatrolRoute" USING GIST ("geom");
