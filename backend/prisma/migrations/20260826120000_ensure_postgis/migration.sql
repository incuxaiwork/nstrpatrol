-- No-op placeholder.
--
-- On 2026-09-06 an uncommitted `railway up` from a local machine introduced a
-- migration by this name that attempted to install/enforce PostGIS. It failed
-- (0 steps applied) and its failed row blocked every later deploy (P3009).
-- It was resolved with `prisma migrate resolve --rolled-back`, so this file
-- must stay a no-op: the production database intentionally has NO PostGIS
-- extension and NO geom columns (see 20260901090000_drop_broken_geom_triggers).
-- GIS runs from bundled device assets; the server needs no spatial types.
SELECT 1;
