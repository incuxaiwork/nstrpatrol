-- Production databases lost their PostGIS `geom` columns (no table in the
-- public schema has one, and the PostGIS extension is not installed), while
-- these two triggers survived. Every INSERT into PatrolPoint/Incident then
-- crashed with `record "new" has no field "geom"`, which Prisma surfaced as
-- "The column `new` does not exist in the current database" and blocked ALL
-- patrol sync. The triggers serve no purpose without `geom` columns, so drop
-- them. (fn_set_point_geom is left in place for a future GIS restore.)
DROP TRIGGER IF EXISTS trg_patrolpoint_geom ON "PatrolPoint";
DROP TRIGGER IF EXISTS trg_incident_geom ON "Incident";
