import { Router } from 'express';
import { prisma } from '../db/prisma';
import { param } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

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
  const EMPTY_FC = '{"type":"FeatureCollection","features":[]}';
  const body = await cachedGeo('beats', async () => {
    try {
      const rows = await prisma.$queryRaw<{ geojson: string }[]>`
        SELECT COALESCE(
          json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(feature)
          )::text,
          '${EMPTY_FC}'
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
      return rows[0]?.geojson ?? EMPTY_FC;
    } catch {
      return EMPTY_FC;
    }
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(body);
});

/**
 * GET /api/gis/compartments
 * Forest compartments as a GeoJSON FeatureCollection.
 */
gisRouter.get('/compartments', async (_req, res) => {
  const EMPTY_FC = '{"type":"FeatureCollection","features":[]}';
  const body = await cachedGeo('compartments', async () => {
    try {
      const rows = await prisma.$queryRaw<{ geojson: string }[]>`
        SELECT COALESCE(
          json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(feature)
          )::text,
          '${EMPTY_FC}'
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
      return rows[0]?.geojson ?? EMPTY_FC;
    } catch {
      return EMPTY_FC;
    }
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
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
  const EMPTY_FC = '{"type":"FeatureCollection","features":[]}';
  const body = await cachedGeo('boundary', async () => {
    try {
      const rows = await prisma.$queryRaw<{ geojson: string }[]>`
        SELECT COALESCE(
          json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(feature)
          )::text,
          '${EMPTY_FC}'
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
      return rows[0]?.geojson ?? EMPTY_FC;
    } catch {
      return EMPTY_FC;
    }
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(body);
});

/**
 * GET /api/gis/grids
 * Forest reference grids as a GeoJSON FeatureCollection.
 */
gisRouter.get('/grids', async (_req, res) => {
  const EMPTY_FC = '{"type":"FeatureCollection","features":[]}';
  const body = await cachedGeo('grids', async () => {
    try {
      const rows = await prisma.$queryRaw<{ geojson: string }[]>`
        SELECT COALESCE(
          json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(feature)
          )::text,
          '${EMPTY_FC}'
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
      return rows[0]?.geojson ?? EMPTY_FC;
    } catch {
      return EMPTY_FC;
    }
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
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

/* ── Geofencing ─────────────────────────────────────────────────────────── */

/** Load the bundled beat GeoJSON (mark_beat.json) for point-in-polygon checks. */
let _beatFeatures: any[] = [];
let _beatFeaturesLoaded = false;
function loadBeatFeatures(): any[] {
  if (_beatFeaturesLoaded) return _beatFeatures;
  _beatFeaturesLoaded = true;
  try {
    const assetPath = path.resolve(process.cwd(), 'mark_beat.json');
    const raw = fs.readFileSync(assetPath, 'utf-8');
    const fc = JSON.parse(raw);
    _beatFeatures = fc.features ?? [];
  } catch {
    _beatFeatures = [];
  }
  return _beatFeatures;
}

/** Ray-casting point-in-polygon. Coordinates are [lng, lat] (GeoJSON order). */
function pointInPolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon). */
function pointInGeometry(lng: number, lat: number, geom: any): boolean {
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    return pointInPolygon(lng, lat, geom.coordinates[0]);
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some((polygon: number[][][]) => pointInPolygon(lng, lat, polygon[0]));
  }
  return false;
}

const validateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  beatName: z.string().trim().max(160).optional(),
  sectionName: z.string().trim().max(160).optional(),
  rangeName: z.string().trim().max(160).optional(),
});

/**
 * POST /api/gis/validate-location
 * Checks if a GPS coordinate falls within the assigned beat, section, or range polygon.
 * Used by the mobile app to verify the officer is in their designated area
 * before starting a patrol.
 *
 * Hierarchy: beat → section → range → no assignment
 */
gisRouter.post('/validate-location', requireAuth, validateBody(validateLocationSchema), (req, res) => {
  const { lat, lng, beatName, sectionName, rangeName } = req.body;
  const features = loadBeatFeatures();

  if (features.length === 0) {
    res.json({ valid: false, reason: 'no_gis_data', message: 'Beat geometry data not available' });
    return;
  }

  // If a specific beat is assigned, check containment in that beat only
  if (beatName) {
    const normalised = beatName.toUpperCase();
    const match = features.find((f: any) =>
      (f.properties?.Beat ?? '').toUpperCase() === normalised
    );
    if (!match) {
      res.json({ valid: false, reason: 'beat_not_found', message: `Beat "${beatName}" not found in GIS data` });
      return;
    }
    const inside = pointInGeometry(lng, lat, match.geometry);
    res.json({
      valid: inside,
      reason: inside ? 'inside_beat' : 'outside_beat',
      beat: match.properties?.Beat,
      range: match.properties?.Range,
    });
    return;
  }

  // If a section is assigned (FSO/DyRO with section), check containment in any beat of that section
  if (sectionName) {
    const normalised = sectionName.toUpperCase();
    const sectionBeats = features.filter((f: any) =>
      (f.properties?.Section ?? '').toUpperCase() === normalised
    );
    if (sectionBeats.length === 0) {
      // Section not found in GIS — fall through to range check if available
      if (rangeName) {
        // fall through to range check below
      } else {
        res.json({ valid: false, reason: 'section_not_found', message: `Section "${sectionName}" not found in GIS data` });
        return;
      }
    } else {
      const insideBeat = sectionBeats.find((f: any) => pointInGeometry(lng, lat, f.geometry));
      res.json({
        valid: !!insideBeat,
        reason: insideBeat ? 'inside_section' : 'outside_section',
        beat: insideBeat?.properties?.Beat ?? null,
        range: rangeName ?? sectionBeats[0]?.properties?.Range ?? null,
        section: sectionName,
      });
      return;
    }
  }

  // If a range is assigned (FRO/DyRO/FSO without section), check containment in any beat of that range
  if (rangeName) {
    const normalised = rangeName.toUpperCase();
    const rangeBeats = features.filter((f: any) =>
      (f.properties?.Range ?? '').toUpperCase() === normalised
    );
    if (rangeBeats.length === 0) {
      res.json({ valid: false, reason: 'range_not_found', message: `Range "${rangeName}" not found in GIS data` });
      return;
    }
    const insideBeat = rangeBeats.find((f: any) => pointInGeometry(lng, lat, f.geometry));
    res.json({
      valid: !!insideBeat,
      reason: insideBeat ? 'inside_range' : 'outside_range',
      beat: insideBeat?.properties?.Beat ?? null,
      range: rangeName,
    });
    return;
  }

  // No assignment — allow (admin / unassigned)
  res.json({ valid: true, reason: 'no_assignment', message: 'No beat or range assignment to validate against' });
});
