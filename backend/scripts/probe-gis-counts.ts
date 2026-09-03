/* Debug probe: report the REAL served feature counts for the GIS layers —
 * raw DB rows, which path serves (PostGIS vs fallback), and the exact counts
 * the fallback joiners produce (beat resolution + compartment resolution,
 * including any dropped as unresolvable). Read-only: never writes. */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../src/db/prisma';
import { canonicalBlock } from '../src/gis/block-registry';

const ASSET_DIR = resolve(__dirname, '../../mobile/app/src/main/assets');

interface Fc { features: { geometry?: unknown; properties?: Record<string, unknown>; id?: unknown }[] }
async function loadAsset(file: string): Promise<Fc> {
  return JSON.parse(await readFile(resolve(ASSET_DIR, file), 'utf-8')) as Fc;
}

interface DbBeatRow {
  id: string; name: string; rangeName: string | null; section: string | null;
  division: string | null; circle: string | null; district: string | null;
  areaHa: number | null; compCount: number; userCount: number;
}
interface DbCompRow { id: string; compNo: string; beatId: string | null; areaHa: number | null; block: string | null }

const normName = (s: unknown): string => String(s ?? '').toUpperCase().replace(/\./g, '').replace(/\s+/g, '');

const BEAT_OVERRIDE: Record<string, string> = {
  NAGULAVARAM: 'ee7364e9-7f52-4ec5-bef2-8a9f0e704509',
  PBOMMALAPURAM: 'f5a70975-3595-49ef-9192-beedb020bd2f',
  PEDDACHAMA: 'c2f23388-b061-414b-b8b0-2b17af945ba0',
};

