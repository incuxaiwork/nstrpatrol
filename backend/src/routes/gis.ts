import { Router } from 'express';
import { prisma } from '../db/prisma';
import { param } from '../lib/http';

export const gisRouter = Router();

/* In-memory GeoJSON cache: the four geometry layers are static reference
 * data; serialize from PostGIS at most once per TTL instead of per request. */
const geoCache = new Map<string, { at: number; body: string }>();
const GEO_TTL_MS = 15 * 60_000;

async function cachedGeo(key: string, load: () => Promise<string>): Promise<string> {
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.body;
  const body = await load();
  geoCache.set(key, { at: Date.now(), body });
  return body;
}

/**
 * GET /api/gis/beats
 * Forest beats as a GeoJSON FeatureCollection, properties shaped like the
 * original mark_beat.json so existing mobile parsing keeps working.
 */
gisRouter.get('/beats', async (_req, res) => {
  const body = await cachedGeo('beats', async () => {
    const rows = await prisma.$queryRaw<{ geojson: string }[]>`
      SELECT COALESCE(
        json_build_object(
          'type', 'FeatureCollection',
          'features', json_agg(feature)
        )::text,
        '{"type":"FeatureCollection","features":[]}'
      ) AS geojson
      FROM (
        SELECT json_build_object(
          'type', 'Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(geom)::json,
          'properties', json_build_object(
            'OBJECTID_1', id,
            'Beat', name,
            'Section', COALESCE(section, ''),
            'Range', COALESCE("rangeName", ''),
            'Division', COALESCE(division, ''),
            'Circle', COALESCE(circle, ''),
            'District', COALESCE(district, ''),
            'Area_ha', COALESCE("areaHa", 0)
          )
        ) AS feature
        FROM "Beat"
        WHERE geom IS NOT NULL
      ) t
    `;
    return rows[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(body);
});

/**
 * GET /api/gis/compartments
 * Forest compartments as a GeoJSON FeatureCollection.
 */
gisRouter.get('/compartments', async (_req, res) => {
  const body = await cachedGeo('compartments', async () => {
    const rows = await prisma.$queryRaw<{ geojson: string }[]>`
      SELECT COALESCE(
        json_build_object(
          'type', 'FeatureCollection',
          'features', json_agg(feature)
        )::text,
        '{"type":"FeatureCollection","features":[]}'
      ) AS geojson
      FROM (
        SELECT json_build_object(
          'type', 'Feature',
          'id', c.id,
          'geometry', ST_AsGeoJSON(c.geom)::json,
          'properties', json_build_object(
            'OBJECTID_1', c.id,
            'COMP_NO', c."compNo",
            'BEAT', COALESCE(b.name, ''),
            'AREA_HA', COALESCE(c."areaHa", 0)
          )
        ) AS feature
        FROM "Compartment" c
        LEFT JOIN "Beat" b ON b.id = c."beatId"
        WHERE c.geom IS NOT NULL
      ) t
    `;
    return rows[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(body);
});

/**
 * GET /api/gis/version
 * Lightweight hash of beat + compartment counts so mobile can decide
 * whether to re-fetch the full GeoJSON layers.
 */
gisRouter.get('/version', async (_req, res) => {
  const [beatRow, compRow] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint; maxUpdated: Date | null }[]>`
      SELECT COUNT(*)::int AS cnt, MAX("updatedAt") AS "maxUpdated" FROM "Beat"
    `,
    prisma.$queryRaw<{ cnt: bigint; maxUpdated: Date | null }[]>`
      SELECT COUNT(*)::int AS cnt, MAX("updatedAt") AS "maxUpdated" FROM "Compartment"
    `,
  ]);
  res.json({
    beats: { count: Number(beatRow[0]?.cnt ?? 0), lastUpdated: beatRow[0]?.maxUpdated ?? null },
    compartments: { count: Number(compRow[0]?.cnt ?? 0), lastUpdated: compRow[0]?.maxUpdated ?? null },
  });
});

const ASSET_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * GET /api/gis/boundary
 * Reserved forest boundary polygons as a GeoJSON FeatureCollection.
 */
gisRouter.get('/boundary', async (_req, res) => {
  const body = await cachedGeo('boundary', async () => {
    const rows = await prisma.$queryRaw<{ geojson: string }[]>`
      SELECT COALESCE(
        json_build_object(
          'type', 'FeatureCollection',
          'features', json_agg(feature)
        )::text,
        '{"type":"FeatureCollection","features":[]}'
      ) AS geojson
      FROM (
        SELECT json_build_object(
          'type', 'Feature',
          'id', fb.id,
          'geometry', ST_AsGeoJSON(fb.geom)::json,
          'properties', json_build_object(
            'name', COALESCE(fb.name, f.name, ''),
            'forestId', fb."forestId",
            'forestCode', COALESCE(f.code, '')
          )
        ) AS feature
        FROM "ForestBoundary" fb
        LEFT JOIN "Forest" f ON f.id = fb."forestId"
        WHERE fb.geom IS NOT NULL
      ) t
    `;
    return rows[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(body);
});

/**
 * GET /api/gis/grids
 * Forest reference grids as a GeoJSON FeatureCollection.
 */
gisRouter.get('/grids', async (_req, res) => {
  const body = await cachedGeo('grids', async () => {
    const rows = await prisma.$queryRaw<{ geojson: string }[]>`
      SELECT COALESCE(
        json_build_object(
          'type', 'FeatureCollection',
          'features', json_agg(feature)
        )::text,
        '{"type":"FeatureCollection","features":[]}'
      ) AS geojson
      FROM (
        SELECT json_build_object(
          'type', 'Feature',
          'id', fg.id,
          'geometry', ST_AsGeoJSON(fg.geom)::json,
          'properties', json_build_object(
            'gridCode', COALESCE(fg."gridCode", ''),
            'forestId', fg."forestId"
          )
        ) AS feature
        FROM "ForestGrid" fg
        WHERE fg.geom IS NOT NULL
      ) t
    `;
    return rows[0]?.geojson ?? '{"type":"FeatureCollection","features":[]}';
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(body);
});

/**
 * GET /api/gis/assets
 * Metadata for all stored map assets (no blobs).
 */
gisRouter.get('/assets', async (_req, res) => {
  const assets = await prisma.mapAsset.findMany({ orderBy: { resourceKey: 'asc' } });
  res.json(
    assets.map((a) => ({
      id: a.id,
      resourceKey: a.resourceKey,
      contentType: a.contentType,
      storagePath: a.storagePath,
      sizeBytes: a.sizeBytes,
      sha256: a.sha256,
      version: a.version,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  );
});

/**
 * GET /api/gis/assets/:resourceKey
 * Downloads the inline blob (e.g. the MBTiles atlas) with an ETag of the sha256.
 */
gisRouter.get('/assets/:resourceKey', async (req, res) => {
  const resourceKey = param(req, 'resourceKey');
  if (!ASSET_KEY_PATTERN.test(resourceKey)) {
    res.status(400).json({ error: { code: "invalid_key", message: "Invalid asset key" } });
    return;
  }

  const asset = await prisma.mapAsset.findUnique({ where: { resourceKey } });
  if (!asset || asset.data == null) {
    res.status(404).json({ error: { code: "not_found", message: "Asset not found or has no inline blob" } });
    return;
  }

  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Length', String(asset.data.length));
  res.setHeader('ETag', `"${asset.sha256}"`);
  res.setHeader('X-Asset-Version', String(asset.version));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(asset.data));
});
