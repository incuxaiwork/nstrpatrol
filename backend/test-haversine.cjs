const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const id = '7479c3d0-4a7c-476a-a2f8-1307c4a7605a';
  
  // Try PostGIS first
  try {
    const r1 = await p.$queryRawUnsafe(`
      SELECT ST_Length(
        ST_MakeLine(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
          ORDER BY timestamp
        )::geography
      ) / 1000.0 AS dist
      FROM "PatrolPoint"
      WHERE "patrolId" = $1
    `, id);
    console.log('PostGIS result:', JSON.stringify(r1));
  } catch(e) {
    console.log('PostGIS FAILED:', e.message.substring(0, 200));
  }
  
  // Try Haversine
  try {
    const r2 = await p.$queryRawUnsafe(`
      WITH ordered AS (
        SELECT longitude, latitude,
          LAG(longitude) OVER (ORDER BY timestamp) AS "prevLng",
          LAG(latitude)  OVER (ORDER BY timestamp) AS "prevLat"
        FROM "PatrolPoint"
        WHERE "patrolId" = $1
      )
      SELECT SUM(
        CASE WHEN "prevLat" IS NOT NULL AND "prevLng" IS NOT NULL
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND NOT (latitude = 0 AND longitude = 0)
          AND NOT ("prevLat" = 0 AND "prevLng" = 0)
        THEN 2 * 6371000.0 * ASIN(SQRT(
          POWER(SIN(RADIANS(latitude - "prevLat") / 2.0), 2) +
          COS(RADIANS("prevLat")) * COS(RADIANS(latitude)) *
          POWER(SIN(RADIANS(longitude - "prevLng") / 2.0), 2)
        )) ELSE 0 END
      ) / 1000.0 AS dist
      FROM ordered
    `, id);
    console.log('Haversine result:', JSON.stringify(r2));
  } catch(e) {
    console.log('Haversine FAILED:', e.message.substring(0, 200));
  }

  // Try batched (what list endpoint uses)
  try {
    const ids = ['7479c3d0-4a7c-476a-a2f8-1307c4a7605a','c74584c3-34c5-4195-b637-21d0a3b1d792','a86f0eda-32aa-4571-a18f-6309a04b997c'];
    const r3 = await p.$queryRawUnsafe(`
      WITH ordered AS (
        SELECT "patrolId", longitude, latitude, "timestamp",
          LAG(longitude) OVER (PARTITION BY "patrolId" ORDER BY "timestamp") AS "prevLng",
          LAG(latitude)  OVER (PARTITION BY "patrolId" ORDER BY "timestamp") AS "prevLat"
        FROM "PatrolPoint"
        WHERE "patrolId" = ANY($1::text[])
      )
      SELECT
        "patrolId",
        COALESCE(
          SUM(
            CASE WHEN "prevLat" IS NOT NULL AND "prevLng" IS NOT NULL
              AND latitude  IS NOT NULL AND longitude IS NOT NULL
              AND NOT (latitude = 0 AND longitude = 0)
              AND NOT ("prevLat" = 0 AND "prevLng" = 0)
            THEN 2 * 6371000.0 * ASIN(SQRT(
              POWER(SIN(RADIANS(latitude  - "prevLat") / 2.0), 2) +
              COS(RADIANS("prevLat")) * COS(RADIANS(latitude)) *
              POWER(SIN(RADIANS(longitude - "prevLng") / 2.0), 2)
            )) ELSE 0 END
          ) / 1000.0, 0
        ) AS "distanceKm",
        COALESCE(
          EXTRACT(EPOCH FROM MAX("timestamp") - MIN("timestamp")), 0
        ) AS "durationSeconds"
      FROM ordered
      GROUP BY "patrolId"
    `, ids);
    console.log('Batched Haversine result:', JSON.stringify(r3));
  } catch(e) {
    console.log('Batched Haversine FAILED:', e.message.substring(0, 200));
  }
  
  await p.$disconnect();
})();
