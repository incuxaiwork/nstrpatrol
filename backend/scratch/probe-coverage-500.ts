import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const r1 = await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log('BASIC QUERY OK:', JSON.stringify(r1));
  } catch (e: any) {
    console.log('BASIC QUERY FAIL:', String(e?.message ?? e).slice(0, 500));
  }

  try {
    const r2 = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "ForestGrid" fg WHERE fg.geom IS NOT NULL`;
    console.log('FORESTGRID COUNT:', JSON.stringify(r2));
  } catch (e: any) {
    console.log('FORESTGRID FAIL:', String(e?.message ?? e).slice(0, 500));
  }

  try {
    const r3 = await prisma.$queryRaw`
      WITH visible AS (SELECT p.id FROM "Patrol" p),
      scoped_cells AS (
        SELECT fg.id AS "cellId", fg."gridCode", fg."forestId", f."code" AS "forestCode", fg.geom
        FROM "ForestGrid" fg
        LEFT JOIN "Forest" f ON f.id = fg."forestId"
        WHERE fg.geom IS NOT NULL
      ),
      attrib AS (
        SELECT sc."cellId", COUNT(pp.id)::int AS "pointCount", MAX(pp."timestamp") AS "lastPatrolledAt"
        FROM scoped_cells sc
        LEFT JOIN "PatrolPoint" pp ON pp."patrolId" IN (SELECT id FROM visible) AND ST_Intersects(sc.geom, pp.geom)
        GROUP BY sc."cellId"
      )
      SELECT sc."cellId" AS id, sc."gridCode", sc."forestId", sc."forestCode",
             COALESCE(a."pointCount", 0) AS "pointCount", a."lastPatrolledAt",
             COALESCE(a."pointCount", 0) > 0 AS covered
      FROM scoped_cells sc
      LEFT JOIN attrib a ON a."cellId" = sc."cellId"
      ORDER BY sc."gridCode"`;
    console.log('COVERAGE RAW OK rows=', (r3 as unknown[]).length);
  } catch (e: any) {
    console.log('COVERAGE RAW FAIL:', String(e?.message ?? e).slice(0, 900));
  }

  try {
    const r4 = await prisma.$queryRaw`SELECT to_regclass('"ForestGrid"') AS fg, to_regclass('"PatrolPoint"') AS pp, to_regclass('"Patrol"') AS p, (SELECT name FROM pg_extension WHERE extname='postgis') AS postgis`;
    console.log('REGCLASS/POSTGIS:', JSON.stringify(r4));
  } catch (e: any) {
    console.log('REGCLASS FAIL:', String(e?.message ?? e).slice(0, 300));
  }
}

main()
  .catch((e) => console.log('FATAL:', String(e?.message ?? e).slice(0, 500)))
  .finally(() => prisma.$disconnect());