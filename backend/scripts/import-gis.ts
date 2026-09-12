/**
 * One-off GIS import: ingests the forest reference data that used to live as
 * bundled mobile assets into PostGIS.
 *
 *   mark_beat.json → "Beat" table (Polygon, name-keyed, idempotent)
 *   mark_comp.json → "Compartment" table (MultiPolygon, linked to Beat by name)
 *   NSTR.mbtiles   → "MapAsset" row with the atlas blob in the bytea `data`
 *
 * Usage: npm run import:gis [assetsDir]
 * Assets dir defaults to ../../mobile/app/src/main/assets.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../src/db/prisma';
import { canonicalBlock } from '../src/gis/block-registry';

const MBTILES_KEY = 'NSTR.mbtiles';

interface GeoFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: unknown;
}

interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

function asText(value: unknown, fallback: string | null = ''): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : fallback;
}

function asFloat(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function parseGeoJsonFile(file: string): Promise<GeoFeatureCollection> {
  const raw = await readFile(file, 'utf-8');
  const parsed = JSON.parse(raw) as GeoFeatureCollection;
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error(`Not a FeatureCollection: ${file}`);
  }
  return parsed;
}

async function importBeats(beats: GeoFeatureCollection): Promise<number> {
  const names = beats.features
    .map((f) => asText(f.properties['Beat'], '')?.toUpperCase() ?? '')
    .filter((n) => n.length > 0);
  if (names.length > 0) {
    await prisma.beat.deleteMany({ where: { name: { in: names } } });
  }

  // Bulk insert in batches of 20.
  const BATCH = 20;
  let count = 0;
  const valid = beats.features.filter(f => f.geometry && asText(f.properties['Beat'], ''));

  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const feature of batch) {
      const p = feature.properties;
      const name = asText(p['Beat'], '') ?? '';
      values.push(`(gen_random_uuid()::text, $${idx}::text, $${idx + 1}::text, $${idx + 2}::text, $${idx + 3}::text, $${idx + 4}::text, $${idx + 5}::text, $${idx + 6}::double precision, now(), now())`);
      params.push(name, asText(p['Section']), asText(p['Range']), asText(p['Division']), asText(p['Circle']), asText(p['District']), asFloat(p['Area_ha']));
      idx += 7;
      count++;
    }

    const sql = `INSERT INTO "Beat" (id, "name", "section", "rangeName", "division", "circle", "district", "areaHa", "createdAt", "updatedAt")
      VALUES ${values.join(', ')}
      RETURNING id, name`;
    const inserted = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(sql, ...params);

    // Set geometry for each inserted beat.
    for (let j = 0; j < batch.length; j++) {
      const beatId = inserted[j].id;
      const geom = JSON.stringify(batch[j].geometry);
      await prisma.$executeRaw`UPDATE "Beat" SET geom = ST_GeomFromGeoJSON(${geom}::text) WHERE id = ${beatId}`;
    }
    process.stdout.write(`  Inserted ${Math.min(i + BATCH, valid.length)}/${valid.length}\r`);
  }

  console.log();
  return count;
}

async function importCompartments(compartments: GeoFeatureCollection): Promise<number> {
  await prisma.compartment.deleteMany({});

  // Build beat name → id map in one query (includes fuzzy aliases).
  const allBeats = await prisma.beat.findMany({ select: { id: true, name: true } });
  const beatMap = new Map<string, string>();
  for (const b of allBeats) {
    beatMap.set(b.name, b.id);
    // Also map normalized aliases: "G.V.PALLI" → stored as-is, but
    // source may have "G V PALLI" — store both directions.
    beatMap.set(b.name.replace(/\./g, ''), b.id);
    beatMap.set(b.name.replace(/\s+/g, ''), b.id);
  }

  // Bulk insert in batches of 50 using raw SQL for speed.
  const BATCH = 50;
  let count = 0;
  const valid = compartments.features.filter(f => f.geometry && asText(f.properties['COMP_NO'], ''));

  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

for (const feature of batch) {
      const p = feature.properties;
      const compNo = asText(p['COMP_NO'], '') ?? '';
      const areaHa = asFloat(p['AREA_HA']);
      // Facing logic: the canonical block this compartment faces into
      // (BLOCK attr from the mark request JSON → canonical name).
      const blockName = canonicalBlock(p['BLOCK']);
      const beatName = asText(p['BEAT'], '')?.toUpperCase() ?? '';

      // Fuzzy match: exact → strip dots → strip spaces
      let beatId: string | null = null;
      if (beatName) {
        beatId = beatMap.get(beatName) ?? beatMap.get(beatName.replace(/\./g, '')) ?? beatMap.get(beatName.replace(/\s+/g, '')) ?? null;
      }

      values.push(`(gen_random_uuid()::text, $${idx}::text, $${idx + 1}::double precision, $${idx + 2}::text, $${idx + 3}::text, ST_GeomFromGeoJSON($${idx + 4}::text), now())`);
      params.push(compNo, areaHa, blockName, beatId, JSON.stringify(feature.geometry));
      idx += 5;
      count++;
    }

    const sql = `INSERT INTO "Compartment" (id, "compNo", "areaHa", "block", "beatId", geom, "createdAt") VALUES ${values.join(', ')}`;
    await prisma.$executeRawUnsafe(sql, ...params);
    process.stdout.write(`  Inserted ${Math.min(i + BATCH, valid.length)}/${valid.length}\r`);
  }

  console.log();
  return count;
}

async function importMbtiles(data: Buffer): Promise<void> {
  const sha256 = createHash('sha256').update(data).digest('hex');
  const existing = await prisma.mapAsset.findUnique({ where: { resourceKey: MBTILES_KEY } });
  const version = existing && existing.sha256 !== sha256 ? existing.version + 1 : existing?.version ?? 1;

  await prisma.mapAsset.upsert({
    where: { resourceKey: MBTILES_KEY },
    create: {
      resourceKey: MBTILES_KEY,
      contentType: 'application/octet-stream',
      storagePath: null,
      sizeBytes: data.length,
      sha256,
      version,
      data,
    },
    update: {
      contentType: 'application/octet-stream',
      storagePath: null,
      sizeBytes: data.length,
      sha256,
      version,
      data,
    },
  });
}

async function main(): Promise<void> {
  const assetDir = process.argv[2] ?? resolve(__dirname, '../../mobile/app/src/main/assets');

  const beats = await parseGeoJsonFile(resolve(assetDir, 'mark_beat.json'));
  const compartments = await parseGeoJsonFile(resolve(assetDir, 'mark_comp.json'));
  const mbtiles = await readFile(resolve(assetDir, 'NSTR.mbtiles'));

  const beatCount = await importBeats(beats);
  const compCount = await importCompartments(compartments);
  await importMbtiles(mbtiles);

  console.log(
    `GIS import complete from ${assetDir}: ${beatCount} beats, ${compCount} compartments, MapAsset ${MBTILES_KEY} updated.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('GIS import failed:', err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
