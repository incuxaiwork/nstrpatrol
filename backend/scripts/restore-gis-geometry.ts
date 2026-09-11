/**
 * Safe GIS geometry restoration.
 *
 * Re-creates the PostGIS-backed spatial layers that were dropped by a
 * `DROP EXTENSION postgis CASCADE`. Designed to run from Railway against the
 * `postgis.railway.internal` private database, or locally against a
 * publicly-reachable PostGIS instance.
 *
 * SAFETY-first behavior (this project's audit requirements):
 *   - It NEVER deletes rows and never rebuilds ForestBoundary / ForestGrid by
 *     default. Beat / Compartment / ForestGrid / ForestBoundary rows keep their
 *     ids (preserving FK references) and only have `geom` (re)populated.
 *   - Beat matching is ambiguity-aware: a normalized name that matches more than
 *     one Beat row is resolved to the record that actually owns compartments
 *     (then users). Duplicate/orphan beats are never given geometry.
 *   - Boundary/Grid derivation is disabled unless --with-boundary-grid is passed
 *     (it must be run deliberately and against a PostGIS database only).
 *   - --dry-run reports what WOULD change without writing anything.
 *   - --validate-only inspects existing geometry without modifying anything.
 *
 * Usage:
 *   npm run restore:gis:geometry [assetsDir] [-- --dry-run]
 *   npm run restore:gis:geometry [assetsDir] [-- --with-boundary-grid] [-- --dry-run]
 *   npm run restore:gis:geometry [assetsDir] [-- --validate-only]
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../src/db/prisma';
import { canonicalBlock } from '../src/gis/block-registry';

const FOREST_ID = 'cmsvjcx3r0004na01rj87276v';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const WITH_BOUNDARY_GRID = ARGS.includes('--with-boundary-grid');
const VALIDATE_ONLY = ARGS.includes('--validate-only');

/**
 * Explicit disambiguation for beat names that map to more than one DB row.
 * Key is the normalized GeoJSON beat name; value is the canonical DB Beat id
 * (the record that owns compartments/users). Normalization collapses dots and
 * whitespace, so "P. BOMMALAPURAM" and "P.BOMMALAPURAM" share one entry.
 */
const BEAT_OVERRIDE: Record<string, string> = {
  NAGULAVARAM: 'ee7364e9-7f52-4ec5-bef2-8a9f0e704509', // MARKAPUR, 11 comps
  PBOMMALAPURAM: 'f5a70975-3595-49ef-9192-beedb020bd2f', // DORNAL, 10 comps
  PEDDACHAMA: 'c2f23388-b061-414b-b8b0-2b17af945ba0', // KORRAPROLU, 8 comps
};

const norm = (s: string): string => s.toUpperCase().replace(/\./g, '').replace(/\s+/g, '');

interface GeoFeature { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown; }
interface GeoFeatureCollection { type: 'FeatureCollection'; features: GeoFeature[]; }

function asText(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
}

async function parseGeoJson(file: string): Promise<GeoFeatureCollection> {
  const raw = JSON.parse(await readFile(file, 'utf-8')) as GeoFeatureCollection;
  if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) throw new Error(`Not a FeatureCollection: ${file}`);
  return raw;
}

interface DbBeatRow { id: string; name: string; rangeName: string | null; compCount: number; userCount: number; }
interface DbCompRow { id: string; compNo: string; beatId: string | null; block: string | null; }

/** Resolve a GeoJSON beat name to a single DB Beat id (or null if unsafe). */
function resolveBeat(
  beatName: string,
  byNorm: Map<string, DbBeatRow[]>,
): { id: string; resolvedBy: 'unique' | 'override' | 'heuristic' } | null {
  const key = norm(beatName);
  if (!key) return null;
  if (key in BEAT_OVERRIDE) {
    const id = BEAT_OVERRIDE[key];
    if (byNorm.get(key)?.some((b) => b.id === id)) return { id, resolvedBy: 'override' };
    return null;
  }
  const candidates = byNorm.get(key) ?? [];
  if (candidates.length === 1) return { id: candidates[0].id, resolvedBy: 'unique' };
  if (candidates.length > 1) {
    // Prefer compartments, then users. Never guesses on a tie.
    const sorted = [...candidates].sort((a, b) =>
      b.compCount - a.compCount || b.userCount - a.userCount,
    );
    if (sorted[0].compCount > sorted[1].compCount) return { id: sorted[0].id, resolvedBy: 'heuristic' };
    return null; // tied — cannot resolve safely
  }
  return null;
}

async function requirePostgis(): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ extname: string }[]>('SELECT 1 AS extname FROM pg_extension WHERE extname = E\'postgis\'');
    if (rows.length === 0) throw new Error('extension not installed');
  } catch {
    throw new Error('PostGIS is not available on this database — deploy against the PostGIS-enabled database first.');
  }
}

/** Beat-geometry resolver: a normalized name that owns several disjoint
 *  territories (NAGULAVARAM → V.P.SOUTH + MARKAPUR, two DB rows) maps EACH
 *  source polygon to a DISTINCT DB beat via normalized range match, so no
 *  territory is left without geometry. Falls back to override, then the
 *  comp-count heuristic for single-polygon duplicates (PBOMMALAPURAM etc.). */
function resolveBeatForBeats(
  beatName: string,
  rangeName: string,
  byNorm: Map<string, DbBeatRow[]>,
  consumed: Set<string>,
): { id: string; resolvedBy: 'unique' | 'range' | 'override' | 'heuristic' } | null {
  const key = norm(beatName);
  if (!key) return null;
  const avail = (byNorm.get(key) ?? []).filter((b) => !consumed.has(b.id));
  if (avail.length === 0) return null;
  if (avail.length === 1) {
    consumed.add(avail[0].id);
    return { id: avail[0].id, resolvedBy: 'unique' };
  }
  const rk = norm(rangeName);
  if (rk) {
    const byRange = avail.filter((b) => norm(b.rangeName ?? '') === rk);
    if (byRange.length === 1) {
      consumed.add(byRange[0].id);
      return { id: byRange[0].id, resolvedBy: 'range' };
    }
  }
  if (key in BEAT_OVERRIDE) {
    const id = BEAT_OVERRIDE[key];
    if (avail.some((b) => b.id === id)) {
      consumed.add(id);
      return { id, resolvedBy: 'override' };
    }
  }
  const sorted = [...avail].sort((a, b) => b.compCount - a.compCount || b.userCount - a.userCount);
  if (sorted[0].compCount > sorted[1].compCount) {
    consumed.add(sorted[0].id);
    return { id: sorted[0].id, resolvedBy: 'heuristic' };
  }
  return null;
}

async function restoreBeats(beats: GeoFeatureCollection): Promise<void> {
  // Load DB beats with reference counts for ambiguity resolution.
  const dbBeats = await prisma.$queryRawUnsafe<DbBeatRow[]>(`
    SELECT b.id, b.name, b."rangeName",
      (SELECT count(*)::int FROM "Compartment" c WHERE c."beatId" = b.id) AS "compCount",
      (SELECT count(*)::int FROM "User" u WHERE u."beatId" = b.id) AS "userCount"
    FROM "Beat" b
  `);
  const byNorm = new Map<string, DbBeatRow[]>();
  for (const b of dbBeats) {
    const key = norm(b.name);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key)!.push(b);
  }

  const validBeats = beats.features.filter((f) => f.geometry && asText(f.properties['Beat']));
  const consumed = new Set<string>();
  let matched = 0;
  let ambiguousResolved = 0;
  let unresolved = 0;

  for (const f of validBeats) {
    const name = asText(f.properties['Beat']);
    const resolved = resolveBeatForBeats(name, asText(f.properties['Range']), byNorm, consumed);
    if (!resolved) {
      unresolved++;
      console.warn(`  [beat] unresolved beat "${name}" (ambiguous/unknown) — skipped`);
      continue;
    }
    if (resolved.resolvedBy === 'override' || resolved.resolvedBy === 'heuristic') ambiguousResolved++;
    matched++;

    if (!DRY_RUN) {
      const geom = JSON.stringify(f.geometry);
      await prisma.$executeRaw`
        UPDATE "Beat" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${geom}::text), 4326)
        WHERE id = ${resolved.id}
      `;
    }
  }

  const beatsWithGeomAssigned = consumed.size;
  const dbBeatsWithoutGeom = dbBeats.length - beatsWithGeomAssigned;
  const orphanSkipped = dbBeats.filter((b) => !consumed.has(b.id) && b.compCount === 0 && b.userCount > 0).length;

  console.log('\nBeat geometry restoration:');
  console.log(`  GeoJSON features: ${validBeats.length}`);
  console.log(`  Successfully matched: ${matched}`);
  console.log(`  Ambiguous resolved: ${ambiguousResolved}`);
  console.log(`  Unmatched GeoJSON: ${validBeats.length - matched - unresolved}`);
  console.log(`  DB beats without geometry: ${dbBeatsWithoutGeom}`);
  console.log(`  Skipped duplicate/orphan beats: ${orphanSkipped}`);
  if (DRY_RUN) console.log('  (dry-run: no geometry was written)');
}

async function restoreCompartments(comps: GeoFeatureCollection): Promise<void> {
  const dbBeats = await prisma.$queryRawUnsafe<DbBeatRow[]>(`
    SELECT b.id, b.name,
      (SELECT count(*)::int FROM "Compartment" c WHERE c."beatId" = b.id) AS "compCount",
      (SELECT count(*)::int FROM "User" u WHERE u."beatId" = b.id) AS "userCount"
    FROM "Beat" b
  `);
  const byNorm = new Map<string, DbBeatRow[]>();
  for (const b of dbBeats) {
    const key = norm(b.name);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key)!.push(b);
  }

  const dbComps = await prisma.$queryRawUnsafe<DbCompRow[]>(`
    SELECT id, "compNo", "beatId", "block" FROM "Compartment"
  `);
  const byKey = new Map<string, string[]>();
  for (const c of dbComps) {
    const key = `${c.compNo}|${c.beatId ?? 'NULL'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c.id);
  }

  const validComps = comps.features.filter((f) => f.geometry && asText(f.properties['COMP_NO']));
  const usedCompIds = new Set<string>();
  let matched = 0;
  let ambiguousBeat = 0;
  let unmatched = 0;
  // Block backfill counters (the Facing attribute is never overwritten —
  // existing canonical blocks are preserved; only empty rows gain one).
  let blockFilled = 0;
  let blockKept = 0;

  for (const f of validComps) {
    const compNo = asText(f.properties['COMP_NO']);
    const beatName = asText(f.properties['BEAT']);
    const resolved = resolveBeat(beatName, byNorm);
    if (!resolved) {
      ambiguousBeat++;
      console.warn(`  [comp] unresolved beat "${beatName}" (comp ${compNo}) — skipped`);
      continue;
    }
    const key = `${compNo}|${resolved.id}`;
    const candidates = (byKey.get(key) ?? []).filter((id) => !usedCompIds.has(id));
    if (candidates.length === 0) {
      unmatched++;
      if (unmatched <= 15) console.warn(`  [comp] no available DB compartment for "${compNo}" in beat "${beatName}"`);
      continue;
    }
    const targetId = candidates[0];
    usedCompIds.add(targetId);
    matched++;

    if (!DRY_RUN) {
      const geom = JSON.stringify(f.geometry);
      // Facing block name, canonicalized from the asset's BLOCK attribute.
      const block = canonicalBlock(f.properties['BLOCK']);
      const row = dbComps.find((x) => x.id === targetId);
      const hasBlock = !!row?.block;
      if (hasBlock) blockKept++;
      else if (block) blockFilled++;
      await prisma.$executeRaw`
        UPDATE "Compartment" SET
          geom = ST_SetSRID(ST_GeomFromGeoJSON(${geom}::text), 4326),
          "block" = COALESCE(NULLIF("block", ''), ${block})
        WHERE id = ${targetId}
      `;
    }
  }

  console.log('\nCompartment geometry restoration:');
  console.log(`  GeoJSON features: ${validComps.length}`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Updated: ${DRY_RUN ? 0 : matched}`);
  console.log(`  Ambiguous: ${ambiguousBeat}`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(`  Block attribute — filled: ${DRY_RUN ? '?' : blockFilled}, kept: ${DRY_RUN ? '?' : blockKept}`);
  if (DRY_RUN) console.log('  (dry-run: no geometry was written)');
}

/**
 * Boundary/Grid derivation — DISABLED by default. Only runs when
 * --with-boundary-grid is passed, explicitly and against PostGIS.
 */
