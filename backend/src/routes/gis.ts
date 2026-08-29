import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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

/* Asset metadata cache: small payload, rarely changes. */
const assetCache = new Map<string, { at: number; body: string }>();
const ASSET_CACHE_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 30_000;

const EMPTY_FC = '{"type":"FeatureCollection","features":[]}';

async function cachedGeo(key: string, load: () => Promise<string>): Promise<string> {
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.body;
  let body: string;
  try {
    body = await load();
  } catch (err: any) {
    console.error(`[gis] ${key} query failed:`, err?.message ?? err);
    body = EMPTY_FC;
  }
  geoCache.set(key, { at: Date.now(), body });
  return body;
}

/** True when a serialized FeatureCollection string contains no features. */
function isEmptyFeatureCollection(geojson: string): boolean {
  try {
    const fc = JSON.parse(geojson) as { features?: unknown[] };
    return !Array.isArray(fc.features) || fc.features.length === 0;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ *
 * Non-PostGIS fallback.
 *
 * When the extended `postgis` database driver is unavailable (its C shared
 * library was removed from the host, see the recovery audit), the `geom`
 * columns and `ST_*` functions do not exist, so the SQL serializers above
 * yield an empty FeatureCollection. To keep the GIS map functional we serve
 * the ORIGINAL bundled reference geometry (mobile/app/src/main/assets/
 * mark_beat.json + mark_comp.json) instead of fabricating anything.
 *
 * This is READ-ONLY: it never writes to the database. It reconstructs, in
 * memory, the exact FeatureCollection the PostGIS serializer produced:
 *   - feature `id` is the BEAT/COMPARTMENT PRIMARY KEY (so the frontend's
 *     OBJECTID_1 ≡ Beat.id / Compartment.id identity contract is kept and
 *     FKs remain valid), and
 *   - the polygon coordinates are the original source geometry from the
 *     bundled assets (the same data that was imported into PostGIS).
 *
 * It only runs when the PostGIS path returns no features, so once a PostGIS
 * database is restored the richer DB-backed serialization is used again
 * automatically with no code change.
 * ------------------------------------------------------------------ */

interface GeoFeature { type: 'Feature'; id?: unknown; properties: Record<string, unknown>; geometry: unknown; }
interface GeoFeatureCollection { type: 'FeatureCollection'; features: GeoFeature[]; }

/* Paths are probed at request time so the same module works when running from
 * `src` (tsx) or compiled `dist` (node dist/index.js). */
const ASSET_DIR_CANDIDATES = [
  resolve(__dirname, '../../../mobile/app/src/main/assets'),
  resolve(__dirname, '../../mobile/app/src/main/assets'),
];

/* Explicit disambiguation for beat names that map to > 1 DB row (mirrors the
 * restore script). Key = normalized GeoJSON beat name; value = canonical DB
 * Beat id (the record owning compartments/users). */
const BEAT_OVERRIDE: Record<string, string> = {
  NAGULAVARAM: 'ee7364e9-7f52-4ec5-bef2-8a9f0e704509',
  PBOMMALAPURAM: 'f5a70975-3595-49ef-9192-beedb020bd2f',
  PEDDACHAMA: 'c2f23388-b061-414b-b8b0-2b17af945ba0',
};

const normName = (s: unknown): string => String(s ?? '').toUpperCase().replace(/\./g, '').replace(/\s+/g, '');

let assetDir: string | null = null;
async function findAssetDir(): Promise<string> {
  if (assetDir) return assetDir;
  for (const d of ASSET_DIR_CANDIDATES) {
    try {
      const beats = resolve(d, 'mark_beat.json');
      await readFile(beats);
      assetDir = d;
      return d;
    } catch {
      /* try next */
    }
  }
  throw new Error('mark_beat.json / mark_comp.json not found in expected asset directories');
}

async function loadAssetGeoJson(fileName: string): Promise<GeoFeatureCollection> {
  const dir = await findAssetDir();
  const raw = await readFile(resolve(dir, fileName), 'utf-8');
  return JSON.parse(raw) as GeoFeatureCollection;
}

interface DbBeatRow {
  id: string;
  name: string;
  rangeName: string | null;
  section: string | null;
  division: string | null;
  circle: string | null;
  district: string | null;
  areaHa: number | null;
  compCount: number;
  userCount: number;
}

type BeatResolution = { id: string; how: 'unique' | 'override' | 'heuristic' } | null;

function makeBeatResolver(byNorm: Map<string, DbBeatRow[]>) {
  return (beatName: unknown): BeatResolution => {
    const key = normName(beatName);
    if (!key) return null;
    if (key in BEAT_OVERRIDE) {
      const id = BEAT_OVERRIDE[key];
      if (byNorm.get(key)?.some((b) => b.id === id)) return { id, how: 'override' };
      return null;
    }
    const candidates = byNorm.get(key) ?? [];
    if (candidates.length === 1) return { id: candidates[0].id, how: 'unique' };
    if (candidates.length > 1) {
      const sorted = [...candidates].sort((a, b) => b.compCount - a.compCount || b.userCount - a.userCount);
      if (sorted[0].compCount > sorted[1].compCount) return { id: sorted[0].id, how: 'heuristic' };
      return null; // tied — never guess
    }
    return null;
  };
}

/** Build the beats FeatureCollection from the bundled asset geometry joined to
 *  DB Beat primary keys, preserving the original API property shape. */
async function fallbackBeats(): Promise<string> {
  const [beatsFC, dbBeats] = await Promise.all([
    loadAssetGeoJson('mark_beat.json'),
    prisma.$queryRaw<DbBeatRow[]>`
      SELECT b.id, b.name, b."rangeName"::text, b."section"::text, b."division"::text,
             b."circle"::text, b."district"::text, b."areaHa",
        (SELECT count(*)::int FROM "Compartment" cc WHERE cc."beatId" = b.id) AS "compCount",
        (SELECT count(*)::int FROM "User" u WHERE u."beatId" = b.id) AS "userCount"
      FROM "Beat" b`,
  ]);

  const byNorm = new Map<string, DbBeatRow[]>();
  for (const b of dbBeats) {
    const k = normName(b.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k)!.push(b);
  }
  const resolveBeat = makeBeatResolver(byNorm);

  const features: GeoFeature[] = [];
  const assigned = new Set<string>();
  for (const f of beatsFC.features) {
    if (!f.geometry || !f.properties['Beat']) continue;
    const resolved = resolveBeat(f.properties['Beat']);
    if (!resolved || assigned.has(resolved.id)) continue;
    assigned.add(resolved.id);
    const b = dbBeats.find((x) => x.id === resolved.id)!;
    features.push({
      type: 'Feature',
      id: b.id,
      geometry: f.geometry,
      properties: {
        OBJECTID_1: b.id,
        Beat: b.name,
        Section: b.section ?? '',
        Range: b.rangeName ?? '',
        Division: b.division ?? '',
        Circle: b.circle ?? '',
        District: b.district ?? '',
        Area_ha: b.areaHa ?? 0,
      },
    });
  }

  return JSON.stringify({ type: 'FeatureCollection', features });
}

interface DbCompRow { id: string; compNo: string; beatId: string | null; areaHa: number | null; }

/** Build the compartments FeatureCollection from the bundled asset geometry
 *  joined to DB Compartment primary keys, preserving the API property shape. */
async function fallbackCompartments(): Promise<string> {
  const [compsFC, dbBeats, dbComps] = await Promise.all([
    loadAssetGeoJson('mark_comp.json'),
    prisma.$queryRaw<DbBeatRow[]>`
      SELECT b.id, b.name, b."rangeName"::text, b."section"::text, b."division"::text,
             b."circle"::text, b."district"::text, b."areaHa",
        (SELECT count(*)::int FROM "Compartment" cc WHERE cc."beatId" = b.id) AS "compCount",
        (SELECT count(*)::int FROM "User" u WHERE u."beatId" = b.id) AS "userCount"
      FROM "Beat" b`,
    prisma.$queryRaw<DbCompRow[]>`SELECT id, "compNo", "beatId", "areaHa" FROM "Compartment"`,
  ]);

  const byNorm = new Map<string, DbBeatRow[]>();
  for (const b of dbBeats) {
    const k = normName(b.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k)!.push(b);
  }
  const resolveBeat = makeBeatResolver(byNorm);
  const beatNameById = new Map<string, string>(dbBeats.map((b) => [b.id, b.name]));

  const byKey = new Map<string, string[]>();
  for (const cc of dbComps) {
    const key = `${cc.compNo}|${cc.beatId ?? 'NULL'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(cc.id);
  }

  const features: GeoFeature[] = [];
  const used = new Set<string>();
  for (const f of compsFC.features) {
    if (!f.geometry || f.properties['COMP_NO'] == null) continue;
    const resolved = resolveBeat(f.properties['BEAT']);
    if (!resolved) continue;
    const key = `${String(f.properties['COMP_NO'])}|${resolved.id}`;
    const candidates = (byKey.get(key) ?? []).filter((id) => !used.has(id));
    if (candidates.length === 0) continue;
    const targetId = candidates[0];
    used.add(targetId);
    const comp = dbComps.find((x) => x.id === targetId)!;
    features.push({
      type: 'Feature',
      id: comp.id,
      geometry: f.geometry,
      properties: {
        OBJECTID_1: comp.id,
        COMP_NO: comp.compNo,
        BEAT: comp.beatId ? (beatNameById.get(comp.beatId) ?? '') : '',
        AREA_HA: comp.areaHa ?? 0,
      },
    });
  }

  return JSON.stringify({ type: 'FeatureCollection', features });
}

/**
 * GET /api/gis/beats
 * Forest beats as a GeoJSON FeatureCollection, properties shaped like the
 * original mark_beat.json so existing mobile parsing keeps working.
 */
gisRouter.get('/beats', async (_req, res) => {
  const body = await cachedGeo('beats', async () => {
    let geojson: string | null = null;
    try {
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
      geojson = rows[0]?.geojson ?? null;
    } catch {
      geojson = null; // PostGIS unavailable — fall back to bundled assets below.
    }
    if (geojson != null && !isEmptyFeatureCollection(geojson)) return geojson;
    return fallbackBeats();
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
    let geojson: string | null = null;
    try {
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
      geojson = rows[0]?.geojson ?? null;
    } catch {
      geojson = null; // PostGIS unavailable — fall back to bundled assets below.
    }
    if (geojson != null && !isEmptyFeatureCollection(geojson)) return geojson;
    return fallbackCompartments();
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(body);
});

/**
 * GET /api/gis/ranges
 * Forest ranges as a GeoJSON FeatureCollection.
 *
 * The Range table carries names only (no geometry), so each range polygon is
 * derived server-side as the ST_Union of its beats' real geometries grouped by
 * Beat.rangeName — ONE authoritative derivation in SQL instead of client-side
 * convex hulls. Properties mirror the beats shape so mobile parsing keeps
 * working ('Range' carries the verbatim range name).
 */
gisRouter.get('/ranges', async (_req, res) => {
  const body = await cachedGeo('ranges', async () => {
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
          'id', 'range-' || b."rangeName",
          'geometry', ST_AsGeoJSON(ST_Union(b.geom))::json,
          'properties', json_build_object(
            'OBJECTID_1', MIN(b.id),
            'Range', b."rangeName",
            'Division', COALESCE(MIN(b.division), ''),
            'beatCount', COUNT(*)::int,
            'Area_ha', ROUND(SUM(COALESCE(b."areaHa", 0)))::int
          )
        ) AS feature
        FROM "Beat" b
        WHERE b.geom IS NOT NULL AND b."rangeName" IS NOT NULL AND b."rangeName" <> ''
        GROUP BY b."rangeName"
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
  const cached = assetCache.get('list');
  if (cached && Date.now() - cached.at < ASSET_CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(cached.body);
    return;
  }

  const assets = await prisma.mapAsset.findMany({
    orderBy: { resourceKey: 'asc' },
    select: {
      id: true,
      resourceKey: true,
      contentType: true,
      storagePath: true,
      sizeBytes: true,
      sha256: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const body = JSON.stringify(assets);
  assetCache.set('list', { at: Date.now(), body });
  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(body);
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
