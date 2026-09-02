import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../db/prisma';
import { param } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';
import { canonicalBlock } from '../gis/block-registry';

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

/**
 * Send a GeoJSON GIS response with cache policy that never lets an EMPTY (or
 * unparseable) collection be held for the long 24 h TTL. A stale empty layer
 * used to be browser-cached for a day and override fresh geometry returned
 * after the backend recovered (the root cause of the vanished Forest
 * Boundary). Empty responses are intentionally not cached; populated geometry
 * (which is the large, expensive and effectively static payload) may still be
 * cached for a day.
 */
function sendGeoResponse(res: import('express').Response, body: string): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', isEmptyFeatureCollection(body) ? 'no-store' : 'public, max-age=86400');
  res.send(body);
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

type BeatResolution = { id: string; how: 'unique' | 'range' | 'override' | 'heuristic' } | null;

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

/**
 * Beat-specific resolver that serves the BEAT POLYGON layer (not
 * compartments): when a normalized beat name has more than one DB row AND
 * more than one source polygon (e.g. NAGULAVARAM exists as two disjoint
 * territories — V.P.SOUTH and MARKAPUR — with two DB rows), each polygon is
 * matched to a DISTINCT DB beat so no territory is lost. Disambiguation
 * order: unique candidate → normalized range match → override → comp-count
 * heuristic. Range matching mirrors the survey: the source polygon's Range
 * equals the owning beat's rangeName, so both NAGULAVARAM polygons get real
 * geometry instead of the second being dropped as a duplicate (which left a
 * hole in the forest-boundary dissolve).
 */
function makeBeatResolverForBeats(byNorm: Map<string, DbBeatRow[]>) {
  const consumed = new Set<string>();
  return (beatName: unknown, rangeName: unknown): BeatResolution => {
    const key = normName(beatName);
    if (!key) return null;
    const avail = (byNorm.get(key) ?? []).filter((b) => !consumed.has(b.id));
    if (avail.length === 0) return null;
    if (avail.length === 1) {
      consumed.add(avail[0].id);
      return { id: avail[0].id, how: 'unique' };
    }
    const rk = normName(rangeName);
    if (rk) {
      const byRange = avail.filter((b) => normName(b.rangeName) === rk);
      if (byRange.length === 1) {
        consumed.add(byRange[0].id);
        return { id: byRange[0].id, how: 'range' };
      }
    }
    if (key in BEAT_OVERRIDE) {
      const id = BEAT_OVERRIDE[key];
      if (avail.some((b) => b.id === id)) {
        consumed.add(id);
        return { id, how: 'override' };
      }
    }
    const sorted = [...avail].sort((a, b) => b.compCount - a.compCount || b.userCount - a.userCount);
    if (sorted[0].compCount > sorted[1].compCount) {
      consumed.add(sorted[0].id);
      return { id: sorted[0].id, how: 'heuristic' };
    }
    return null; // tied — never guess
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
  // Range-aware resolver: a beat name that owns several disjoint territories
  // (NAGULAVARAM) maps EACH source polygon to a distinct DB beat. Shares the
  // same deadline/owner semantics for unique and duplicate-but-orphaned names.
  const resolveBeat = makeBeatResolverForBeats(byNorm);

  const features: GeoFeature[] = [];
  for (const f of beatsFC.features) {
    if (!f.geometry || !f.properties['Beat']) continue;
    const resolved = resolveBeat(f.properties['Beat'], f.properties['Range']);
    if (!resolved) continue;
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

interface DbCompRow { id: string; compNo: string; beatId: string | null; areaHa: number | null; block: string | null; }

/** Compartment rows for the compartment fallback. The `block` (Facing)
 *  column is optional — a database that has not run the compartment_block
 *  migration lacks it, and the whole fallback must not die on a schema-drift
 *  deployment (the compartments layer would go empty). When the column is
 *  absent, `block` stays null and the asset's canonical BLOCK is served. */
async function loadFallbackCompartments(): Promise<DbCompRow[]> {
  try {
    return await prisma.$queryRaw<DbCompRow[]>`
      SELECT id, "compNo", "beatId", "areaHa", "block" FROM "Compartment"
    `;
  } catch {
    return await prisma.$queryRaw<DbCompRow[]>`
      SELECT id, "compNo", "beatId", "areaHa", NULL::text AS "block" FROM "Compartment"
    `;
  }
}

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
    loadFallbackCompartments(),
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

  const compById = new Map(dbComps.map((c) => [c.id, c]));

  const features: GeoFeature[] = [];
  const used = new Set<string>();
  let dropped = 0;
  for (const f of compsFC.features) {
    if (!f.geometry || f.properties['COMP_NO'] == null) continue;
    const compNo = String(f.properties['COMP_NO']);
    const beatLabel = String(f.properties['BEAT'] ?? '');
    const resolved = resolveBeat(beatLabel);
    let targetId: string | null = null;
    let beatRow: DbBeatRow | null = null;

    if (resolved) {
      // Normal join key: compNo|beatId, first unused candidate wins.
      const key = `${compNo}|${resolved.id}`;
      const candidates = (byKey.get(key) ?? []).filter((id) => !used.has(id));
      if (candidates.length > 0) {
        targetId = candidates[0];
        beatRow = dbBeats.find((x) => x.id === resolved.id) ?? null;
      }
    } else if (beatLabel.trim() === '') {
      // Compartment with NO beat watermark at all (never assigned/imported,
      // e.g. the enclosure object OBJECTID_1=850, COMP_NO="0",
      // AREA_HA="155.26"). Match the unmatched DB Compartment (beatId IS
      // NULL) uniquely on COMP_NO + AREA_HA — never guessed when tied or
      // when the AREA_HA figure is missing.
      const orphans = (byKey.get(`${compNo}|NULL`) ?? [])
        .filter((id) => !used.has(id))
        .map((id) => compById.get(id)!)
        .filter((c) => c.areaHa != null && Math.abs(c.areaHa - Number(f.properties['AREA_HA'])) < 0.25);
      if (orphans.length === 1) targetId = orphans[0].id;
    }

    if (!targetId) {
      dropped++;
      continue;
    }
    used.add(targetId);
    const comp = compById.get(targetId)!;
    // Facing attribute: the DB block when imported/restored, else the
    // canonical name of the marker's own BLOCK property (asset authority).
    const block = comp.block ?? canonicalBlock(f.properties['BLOCK']);
    features.push({
      type: 'Feature',
      id: comp.id,
      geometry: f.geometry,
      // Same property set as the mobile mark_comp.json asset: hierarchy
      // fields come from the owning Beat, BLOCK from the Facing attribute.
      properties: {
        OBJECTID_1: comp.id,
        COMP_NO: comp.compNo,
        BEAT: beatRow ? (beatNameById.get(comp.beatId ?? '') ?? '') : '',
        BLOCK: block,
        SECTION: beatRow?.section ?? '',
        RANGE: beatRow?.rangeName ?? '',
        DIVISION: beatRow?.division ?? '',
        CIRCLE: beatRow?.circle ?? '',
        DISTRICT: beatRow?.district ?? '',
        AREA_HA: comp.areaHa ?? 0,
      },
    });
  }

  if (dropped > 0) {
    console.warn(
      `[gis] compartments fallback dropped ${dropped}/${compsFC.features.length} ` +
        `asset feature(s): no unambiguous DB join (orphan/empty-beat tie, or beat ` +
        `name not found). Serving the remaining features — nothing silent.`,
    );
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
  sendGeoResponse(res, body);
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
              -- mobile mark_comp.json property set; hierarchy fields layered
              -- in from the owning Beat, BLOCK from the Facing attribute.
              'BLOCK', COALESCE(c."block", ''),
              'SECTION', COALESCE(b.section, ''),
              'RANGE', COALESCE(b."rangeName", ''),
              'DIVISION', COALESCE(b.division, ''),
              'CIRCLE', COALESCE(b.circle, ''),
              'DISTRICT', COALESCE(b.district, ''),
              'AREA_HA', COALESCE(c."areaHa", 0)
            )
          ) AS feature
          FROM "Compartment" c
          LEFT JOIN "Beat" b ON b.id = c."beatId"
          WHERE c.geom IS NOT NULL
        ) t
      `;
      geojson = rows[0]?.geojson ?? null;
    } catch (err: any) {
      // PostGIS unavailable → bundled asset geometry is the authoritative
      // path, but never silently: the ops log must make clear the DB rows
      // with geometry are NOT being served.
      console.warn(
        '[gis] compartments: PostGIS unavailable (falling back to bundled mark_comp.json geometry, read-only).',
        err?.message ?? err,
      );
      geojson = null;
    }
    if (geojson != null && !isEmptyFeatureCollection(geojson)) return geojson;
    return fallbackCompartments();
  });
  sendGeoResponse(res, body);
});

/** One outer ring from a Polygon/MultiPolygon feature ([lng,lat][] pairs). */
function outerRingsOf(feature: GeoFeature): number[][][] {
  const g = feature.geometry as { type?: string; coordinates?: unknown } | null | undefined;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return [];
  const polys: unknown[] = g.type === 'Polygon' ? [g.coordinates] : (g.coordinates as unknown[]);
  return polys.flatMap((poly) => {
    const outer = Array.isArray(poly) ? poly[0] : poly;
    return Array.isArray(outer) ? [outer as number[][]] : [];
  });
}

/**
 * GET /api/gis/blocks
 * Forest blocks as a GeoJSON FeatureCollection — the Facing dissolve: every
 * compartment whose canonical BLOCK attribute matches is merged into its
 * block. PostGIS path uses ST_Union (ST_MakeValid-safe, one MultiPolygon per
 * block); when PostGIS is unavailable the bundled asset geometry is grouped
 * by the same canonical block (one part per compartment outer ring — the
 * frontend edge-dissolves those rings into the clean outline, mirroring the
 * ST_Union result). Compartments without a block attribute are excluded.
 */
gisRouter.get('/blocks', async (_req, res) => {
  const body = await cachedGeo('blocks', async () => {
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
            'id', 'block-' || c."block",
            'geometry', ST_AsGeoJSON(ST_Union(ST_CollectionExtract(ST_MakeValid(c.geom), 3)))::json,
            'properties', json_build_object(
              'BLOCK', c."block",
              'COMPARTMENT_COUNT', COUNT(*)::int,
              'AREA_HA', ROUND(SUM(COALESCE(c."areaHa", 0)))::int
            )
          ) AS feature
          FROM "Compartment" c
          WHERE c.geom IS NOT NULL AND c."block" IS NOT NULL AND c."block" <> ''
          GROUP BY c."block"
        ) t
      `;
      geojson = rows[0]?.geojson ?? null;
    } catch {
      geojson = null; // PostGIS unavailable — fall back to bundled assets below.
    }
    if (geojson != null && !isEmptyFeatureCollection(geojson)) return geojson;

    const compsFC = await loadAssetGeoJson('mark_comp.json');
    const byBlock = new Map<string, { rings: number[][][]; count: number; areaHa: number }>();
    for (const f of compsFC.features) {
      if (!f.geometry || f.properties['COMP_NO'] == null) continue;
      const block = canonicalBlock(f.properties['BLOCK']);
      if (!block) continue;
      const entry = byBlock.get(block) ?? { rings: [], count: 0, areaHa: 0 };
      entry.rings.push(...outerRingsOf(f));
      entry.count += 1;
      entry.areaHa += Number(f.properties['AREA_HA']) || 0;
      byBlock.set(block, entry);
    }
    const features: GeoFeature[] = [...byBlock.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([block, entry]) => ({
        type: 'Feature',
        id: `block-${block}`,
        // Valid MultiPolygon coordinates: every compartment outer ring is one
        // polygon part (array-of-arrays). The flat `rings` array would be
        // read as a single degenerate polygon and dissolve to nothing.
        geometry: {
          type: 'MultiPolygon',
          coordinates: entry.rings
            .filter((ring) => ring.length >= 4)
            .map((ring) => [ring]),
        },
        properties: {
          BLOCK: block,
          COMPARTMENT_COUNT: entry.count,
          AREA_HA: Math.round(entry.areaHa),
        },
      }));
    return JSON.stringify({ type: 'FeatureCollection', features });
  });
  sendGeoResponse(res, body);
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
  sendGeoResponse(res, body);
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
      SELECT COUNT(*)::int AS cnt, MAX("createdAt") AS "maxUpdated" FROM "Compartment"
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
  sendGeoResponse(res, body);
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
  sendGeoResponse(res, body);
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


/** Load the bundled beat GeoJSON (mark_beat.json) for point-in-polygon checks.
 *  Resolved through the same probed asset dir as the GIS fallback serializers
 *  (single asset authority — never a cwd-dependent copy). */
let _beatFeatures: any[] = [];
let _beatFeaturesLoaded = false;
async function loadBeatFeatures(): Promise<any[]> {
  if (_beatFeaturesLoaded) return _beatFeatures;
  _beatFeaturesLoaded = true;
  try {
    const dir = await findAssetDir();
    const raw = await readFile(resolve(dir, 'mark_beat.json'), 'utf-8');
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
gisRouter.post('/validate-location', requireAuth, validateBody(validateLocationSchema), async (req, res) => {
  const { lat, lng, beatName, sectionName, rangeName } = req.body;
  const features = await loadBeatFeatures();

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
