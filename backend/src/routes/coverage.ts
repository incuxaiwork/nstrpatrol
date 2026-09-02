import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import {
  getUserScope,
  userIdsInScope,
  rangeNamesInScope,
  beatNamesForRanges,
  type ScopeUser,
  type UserScope,
} from '../lib/scope';

/**
 * Grid coverage — authoritative backend derivation of Patrolled / Unpatrolled
 * ForestGrid cells from patrol activity.
 *
 * Coverage is never stored: each request intersects the patrol points a user
 * is allowed to see (same visibility semantics as the patrol list) against
 * the static ForestGrid geometry (PostGIS), scoped to the requesting user's
 * organizational geography (division / sub-division / range / beat).
 *
 *   PatrolPoint → PostGIS ST_Intersects → ForestGrid → Covered % / Bare %
 *
 * The cell universe mirrors the user's scope: division-wide users see every
 * cell, DyDFO sees cells inside their sub-division's beats, FRO their range's
 * beats, FBO/ABO their assigned beat, and field users without a fixed
 * boundary (OPERATIONAL) only the cells their own patrols actually touched.
 */

export const coverageRouter = Router();

coverageRouter.use(requireAuth);

const gridCoverageQuery = z.object({
  forestId: z.string().min(1).max(50).optional(),
  rangeId: z.string().min(1).max(50).optional(),
  beatId: z.string().min(1).max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type GridCoverageQuery = z.infer<typeof gridCoverageQuery>;

interface CoverageRequestContext {
  user: ScopeUser;
  scope: UserScope;
  forestId?: string;
  /** Beat names the cell universe is spatially restricted to (empty = all cells). */
  cellBeatNames: string[];
  /** Patrol visibility: userIds OR beat names whose patrols count. */
  visibleUserIds: string[];
  visibleBeatNames: string[];
  /** OPERATIONAL users only see cells their own patrol points touched. */
  ownOnly: boolean;
}

/** Resolve + authorize optional rangeId/beatId/forestId filters against the user's scope. */
async function resolveCoverageContext(
  user: ScopeUser,
  q: GridCoverageQuery,
): Promise<CoverageRequestContext> {
  const scope = getUserScope(user);
  const ctx: CoverageRequestContext = {
    user,
    scope,
    forestId: q.forestId,
    cellBeatNames: [],
    visibleUserIds: [],
    visibleBeatNames: [],
    ownOnly: false,
  };

  if (scope.kind === 'DIVISION') {
    if (q.rangeId) {
      const range = await prisma.range.findUnique({ where: { id: q.rangeId }, select: { name: true } });
      if (!range) throw new HttpError(404, 'not_found', 'Range not found');
      ctx.cellBeatNames = await beatNamesForRanges([range.name]);
      ctx.visibleBeatNames = ctx.cellBeatNames;
    } else if (q.beatId) {
      const beat = await prisma.beat.findUnique({ where: { id: q.beatId }, select: { name: true } });
      if (!beat) throw new HttpError(404, 'not_found', 'Beat not found');
      ctx.cellBeatNames = [beat.name];
      ctx.visibleBeatNames = [beat.name];
    }
    return ctx;
  }

  if (scope.kind === 'OPERATIONAL') {
    if (q.rangeId || q.beatId) {
      throw new HttpError(403, 'forbidden', 'Geographic filters are not available in your scope');
    }
    ctx.ownOnly = true;
    return ctx;
  }

  if (q.rangeId) {
    if (scope.kind === 'BEAT') {
      throw new HttpError(403, 'forbidden', 'Geographic filters are not available in your scope');
    }
    const range = await prisma.range.findUnique({ where: { id: q.rangeId }, select: { name: true, subDivisionId: true } });
    if (!range) throw new HttpError(404, 'not_found', 'Range not found');
    const allowed =
      scope.kind === 'SUB_DIVISION'
        ? range.subDivisionId === scope.subDivisionId
        : scope.kind === 'RANGE' && q.rangeId === scope.rangeId;
    if (!allowed) {
      throw new HttpError(403, 'forbidden', 'You can only view coverage within your scope');
    }
    ctx.cellBeatNames = await beatNamesForRanges([range.name]);
    ctx.visibleBeatNames = ctx.cellBeatNames;
    return { ...ctx, visibleUserIds: await userIdsInScope(scope) };
  }

  if (q.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: q.beatId }, select: { name: true, rangeName: true } });
    if (!beat) throw new HttpError(404, 'not_found', 'Beat not found');
    // The filter is allowed when the beat belongs to the user's geography:
    // subdivision → one of the subdivision's range names; range → own range;
    // beat → the assigned beat itself.
    const scopedRangeNames = scope.kind === 'SUB_DIVISION' ? await rangeNamesInScope(scope) : [];
    const allowed =
      scope.kind === 'SUB_DIVISION'
        ? beat.rangeName != null && scopedRangeNames.includes(beat.rangeName)
        : scope.kind === 'RANGE' && scope.rangeId
          ? (await prisma.range.findUnique({ where: { id: scope.rangeId }, select: { name: true } }))?.name === beat.rangeName
          : scope.kind === 'BEAT' && scope.beatId === q.beatId;
    if (!allowed) {
      throw new HttpError(403, 'forbidden', 'You can only view coverage within your scope');
    }
    ctx.cellBeatNames = [beat.name];
    ctx.visibleBeatNames = [beat.name];
    return { ...ctx, visibleUserIds: await userIdsInScope(scope) };
  }

  const scopeBeatNames: string[] = await scopeBeatNamesFor(scope);
  ctx.cellBeatNames = scopeBeatNames;
  ctx.visibleBeatNames = scopeBeatNames;
  ctx.visibleUserIds = await userIdsInScope(scope);
  return ctx;
}

