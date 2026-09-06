-- Ensure PostGIS extension is enabled for spatial queries.
-- Safe to run multiple times (IF NOT EXISTS).
-- If the postgis extension is not available (e.g. missing shared library),
-- the migration continues — spatial queries will use Haversine fallback.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
  RAISE NOTICE 'PostGIS extension not available — spatial queries will use Haversine fallback';
END $$;
