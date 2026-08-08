-- MapAsset: allow inline blob storage in PostGIS for the MBTiles atlas.
-- storagePath becomes optional (file-backed assets keep it; blob assets use data).
ALTER TABLE "MapAsset"
    ADD COLUMN "data" BYTEA,
    ALTER COLUMN "storagePath" DROP NOT NULL;