/** Beat names inside the user's geography (sub-division / own range / own beat). */
async function scopeBeatNamesFor(scope: UserScope): Promise<string[]> {
  if (scope.kind === 'SUB_DIVISION') return beatNamesForRanges(await rangeNamesInScope(scope));
  if (scope.kind === 'RANGE' && scope.rangeId) {
    const range = await prisma.range.findUnique({ where: { id: scope.rangeId }, select: { name: true } });
    return range ? beatNamesForRanges([range.name]) : [];
  }
  if (scope.kind === 'BEAT' && scope.beatId) {
    const beat = await prisma.beat.findUnique({ where: { id: scope.beatId }, select: { name: true } });
    return beat ? [beat.name] : [];
  }
  return [];
}

interface GridCoverageRow {
  id: string;
  gridCode: string;
  forestId: string;
  forestCode: string | null;
  pointCount: number;
  lastPatrolledAt: Date | null;
  covered: boolean;
}

/**
 * PostGIS capability probe (cached per process). The coverage queries join
 * patrol points to ForestGrid geometry with native PostGIS operators; on
 * deployments without the extension / geometry columns (the non-PostGIS
 * fallback databases) those queries fail with an opaque 500. Degrade to an
 * empty result instead — same posture the GIS routes take with their bundled
 * fallback assets.
 */
let postgisCapable: boolean | null = null;

