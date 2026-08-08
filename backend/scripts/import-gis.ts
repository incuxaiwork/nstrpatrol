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
  // Beats carry no stable id in the source; key on name so the import is idempotent.
  const names = beats.features
    .map((f) => asText(f.properties['Beat'], '')?.toUpperCase() ?? '')
    .filter((n) => n.length > 0);
  if (names.length > 0) {
    await prisma.beat.deleteMany({ where: { name: { in: names } } });
  }

  let count = 0;
  for (const feature of beats.features) {
    if (!feature.geometry) continue;
    const p = feature.properties;
    const name = asText(p['Beat'], '') ?? '';
    if (!name) continue;

    const beat = await prisma.beat.create({
      data: {
        name,
        section: asText(p['Section']),
        rangeName: asText(p['Range']),
        division: asText(p['Division']),
        circle: asText(p['Circle']),
        district: asText(p['District']),
        areaHa: asFloat(p['Area_ha']),
      },
    });
    await prisma.$executeRaw`
      UPDATE "Beat" SET geom = ST_GeomFromGeoJSON(${JSON.stringify(feature.geometry)}::text) WHERE id = ${beat.id}
    `;
    count++;
  }
  return count;
}

async function importCompartments(compartments: GeoFeatureCollection): Promise<number> {
  await prisma.compartment.deleteMany({});

  let count = 0;
  for (const feature of compartments.features) {
    if (!feature.geometry) continue;
    const p = feature.properties;
    const compNo = asText(p['COMP_NO'], '') ?? '';
    if (!compNo) continue;

    const beatName = asText(p['BEAT'], '')?.toUpperCase() ?? '';
    const beat = beatName
      ? await prisma.beat.findFirst({ where: { name: beatName }, select: { id: true } })
      : null;

    const comp = await prisma.compartment.create({
      data: {
        compNo,
        areaHa: asFloat(p['AREA_HA']),
        beatId: beat?.id ?? null,
      },
    });
    await prisma.$executeRaw`
      UPDATE "Compartment" SET geom = ST_GeomFromGeoJSON(${JSON.stringify(feature.geometry)}::text) WHERE id = ${comp.id}
    `;
    count++;
  }
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