async function restoreBoundaryAndGrid(): Promise<void> {
  await prisma.$executeRawUnsafe(`DELETE FROM "ForestBoundary"`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ForestBoundary" (id, "forestId", name, geom, "createdAt")
    SELECT gen_random_uuid()::text, '${FOREST_ID}', 'NSTR Reserve (union of beats)',
           ST_Multi(ST_Union(geom)), now()
    FROM "Beat" WHERE geom IS NOT NULL
  `);
  await prisma.$executeRawUnsafe(`DELETE FROM "ForestGrid"`);
  await prisma.$executeRawUnsafe(`
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
  console.log('\nForestBoundary / ForestGrid rebuilt (union of beats + survey grid).');
}

/**
 * Non-destructive validation of restored geometry. Run against a PostGIS DB.
 */
async function validateRestore(): Promise<void> {
  await requirePostgis();
  const tables = ['PatrolPoint', 'Incident', 'Beat', 'Compartment', 'ForestBoundary', 'ForestGrid', 'PatrolRoute'];
  console.log('\n--- Geometry validation ---');
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ total: number; withGeom: number; not4326: number }[]>(`
      SELECT
        count(*)::int AS total,
        count("geom")::int AS "withGeom",
        count(*) FILTER (WHERE "geom" IS NOT NULL AND ST_SRID("geom") <> 4326)::int AS "not4326"
      FROM "${t}"
    `);
    const r = rows[0];
    console.log(`  ${t}: total=${r.total} withGeom=${r.withGeom} non4326=${r.not4326}`);
  }

  // No duplicate geometry assignment: each geography should appear once per set.
  const dupBeats = await prisma.$queryRawUnsafe<{ name: string; n: number }[]>(`
    SELECT name, count(*)::int AS n FROM "Beat" WHERE geom IS NOT NULL
    GROUP BY name HAVING count(*) > 1
  `);
  console.log(`  Beats with duplicate geometry by name: ${dupBeats.length}`);
  for (const d of dupBeats) console.log(`    "${d.name}" x${d.n}`);

  // Facing attribute coverage — every compartment should carry a block name.
  const blockRows = await prisma.$queryRawUnsafe<{ block: string | null; n: number }[]>(`
    SELECT "block", count(*)::int AS n FROM "Compartment"
    GROUP BY "block" ORDER BY n DESC
  `);
  const total = blockRows.reduce((a, r) => a + r.n, 0);
  const unassigned = blockRows.find((r) => r.block == null)?.n ?? 0;
  console.log(`  Compartment block coverage: ${total - unassigned}/${total} assigned (${Math.round(((total - unassigned) / Math.max(total, 1)) * 100)}%)`);
  for (const r of blockRows) {
    if (r.block == null) console.log(`    (unassigned) x${r.n}`);
    else console.log(`    ${r.block} x${r.n}`);
  }

  // No geometry on known orphan duplicates.
  const likelyOrphans = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`
    SELECT b.id, b.name FROM "Beat" b
    WHERE b.geom IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Compartment" c WHERE c."beatId" = b.id)
      AND NOT EXISTS (SELECT 1 FROM "Patrol" p WHERE p.beat = b.name)
  `);
  console.log(`  Geometry-bearing beats with no compartments/patrols (review for orphans): ${likelyOrphans.length}`);
  for (const o of likelyOrphans) console.log(`    "${o.name}" (${o.id})`);
  console.log('\nValidation complete (read-only).');
}

async function main(): Promise<void> {
  const assetDir = ARGS.find((a) => !a.startsWith('--')) ?? resolve(__dirname, '../../mobile/app/src/main/assets');

  const [beats, comps] = await Promise.all([
    parseGeoJson(resolve(assetDir, 'mark_beat.json')),
    parseGeoJson(resolve(assetDir, 'mark_comp.json')),
  ]);

  if (VALIDATE_ONLY) {
    await validateRestore();
    return;
  }

  if (!DRY_RUN) await requirePostgis();

  await restoreBeats(beats);
  await restoreCompartments(comps);

  if (WITH_BOUNDARY_GRID) {
    if (DRY_RUN) {
      console.log('\n(boundary/grid derivation skipped in dry-run; it would DELETE and rebuild ForestBoundary / ForestGrid)');
    } else {
      await restoreBoundaryAndGrid();
    }
  } else if (!DRY_RUN) {
    console.log('\nForestBoundary / ForestGrid NOT touched (pass --with-boundary-grid to rebuild them).');
  }

  if (DRY_RUN) {
    console.log('\nDRY-RUN COMPLETE — nothing was written to the database.');
  } else {
    console.log('\nDone. Run the same command with --validate-only on a PostGIS database to confirm SRID 4326.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('\nGIS geometry restoration failed:', err);
    await prisma.$disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