async function coverageGeomAvailable(): Promise<boolean> {
  if (postgisCapable !== null) return postgisCapable;
  try {
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = to_regclass('"ForestGrid"')::oid
          AND a.attname = 'geom'
      ) AS ok`;
    postgisCapable = rows[0]?.ok ?? false;
  } catch {
    postgisCapable = false;
  }
  return postgisCapable;
}

/** Derive per-cell patrolled/unpatrolled status in a single PostGIS pass. */
export async function runGridCoverage(ctx: CoverageRequestContext, q: GridCoverageQuery): Promise<GridCoverageRow[]> {
  if (!(await coverageGeomAvailable())) return [];
  const visibleCond: Prisma.Sql[] = [];
  if (ctx.ownOnly) {
    visibleCond.push(Prisma.sql`p."userId" = ${ctx.user.id}`);
  } else if (ctx.visibleUserIds.length > 0 || ctx.visibleBeatNames.length > 0) {
    const parts: Prisma.Sql[] = [];
    if (ctx.visibleUserIds.length > 0) parts.push(Prisma.sql`p."userId" = ANY(${ctx.visibleUserIds})`);
    if (ctx.visibleBeatNames.length > 0) parts.push(Prisma.sql`p."beat" = ANY(${ctx.visibleBeatNames})`);
    visibleCond.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }

  const cellConds: Prisma.Sql[] = [Prisma.sql`fg.geom IS NOT NULL`];
  if (ctx.forestId) cellConds.push(Prisma.sql`fg."forestId" = ${ctx.forestId}`);
  if (ctx.ownOnly || ctx.cellBeatNames.length === 0) {
    // Division-wide: every cell. OPERATIONAL: every cell, covered ones kept below.
  } else {
    cellConds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Beat" b WHERE b.name = ANY(${ctx.cellBeatNames}) AND ST_Intersects(fg.geom, b.geom))`,
    );
  }

  const pointConds: Prisma.Sql[] = [
    Prisma.sql`pp."patrolId" IN (SELECT id FROM visible)`,
    Prisma.sql`ST_Intersects(sc.geom, pp.geom)`,
  ];
  if (q.from) pointConds.push(Prisma.sql`pp."timestamp" >= ${q.from.toISOString()}::timestamp`);
  if (q.to) pointConds.push(Prisma.sql`pp."timestamp" <= ${q.to.toISOString()}::timestamp`);

  const visibleSql =
    visibleCond.length > 0 ? Prisma.sql`WHERE ${Prisma.join(visibleCond, ' AND ')}` : Prisma.empty;

  const rows = await prisma.$queryRaw<GridCoverageRow[]>`
    WITH visible AS (
      SELECT p.id FROM "Patrol" p
      ${visibleSql}
    ),
    scoped_cells AS (
      SELECT fg.id AS "cellId", fg."gridCode", fg."forestId", f."code" AS "forestCode", fg.geom
      FROM "ForestGrid" fg
      LEFT JOIN "Forest" f ON f.id = fg."forestId"
      WHERE ${Prisma.join(cellConds, ' AND ')}
    ),
    attrib AS (
      SELECT sc."cellId",
             COUNT(pp.id)::int AS "pointCount",
             MAX(pp."timestamp") AS "lastPatrolledAt"
      FROM scoped_cells sc
      LEFT JOIN "PatrolPoint" pp ON ${Prisma.join(pointConds, ' AND ')}
      GROUP BY sc."cellId"
    )
    SELECT sc."cellId" AS id, sc."gridCode", sc."forestId", sc."forestCode",
           COALESCE(a."pointCount", 0) AS "pointCount",
           a."lastPatrolledAt",
           COALESCE(a."pointCount", 0) > 0 AS covered
    FROM scoped_cells sc
    LEFT JOIN attrib a ON a."cellId" = sc."cellId"
    ORDER BY sc."gridCode"
  `;
  return rows;
}

export interface BeatCoverageRow {
  beat: string;
  rangeName: string | null;
  totalCells: number;
  patrolledCells: number;
  pointCount: number;
  lastPatrolledAt: Date | null;
}

/**
 * Per-beat coverage in a single PostGIS pass — the same cell universe and
 * point-attribution semantics as runGridCoverage, grouped by beat. A beat is
 * ZERO-PATROL when none of its ForestGrid cells received a visible patrol
 * point in the window (patrolledCells = 0), never a percentage proxy.
 * Cells intersecting several beats count under each of them.
 */
export async function runBeatCoverage(ctx: CoverageRequestContext, q: GridCoverageQuery): Promise<BeatCoverageRow[]> {
  if (!(await coverageGeomAvailable())) return [];
  const visibleCond: Prisma.Sql[] = [];
  if (ctx.ownOnly) {
    visibleCond.push(Prisma.sql`p."userId" = ${ctx.user.id}`);
  } else if (ctx.visibleUserIds.length > 0 || ctx.visibleBeatNames.length > 0) {
    const parts: Prisma.Sql[] = [];
    if (ctx.visibleUserIds.length > 0) parts.push(Prisma.sql`p."userId" = ANY(${ctx.visibleUserIds})`);
    if (ctx.visibleBeatNames.length > 0) parts.push(Prisma.sql`p."beat" = ANY(${ctx.visibleBeatNames})`);
    visibleCond.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }

  const beatConds: Prisma.Sql[] = [Prisma.sql`b.geom IS NOT NULL`];
  if (ctx.forestId) beatConds.push(Prisma.sql`b.division IS NOT NULL AND EXISTS (
    SELECT 1 FROM "ForestBoundary" fb WHERE fb."forestId" = ${ctx.forestId} AND ST_Intersects(fb.geom, b.geom)
  )`);

  const pointConds: Prisma.Sql[] = [
    Prisma.sql`pp."patrolId" IN (SELECT id FROM visible)`,
    Prisma.sql`ST_Intersects(c.geom, pp.geom)`,
  ];
  if (q.from) pointConds.push(Prisma.sql`pp."timestamp" >= ${q.from.toISOString()}::timestamp`);
  if (q.to) pointConds.push(Prisma.sql`pp."timestamp" <= ${q.to.toISOString()}::timestamp`);

  const visibleSql =
    visibleCond.length > 0 ? Prisma.sql`WHERE ${Prisma.join(visibleCond, ' AND ')}` : Prisma.empty;

  // Cell universe restriction: named beats only when scope/filter demands it
  // (empty list = division-wide → every beat with grid cells).
  const universeCond =
    ctx.cellBeatNames.length > 0
      ? Prisma.sql`AND b.name = ANY(${ctx.cellBeatNames})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<BeatCoverageRow[]>`
    WITH visible AS (
      SELECT p.id FROM "Patrol" p
      ${visibleSql}
    ),
    cells AS (
      SELECT b.name AS beat, b."rangeName" AS "rangeName", fg.id AS "cellId", fg.geom
      FROM "Beat" b
      JOIN "ForestGrid" fg ON ST_Intersects(fg.geom, b.geom)
      WHERE ${Prisma.join(beatConds, ' AND ')}
      ${universeCond}
    ),
    attrib AS (
      SELECT c."cellId",
             COUNT(pp.id)::int AS pts,
             MAX(pp."timestamp") AS last_ts
      FROM cells c
      LEFT JOIN "PatrolPoint" pp ON ${Prisma.join(pointConds, ' AND ')}
      GROUP BY c."cellId"
    )
    SELECT c.beat,
           MAX(c."rangeName") AS "rangeName",
           COUNT(DISTINCT c."cellId")::int AS "totalCells",
           COUNT(DISTINCT c."cellId") FILTER (WHERE COALESCE(a.pts, 0) > 0)::int AS "patrolledCells",
           COALESCE(SUM(COALESCE(a.pts, 0)), 0)::bigint AS "pointCount",
           MAX(a.last_ts) AS "lastPatrolledAt"
    FROM cells c
    LEFT JOIN attrib a ON a."cellId" = c."cellId"
    GROUP BY c.beat
    ORDER BY c.beat
  `;
  return rows.map((r) => ({ ...r, pointCount: Number(r.pointCount) }));
}

export interface PatrolCoverageSummary {
  totalCells: number;
  patrolledCells: number;
  pointCount: number;
  /** false when PostGIS is unavailable and spatial attribution could not run. */
  spatial?: boolean;
}/**
 * Coverage of ONE patrol over the authoritative ForestGrid — identical
 * spatial semantics to runGridCoverage (cell universe = ForestGrid ∩ Beat
 * geometry, point attribution via PostGIS ST_Intersects), restricted to the
 * given patrol's points. Never consults PatrolPoint.gridId or any analysis
 * grid; coverage is derived per request and never stored.
 *
 * When beatName is null (patrol without a resolvable beat) the cell universe
 * falls back to the full deployment grid — the same default universe a
 * division-wide user gets from GET /api/coverage/grids.
 */
export async function runPatrolCoverageSummary(
  patrolId: string,
  beatName: string | null,
  forestId: string | null,
): Promise<PatrolCoverageSummary> {
  const cellConds: Prisma.Sql[] = [Prisma.sql`fg.geom IS NOT NULL`];
  if (forestId) cellConds.push(Prisma.sql`fg."forestId" = ${forestId}`);
  if (beatName) {
    cellConds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Beat" b WHERE b.name = ${beatName} AND ST_Intersects(fg.geom, b.geom))`,
    );
  }

  try {
    const rows = await prisma.$queryRaw<{ totalCells: number; patrolledCells: number; pointCount: number }[]>`
      WITH scoped_cells AS (
        SELECT fg.id AS "cellId", fg.geom
        FROM "ForestGrid" fg
        WHERE ${Prisma.join(cellConds, ' AND ')}
      ),
      attrib AS (
        SELECT sc."cellId",
               COUNT(pp.id)::int AS "pointCount"
        FROM scoped_cells sc
        LEFT JOIN "PatrolPoint" pp
          ON pp."patrolId" = ${patrolId}
         AND ST_Intersects(sc.geom, pp.geom)
        GROUP BY sc."cellId"
      )
      SELECT COUNT(*)::int AS "totalCells",
             COUNT(*) FILTER (WHERE COALESCE(a."pointCount", 0) > 0)::int AS "patrolledCells",
             COALESCE(SUM(COALESCE(a."pointCount", 0)), 0)::bigint AS "pointCount"
      FROM attrib a
    `;
    const row = rows[0];
    return {
      totalCells: Number(row?.totalCells ?? 0),
      patrolledCells: Number(row?.patrolledCells ?? 0),
      pointCount: Number(row?.pointCount ?? 0n),
      spatial: true,
    };
  } catch {
    // PostGIS unavailable — fall back to non-spatial cell count.
    // Cannot determine which cells the patrol touched without
    // ST_Intersects, so report total cells only; coveragePercent
    // becomes null to signal the data gap honestly.
    const fallbackConds: Prisma.Sql[] = [];
    if (forestId) fallbackConds.push(Prisma.sql`fg."forestId" = ${forestId}`);

    const totalRows = await prisma.$queryRaw<{ totalCells: number }[]>`
      SELECT COUNT(*)::int AS "totalCells"
      FROM "ForestGrid" fg
      ${fallbackConds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(fallbackConds, ' AND ')}` : Prisma.sql``}
    `;
    const pointRows = await prisma.$queryRaw<{ pointCount: bigint }[]>`
      SELECT COUNT(*)::bigint AS "pointCount"
      FROM "PatrolPoint" WHERE "patrolId" = ${patrolId}
    `;
    return {
      totalCells: Number(totalRows[0]?.totalCells ?? 0),
      patrolledCells: 0,
      pointCount: Number(pointRows[0]?.pointCount ?? 0n),
      spatial: false,
    };
  }
}

/** GET /api/coverage/grids?forestId=&rangeId=&beatId=&from=&to= */
coverageRouter.get('/grids', async (req, res) => {
  // Parse here (not via the query-validation middleware): Express 5 exposes
  // req.query through a getter that re-parses the URL on every access, so a
  // middleware-time assignment never reaches the handler.
  const q = gridCoverageQuery.parse(req.query) as GridCoverageQuery;
  const ctx = await resolveCoverageContext(req.user!, q);

  let rows = await runGridCoverage(ctx, q);
  if (ctx.ownOnly) rows = rows.filter((r) => r.covered);

  const totalCells = rows.length;
  const patrolledCells = rows.filter((r) => r.covered).length;
  const unpatrolledCells = totalCells - patrolledCells;
  const pointCount = rows.reduce((sum, r) => sum + r.pointCount, 0);
  const coveragePercent = totalCells > 0 ? Math.round((patrolledCells / totalCells) * 1000) / 10 : 0;

  res.json({
    generatedAt: new Date().toISOString(),
    scope: {
      kind: ctx.scope.kind,
      subDivisionId: ctx.scope.subDivisionId ?? null,
      rangeId: ctx.scope.rangeId ?? null,
      beatId: ctx.scope.beatId ?? null,
    },
    summary: {
      totalCells,
      patrolledCells,
      unpatrolledCells,
      coveragePercent,
      pointCount,
    },
    cells: rows.map((r) => ({
      id: r.id,
      gridCode: r.gridCode,
      forestId: r.forestId,
      forestCode: r.forestCode,
      covered: r.covered,
      pointCount: r.pointCount,
      lastPatrolledAt: r.lastPatrolledAt ? r.lastPatrolledAt.toISOString() : null,
    })),
  });
});

/** GET /api/coverage/beats?rangeId=&beatId=&from=&to= */
coverageRouter.get('/beats', async (req, res) => {
  const q = gridCoverageQuery.parse(req.query) as GridCoverageQuery;
  const ctx = await resolveCoverageContext(req.user!, q);

  let rows = await runBeatCoverage(ctx, q);
  if (ctx.ownOnly) rows = rows.filter((r) => r.patrolledCells > 0);

  const totalCells = rows.reduce((sum, r) => sum + r.totalCells, 0);
  const patrolledCells = rows.reduce((sum, r) => sum + r.patrolledCells, 0);
  const zeroPatrolBeats = rows.filter((r) => r.totalCells > 0 && r.patrolledCells === 0).length;

  res.json({
    generatedAt: new Date().toISOString(),
    scope: {
      kind: ctx.scope.kind,
      subDivisionId: ctx.scope.subDivisionId ?? null,
      rangeId: ctx.scope.rangeId ?? null,
      beatId: ctx.scope.beatId ?? null,
    },
    summary: {
      beats: rows.length,
      totalCells,
      patrolledCells,
      unpatrolledCells: totalCells - patrolledCells,
      zeroPatrolBeats,
      pointCount: rows.reduce((sum, r) => sum + r.pointCount, 0),
    },
    rows: rows.map((r) => ({
      beat: r.beat,
      rangeName: r.rangeName,
      totalCells: r.totalCells,
      patrolledCells: r.patrolledCells,
      coveragePercent:
        r.totalCells > 0 ? Math.round((r.patrolledCells / r.totalCells) * 1000) / 10 : null,
      pointCount: r.pointCount,
      lastPatrolledAt: r.lastPatrolledAt ? r.lastPatrolledAt.toISOString() : null,
    })),
  });
});