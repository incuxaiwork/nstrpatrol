-- Block attribute: the Facing logic's block name for each compartment,
-- extracted from the survey BLOCK property during GIS import (see
-- src/gis/block-registry.ts). Nullable so existing rows backfill from the
-- restore script; index serves the /api/gis/blocks dissolve GROUP BY.
ALTER TABLE "Compartment" ADD COLUMN "block" TEXT;

CREATE INDEX "Compartment_block_idx" ON "Compartment"("block");