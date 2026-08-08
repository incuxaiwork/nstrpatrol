-- Beat/Compartment source data mixes Polygon and MultiPolygon geometries,
-- so widen the columns to generic geometry(4326) (GIST indexes remain valid).
ALTER TABLE "Beat" ALTER COLUMN geom TYPE geometry(Geometry,4326) USING geom::geometry;
ALTER TABLE "Compartment" ALTER COLUMN geom TYPE geometry(Geometry,4326) USING geom::geometry;
