import 'dotenv/config';
import { prisma } from '../src/db/prisma';

const FOREST_ID = 'cmsvjcx3r0004na01rj87276v';

async function main() {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ForestBoundary_geom_idx"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ForestBoundary" ALTER COLUMN geom TYPE geometry(Geometry,4326) USING geom::geometry(Geometry,4326)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX "ForestBoundary_geom_idx" ON "ForestBoundary" USING GIST (geom)`);

  await prisma.$executeRawUnsafe(`ALTER TABLE "ForestGrid" ALTER COLUMN geom TYPE geometry(Geometry,4326) USING geom::geometry(Geometry,4326)`);

  const b = await prisma.$executeRawUnsafe(`
    INSERT INTO "ForestBoundary" (id, "forestId", name, geom, "createdAt")
    SELECT gen_random_uuid()::text, '${FOREST_ID}', 'NSTR Reserve (union of beats)',
           ST_Multi(ST_Union(geom)), now()
    FROM "Beat" WHERE geom IS NOT NULL
  `);
  console.log('ForestBoundary inserted:', b);

  await prisma.$executeRawUnsafe(`DELETE FROM "ForestGrid"`);

  const g = await prisma.$executeRawUnsafe(`
    INSERT INTO "ForestGrid" (id, "forestId", "gridCode", geom, "createdAt")
    SELECT gen_random_uuid()::text, '${FOREST_ID}', 'G' || lpad(row_number() over ()::text, 3, '0'), cell, now()
    FROM (
      SELECT cell FROM (
        SELECT ST_SetSRID((ST_SquareGrid(0.03, ST_Expand(ST_Extent(geom), 0.001))).geom, 4326) AS cell
        FROM "Beat" WHERE geom IS NOT NULL
      ) c
      WHERE EXISTS (SELECT 1 FROM "Beat" bi WHERE bi.geom IS NOT NULL AND ST_Intersects(bi.geom, c.cell))
    ) s
  `);
  console.log('ForestGrid inserted:', g);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error('FAILED:', e.message); await prisma.$disconnect(); process.exit(1); });