async function countWithGeom(table: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "${table!}" WHERE geom IS NOT NULL`;
    return Number(rows[0].n);
  } catch {
    return -1; // column "geom" absent → PostGIS unavailable
  }
}

async function loadDbComps(): Promise<any[]> {
  try {
    return await prisma.$queryRaw<any[]>`SELECT id, "compNo", "beatId", "areaHa", "block" FROM "Compartment"`;
  } catch {
    return await prisma.$queryRaw<any[]>`SELECT id, "compNo", "beatId", "areaHa", NULL::text AS "block" FROM "Compartment"`;
  }
}

async function main() {
  const [compRows, beatRows, beatsWithGeo, compsWithGeo, boundaryGeo, gridGeo] = await Promise.all([
    loadDbComps(),
    prisma.$queryRaw<DbBeatRow[]>`SELECT b.id, b.name, b."rangeName"::text, b."section"::text,
      b."division"::text, b."circle"::text, b."district"::text, b."areaHa",
      (SELECT count(*)::int FROM "Compartment" cc WHERE cc."beatId" = b.id) AS "compCount",
      (SELECT count(*)::int FROM "User" u WHERE u."beatId" = b.id) AS "userCount"
      FROM "Beat" b`,
    countWithGeom('Beat'),
    countWithGeom('Compartment'),
    countWithGeom('ForestBoundary'),
    countWithGeom('ForestGrid'),
  ]);

  console.log('── DB raw counts ─────────────────────────────────────────');
  console.log('Beat rows:', beatRows.length, '| Beat rows with geom:', beatsWithGeo);
  console.log('Compartment rows:', compRows.length, '| Compartment rows with geom:', compsWithGeo);
  console.log('ForestBoundary rows with geom:', boundaryGeo);
  console.log('ForestGrid rows with geom:', gridGeo);

  const [beatAssets, compAssets] = await Promise.all([loadAsset('mark_beat.json'), loadAsset('mark_comp.json')]);
  console.log('── assets ────────────────────────────────────────────────');
  console.log('mark_beat.json features:', beatAssets.features.length);
  console.log('mark_comp.json features:', compAssets.features.length);

  // If any compartment carries real geom, PostGIS serves instead — report it.
  console.log('── active serialization path ─────────────────────────────');
  console.log('PostGIS path serves:', compsWithGeo > 0 || beatsWithGeo > 0);

  // Replicate fallbackBeats resolution (range-aware, consumes distinct DB ids).
  const byNorm = new Map<string, DbBeatRow[]>();
  for (const b of beatRows) {
    const k = normName(b.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k)!.push(b);
  }
  const consumed = new Set<string>();
  const resolvedBeats: string[] = [];
  let beatDrop = 0;
  for (const f of beatAssets.features) {
    const key = normName(f.properties?.Beat);
    if (!key || !f.geometry) { if (f.geometry) beatDrop++; continue; }
    const avail = (byNorm.get(key) ?? []).filter((b) => !consumed.has(b.id));
    if (avail.length === 0) { beatDrop++; continue; }
    let pick: DbBeatRow | null = null;
    if (avail.length === 1) pick = avail[0];
    else {
      const rk = normName(f.properties?.Range);
      if (rk) {
        const byRange = avail.filter((b) => normName(b.rangeName) === rk);
        if (byRange.length === 1) pick = byRange[0];
      }
      if (!pick && key in BEAT_OVERRIDE && avail.some((b) => b.id === BEAT_OVERRIDE[key])) pick = avail.find((b) => b.id === BEAT_OVERRIDE[key])!;
      if (!pick) {
        const sorted = [...avail].sort((a, b) => b.compCount - a.compCount || b.userCount - a.userCount);
        if (sorted[0].compCount > sorted[1].compCount) pick = sorted[0];
      }
    }
    if (!pick) { beatDrop++; continue; }
    consumed.add(pick.id);
    resolvedBeats.push(pick.id);
  }
  console.log('── fallback join (asset → DB id) ─────────────────────────');
  console.log('resolved beat features:', resolvedBeats.length, '| dropped:', beatDrop, '| distinct DB beats used:', new Set(resolvedBeats).size);

  // Replicate fallbackCompartments resolution.
  const byKey = new Map<string, string[]>();
  for (const cc of compRows as DbCompRow[]) {
    const key = `${cc.compNo}|${cc.beatId ?? 'NULL'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(cc.id);
  }
  const compById = new Map((compRows as DbCompRow[]).map((c) => [c.id, c]));
  const used = new Set<string>();
  let dropped = 0;
  let resolvedComps = 0;
  for (const f of compAssets.features) {
    if (!f.geometry || f.properties?.COMP_NO == null) continue;
    const compNo = String(f.properties.COMP_NO);
    const beatLabel = String(f.properties.BEAT ?? '');
    let targetId: string | null = null;
    // resolveBeat (makeBeatResolver) without consuming.
    const key = normName(beatLabel);
    let cand: DbBeatRow | null = null;
    if (key) {
      const c = byNorm.get(key) ?? [];
      if (c.length === 1) cand = c[0];
      else if (c.length > 1 && key in BEAT_OVERRIDE) {
        const o = c.find((b) => b.id === BEAT_OVERRIDE[key]);
        if (o) cand = o;
      } else if (c.length > 1) {
        const sorted = [...c].sort((a, b) => b.compCount - a.compCount || b.userCount - a.userCount);
        if (sorted[0].compCount > sorted[1].compCount) cand = sorted[0];
      }
    }
    if (cand) {
      const k2 = `${compNo}|${cand.id}`;
      const candidates = (byKey.get(k2) ?? []).filter((id) => !used.has(id));
      if (candidates.length > 0) { targetId = candidates[0]; }
    } else if (beatLabel.trim() === '') {
      const orphans = (byKey.get(`${compNo}|NULL`) ?? [])
        .filter((id) => !used.has(id))
        .map((id) => compById.get(id)!)
        .filter((c) => c.areaHa != null && Math.abs(c.areaHa - Number(f.properties.AREA_HA)) < 0.25);
      if (orphans.length === 1) targetId = orphans[0].id;
    }
    if (!targetId) { dropped++; continue; }
    used.add(targetId);
    resolvedComps++;
  }
  console.log('resolved compartment features:', resolvedComps, '| dropped:', dropped, '| of', compAssets.features.length);

  // Blocks: asset grouping by canonical block.
  const byBlock = new Map<string, number>();
  for (const f of compAssets.features) {
    const blk = canonicalBlock(f.properties?.BLOCK);
    if (!blk) continue;
    byBlock.set(blk, (byBlock.get(blk) ?? 0) + 1);
  }
  console.log('block features (asset canonical BLOCK grouping):', byBlock.size, '| compartment parts across all blocks:', [...byBlock.values()].reduce((a, b) => a + b, 0));
  console.log('── DB join keys used vs asset COMP_NO? duplicated names ─')
  const dbCompNo = new Set((compRows as DbCompRow[]).map((c) => c.compNo));
  const assetCompNo = new Set<string>();
  for (const f of compAssets.features) if (f.properties?.COMP_NO != null) assetCompNo.add(String(f.properties.COMP_NO));
  console.log('DB distinct compNo:', dbCompNo.size, '| asset distinct compNo:', assetCompNo.size,
    '| asset compNos not in DB:', [...assetCompNo].filter((n) => !dbCompNo.has(n)).length);

  const dbBeatIds = new Set(beatRows.map((b) => b.id));
  const orphanComps = (compRows as DbCompRow[]).filter((c) => c.beatId != null && !dbBeatIds.has(c.beatId));
  console.log('compartment rows referencing missing beats:', orphanComps.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });