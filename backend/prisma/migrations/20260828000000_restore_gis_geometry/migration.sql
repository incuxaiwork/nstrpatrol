-- No-op placeholder.
--
-- On 2026-09-11 a migration by this name that attempted to restore PostGIS
-- geometry columns failed (P3009) on the production database, which
-- intentionally has NO PostGIS extension and NO geom columns (see
-- 20260826120000_ensure_postgis no-op and 20260901090000_drop_broken_geom_triggers).
-- It was resolved with `prisma migrate resolve --rolled-back`, so this file
-- must stay a no-op. GIS runs from bundled device assets; the server needs
-- no spatial types.
SELECT 1;
