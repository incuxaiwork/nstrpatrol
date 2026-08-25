import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { applyPatrolWhere, patrolVisibleTo, DIVISION_PT_MARKAPUR } from '../lib/scope';
import { runPatrolCoverageSummary } from './coverage';

export const patrolsRouter = Router();

patrolsRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Lightweight in-memory TTL cache for patrol list                     */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> { at: number; body: T }
const patrolListCache = new Map<string, CacheEntry<string>>();
const PATROL_LIST_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 10_000;

function patrolListCacheKey(userId: string, q: Record<string, unknown>): string {
  return `${userId}:${q.mine ?? ''}:${q.status ?? ''}:${q.forestId ?? ''}`;
}

/* ------------------------------------------------------------------ */
/* Geography enrichment                                                */
/* ------------------------------------------------------------------ */

/**
 * Authoritative organizational geography for a patrol, resolved through the
 * existing database relationships:
 *
 *   Patrol.beat (free text from the device)
 *     → Beat.name      → beat id + rangeName
 *     → Range.name     → Range.subDivisionId
 *     → SubDivision    → sub-division name
 *
 * Division is the deployment-wide PT Markapur division (scope.ts — this
 * backend serves a single forest/division deployment, so every patrol
 * belongs to it).
 *
 * Nothing is guessed: a beat whose text does not match a Beat row yields null
 * range/sub-division fields — never a string-similarity match. The lookup is
 * batched (one query per hierarchy level for the whole list), never one query
 * per patrol.
 */
export interface PatrolGeography {
  beatId: string | null;
  beat: string | null;
  range: string | null;
  rangeId: string | null;
  subDivision: string | null;
  subDivisionId: string | null;
  division: string | null;
}

type GeographyCore = Omit<PatrolGeography, 'beat' | 'division'>;

async function resolvePatrolGeographyIndex(
  patrols: { beat: string | null }[],
): Promise<Map<string, GeographyCore>> {
  const index = new Map<string, GeographyCore>();
  const names = [...new Set(patrols.map((p) => p.beat).filter((b): b is string => Boolean(b)))];
  if (names.length === 0) return index;

  const beats = await prisma.beat.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, rangeName: true },
  });
  const rangeNames = [...new Set(beats.map((b) => b.rangeName).filter((r): r is string => Boolean(r)))];
  const ranges = rangeNames.length
    ? await prisma.range.findMany({
        where: { name: { in: rangeNames } },
        select: { id: true, name: true, subDivisionId: true },
      })
    : [];
  const subDivisionIds = [...new Set(ranges.map((r) => r.subDivisionId).filter((s): s is string => Boolean(s)))];
  const subdivisions = subDivisionIds.length
    ? await prisma.subDivision.findMany({ where: { id: { in: subDivisionIds } }, select: { id: true, name: true } })
    : [];

  const rangeByName = new Map(ranges.map((r) => [r.name, r]));
  const subDivisionById = new Map(subdivisions.map((s) => [s.id, s]));
  for (const b of beats) {
    const range = b.rangeName ? rangeByName.get(b.rangeName) : undefined;
    const subdivision = range?.subDivisionId ? subDivisionById.get(range.subDivisionId) : undefined;
    index.set(b.name, {
      beatId: b.id,
      rangeId: range?.id ?? null,
      range: range?.name ?? null,
      subDivisionId: subdivision?.id ?? null,
      subDivision: subdivision?.name ?? null,
    });
  }
  return index;
}

function geographyFor(
  patrol: { beat: string | null },
  index: Map<string, GeographyCore>,
): PatrolGeography {
  const core = patrol.beat ? index.get(patrol.beat) : undefined;
  return {
    beat: patrol.beat ?? null,
    beatId: core?.beatId ?? null,
    range: core?.range ?? null,
    rangeId: core?.rangeId ?? null,
    subDivision: core?.subDivision ?? null,
    subDivisionId: core?.subDivisionId ?? null,
    division: DIVISION_PT_MARKAPUR,
  };
}

/**
 * Batched stats enrichment — single SQL for all patrol IDs so the list
 * carries distance/duration without N+1. PostGIS fall-back: when
 * ST_Length fails the whole query is caught and re-run without the
 * spatial column (duration still available via pure EXTRACT).
 */
async function loadPatrolStats(
  ids: string[],
): Promise<Map<string, { distanceKm: number; durationSeconds: number }>> {
  const statsMap = new Map<string, { distanceKm: number; durationSeconds: number }>();
  if (ids.length === 0) return statsMap;

  try {
    const rows = await prisma.$queryRaw<{ patrolId: string; distanceKm: number; durationSeconds: number }[]>`
      SELECT "patrolId",
        COALESCE(
          CASE WHEN COUNT(id) >= 2 THEN
            ST_Length(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
                ORDER BY timestamp
              )::geography
            ) / 1000.0
          ELSE 0 END, 0
        ) AS "distanceKm",
        COALESCE(EXTRACT(EPOCH FROM (MAX("timestamp") - MIN("timestamp"))), 0) AS "durationSeconds"
      FROM "PatrolPoint"
      WHERE "patrolId" = ANY(${ids}::text[])
      GROUP BY "patrolId"
    `;
    for (const r of rows) {
      statsMap.set(r.patrolId, {
        distanceKm: Math.round(r.distanceKm * 100) / 100,
        durationSeconds: Math.round(r.durationSeconds),
      });
    }
  } catch {
    const rows = await prisma.$queryRaw<{
      patrolId: string; distanceKm: number; durationSeconds: number;
    }[]>`
      WITH ordered AS (
        SELECT "patrolId", longitude, latitude, "timestamp",
          LAG(longitude) OVER (PARTITION BY "patrolId" ORDER BY "timestamp") AS "prevLng",
          LAG(latitude)  OVER (PARTITION BY "patrolId" ORDER BY "timestamp") AS "prevLat"
        FROM "PatrolPoint"
        WHERE "patrolId" = ANY(${ids}::text[])
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
    `;
    for (const r of rows) {
      statsMap.set(r.patrolId, {
        distanceKm: Math.round(r.distanceKm * 100) / 100,
        durationSeconds: Math.round(r.durationSeconds),
      });
    }
  }
  return statsMap;
}

const patrolCreateSchema = z.object({
  id: z.string().min(1).max(50).optional(),
  forestId: z.string().cuid().nullish(),
  name: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(500).nullish(),
  type: z.enum(['WALK', 'BICYCLE', 'VEHICLE', 'STATIONARY']),
  startedAt: z.coerce.date().nullish(),
  endedAt: z.coerce.date().nullish(),
  patrolMethod: z.string().trim().max(80).nullish(),
  beat: z.string().trim().max(160).nullish(),
  armedStatus: z.string().trim().max(80).nullish(),
  caloriesEstimate: z.number().finite().nullish(),
  heartPointsEstimate: z.number().finite().nullish(),
  avgSpeedKmh: z.number().finite().nullish(),
  detectedMethod: z.string().trim().max(80).nullish(),
  totalSteps: z.number().int().min(0).max(500_000).nullish(),
  moveMinutes: z.number().int().min(0).max(24 * 60).nullish(),
  faceVerified: z.boolean().nullish(),
  faceMatchScore: z.number().finite().min(0).max(1).nullish(),
  deviceId: z.string().trim().max(255).nullish(),
});

// Rangers start patrols on their own initiative. The creating user is the
// owner; a patrol starts ACTIVE immediately (no admin assignment step).
// `id` lets the mobile supply a stable client-generated id (offline-first);
// `forestId` is optional and resolved server-side when omitted.
patrolsRouter.post('/', validateBody(patrolCreateSchema), async (req, res) => {
  const body = req.body;
  const forestId = body.forestId ?? (await prisma.forest.findFirst())?.id;
  if (!forestId) throw new HttpError(400, 'no_forest', 'No forest is configured for this deployment');

  const patrol = await prisma.patrol.create({
    data: {
      id: body.id ?? undefined,
      userId: req.user!.id,
      forestId,
      name: body.name ?? null,
      description: body.description ?? null,
      type: body.type,
      status: 'ACTIVE',
      startedAt: body.startedAt ?? new Date(),
      endedAt: body.endedAt ?? null,
      patrolMethod: body.patrolMethod ?? null,
      beat: body.beat ?? null,
      armedStatus: body.armedStatus ?? null,
      caloriesEstimate: body.caloriesEstimate ?? null,
      heartPointsEstimate: body.heartPointsEstimate ?? null,
      avgSpeedKmh: body.avgSpeedKmh ?? null,
      detectedMethod: body.detectedMethod ?? null,
      totalSteps: body.totalSteps ?? null,
      moveMinutes: body.moveMinutes ?? null,
      faceVerified: body.faceVerified ?? false,
      faceMatchScore: body.faceMatchScore ?? null,
      deviceId: body.deviceId ?? null,
      syncStatus: 'SYNCED',
    },
  });
  patrolListCache.clear();
  res.status(201).json(patrol);
});

const patrolListQuery = z.object({
  mine: z.literal('true').optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  forestId: z.string().cuid().optional(),
});

patrolsRouter.get('/', validateQuery(patrolListQuery), async (req, res) => {
  const q = req.query as z.infer<typeof patrolListQuery>;

  // Server-side read cache: deduplicates rapid sequential polls for the same
  // list (e.g. dashboard auto-refresh every 2s). The cache is per-user+query,
  // keyed on userId + filter params; a 10s TTL is enough to eliminate bursts
  // without stale-data risk.
  const cacheKey = patrolListCacheKey(req.user!.id, q);
  const hit = patrolListCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PATROL_LIST_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(hit.body);
    return;
  }

  const base: Record<string, unknown> = {};
  if (q.forestId) base.forestId = q.forestId;
  if (q.status) base.status = q.status;
  const where = await applyPatrolWhere(req.user!, base as never, { mine: q.mine === 'true' });

  const patrols = await prisma.patrol.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      forest: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Batched geography + stats enrichment — run in parallel to avoid
  // sequential DB round-trips (geography ~3 queries, stats ~1-2 queries).
  const ids = patrols.map((p) => p.id);
  const [geoIndex, statsMap] = await Promise.all([
    resolvePatrolGeographyIndex(patrols),
    loadPatrolStats(ids),
  ]);

  const body = JSON.stringify(patrols.map((p) => {
    const s = statsMap.get(p.id);
    return {
      ...p,
      geography: geographyFor(p, geoIndex),
      stats: s ?? null,
    };
  }));

  patrolListCache.set(cacheKey, { at: Date.now(), body });
  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(body);
});

const liveQuery = z.object({
  /** Minutes of recent GPS to include per patrol path (default 15, max 120). */
  window: z.coerce.number().int().min(1).max(120).optional(),
});

/**
 * Live tracking feed — the smallest read-only addition that lets the Admin
 * Portal poll active patrols efficiently. Existing endpoints cannot do this:
 * GET / lists patrols without any GPS freshness, and GET /:id/points returns a
 * patrol's ENTIRE trace (thousands of rows), which must not be re-downloaded
 * every few seconds.
 *
 * Scope-authoritative via applyPatrolWhere (division admin → all, DyDFO/FRO →
 * their organization, field users → own patrols). Data is strictly what the
 * devices synchronized: latest stored fix + a bounded recent-path window,
 * ordered by recorded timestamp ascending. Invalid fixes — including the
 * (0,0) sentinel — are excluded server-side; nothing is synthesized here.
 */
patrolsRouter.get('/live', validateQuery(liveQuery), async (req, res) => {
  const q = req.query as z.infer<typeof liveQuery>;
  const windowMin = q.window ?? 15;

  const where = await applyPatrolWhere(req.user!, { status: 'ACTIVE' } as never, { mine: false });
  const patrols = await prisma.patrol.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      startedAt: true,
      beat: true,
      userId: true,
      user: { select: { id: true, fullName: true } },
    },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  const serverTime = new Date();
  if (patrols.length === 0) {
    res.json({ serverTime: serverTime.toISOString(), patrols: [] });
    return;
  }

  const ids = patrols.map((p) => p.id);
  // Valid fix = inside WGS-84 bounds and not the (0,0) null-island sentinel.
  const validFix = { latitude: { gte: -90, lte: 90, not: 0 }, longitude: { gte: -180, lte: 180, not: 0 } };
  const pointSelect = {
    patrolId: true,
    latitude: true,
    longitude: true,
    altitude: true,
    speed: true,
    bearing: true,
    accuracy: true,
    timestamp: true,
  } as const;

  const [latestRows, pathRows, counts] = await Promise.all([
    // Newest stored fix per patrol (DISTINCT ON equivalent).
    prisma.patrolPoint.findMany({
      where: { patrolId: { in: ids }, ...validFix },
      orderBy: [{ patrolId: 'asc' }, { timestamp: 'desc' }],
      distinct: ['patrolId'],
      select: pointSelect,
    }),
    // Bounded recent window for the live path drawing.
    prisma.patrolPoint.findMany({
      where: {
        patrolId: { in: ids },
        timestamp: { gte: new Date(serverTime.getTime() - windowMin * 60_000) },
        ...validFix,
      },
      orderBy: { timestamp: 'asc' },
      select: pointSelect,
      take: 5000,
    }),
    prisma.patrolPoint.groupBy({ by: ['patrolId'], where: { patrolId: { in: ids } }, _count: { _all: true } }),
  ]);

  // Belt-and-braces: never surface invalid fixes — including the (0,0)
  // sentinel some devices emit before their first real lock — even if such
  // rows are already stored. Keeps the map clean without rewriting history.
  const isUsable = (r: { latitude: number; longitude: number }): boolean =>
    Number.isFinite(r.latitude) &&
    Number.isFinite(r.longitude) &&
    r.latitude >= -90 && r.latitude <= 90 &&
    r.longitude >= -180 && r.longitude <= 180 &&
    !(r.latitude === 0 && r.longitude === 0);

  const latestByPatrol = new Map(latestRows.filter(isUsable).map((r) => [r.patrolId, r]));
  const countByPatrol = new Map(counts.map((c) => [c.patrolId, c._count._all]));
  const pathByPatrol = new Map<string, typeof pathRows>();
  for (const row of [...pathRows].filter(isUsable).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    const bucket = pathByPatrol.get(row.patrolId) ?? [];
    bucket.push(row);
    pathByPatrol.set(row.patrolId, bucket);
  }

  const toFix = (r: (typeof latestRows)[number]) => ({
    lat: r.latitude,
    lng: r.longitude,
    altitude: r.altitude,
    speed: r.speed,
    bearing: r.bearing,
    accuracy: r.accuracy,
    t: r.timestamp,
  });

  res.json({
    serverTime: serverTime.toISOString(),
    patrols: patrols.map((p) => {
      const latest = latestByPatrol.get(p.id);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        startedAt: p.startedAt,
        beat: p.beat,
        ranger: { id: p.user.id, fullName: p.user.fullName },
        lastPointAt: latest ? latest.timestamp : null,
        pointCount: countByPatrol.get(p.id) ?? 0,
        latestPoint: latest ? toFix(latest) : null,
        path: (pathByPatrol.get(p.id) ?? []).map(toFix),
      };
    }),
  });
});

patrolsRouter.get('/:id', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, cader: true, role: true } },
      forest: { select: { id: true, name: true, code: true } },
    },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  let pointCount = 0;
  let distanceKm = 0;
  let durationSeconds = 0;
  try {
    const stats = await prisma.$queryRaw<{ points: bigint; distanceKm: number; durationSeconds: number }[]>`
      SELECT COUNT(id)::bigint AS points,
        COALESCE(
          CASE WHEN COUNT(id) >= 2 THEN
            ST_Length(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
                ORDER BY timestamp
              )::geography
            ) / 1000.0
          ELSE 0 END, 0
        ) AS "distanceKm",
        COALESCE(
          EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0
        ) AS "durationSeconds"
      FROM "PatrolPoint"
      WHERE "patrolId" = ${id}
    `;
    pointCount = Number(stats[0]?.points ?? 0n);
    distanceKm = Math.round((stats[0]?.distanceKm ?? 0) * 100) / 100;
    durationSeconds = Math.round(stats[0]?.durationSeconds ?? 0);
  } catch {
    // PostGIS shared library unavailable (e.g. Railway missing postgis-3.so)
    // — compute distance via pure-PG Haversine and duration via EXTRACT(EPOCH).
    // RADIANS, SIN, COS, SQRT, ASIN, POWER are core PostgreSQL math
    // functions; no spatial extension needed.
    const fallback = await prisma.$queryRaw<{
      points: bigint; distanceKm: number; durationSeconds: number;
    }[]>`
      WITH ordered AS (
        SELECT longitude, latitude,
          LAG(longitude) OVER (ORDER BY "timestamp") AS "prevLng",
          LAG(latitude)  OVER (ORDER BY "timestamp") AS "prevLat"
        FROM "PatrolPoint"
        WHERE "patrolId" = ${id}
      )
      SELECT
        (SELECT COUNT(*) FROM "PatrolPoint" WHERE "patrolId" = ${id})::bigint AS points,
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
          (SELECT EXTRACT(EPOCH FROM MAX("timestamp") - MIN("timestamp"))
           FROM "PatrolPoint" WHERE "patrolId" = ${id}), 0
        ) AS "durationSeconds"
      FROM ordered
    `;
    pointCount = Number(fallback[0]?.points ?? 0n);
    distanceKm = Math.round((fallback[0]?.distanceKm ?? 0) * 100) / 100;
    durationSeconds = Math.round(fallback[0]?.durationSeconds ?? 0);
  }

  const stepsAgg = await prisma.stepReading.aggregate({
    where: { patrolId: id },
    _sum: { steps: true },
  });

  const latestSegment = await prisma.activitySegment.findFirst({
    where: { patrolId: id },
    orderBy: { endTime: 'desc' },
    select: { mode: true },
  });
  // Prefer the stored value pushed from the device; fall back to the latest
  // activity segment so old data still reports something sensible.
  const detectedMethod = patrol.detectedMethod ?? latestSegment?.mode ?? 'STILL';

  const [geoIndex] = await Promise.all([resolvePatrolGeographyIndex([patrol])]);
  // Steps: sensor readings win; otherwise the device-reported total (new
  // clients push it with create/complete). Never fabricate steps here.
  const steps = stepsAgg._sum.steps ?? patrol.totalSteps ?? 0;
  // Moving minutes: device-reported when present; else fall back to the whole
  // point-span so multi-mode (vehicle/bike) patrols are not undercounted to
  // walking-only segment sums.
  const movingMinutes = patrol.moveMinutes ?? Math.round(durationSeconds / 60);
  // Per-mode time breakdown so clients can judge what kind of patrol this was
  // even when the sensor rows stayed on another device (cloud pulls).
  // Non-fatal: an aggregation hiccup must never break the detail payload.
  let modes: { mode: string; seconds: number }[] = [];
  try {
    const rows = await prisma.$queryRaw<{ mode: string; seconds: number }[]>`
      SELECT mode, COALESCE(SUM(EXTRACT(EPOCH FROM ("endTime" - "startTime"))), 0)::int AS seconds
      FROM "ActivitySegment" WHERE "patrolId" = ${id} GROUP BY mode ORDER BY 2 DESC
    `;
    // Normalize driver output — raw aggregates must never flow unchecked.
    modes = rows.map((r) => ({ mode: String(r.mode), seconds: Number(r.seconds) }));
  } catch {
    modes = [];
  }

  res.json({
    ...patrol,
    geography: geographyFor(patrol, geoIndex),
    detectedMethod,
    stats: { points: pointCount, distanceKm, durationSeconds, steps, moveMinutes: movingMinutes, modes },
  });
});

// ---------------------------------------------------------------------
// Coverage summary for ONE patrol (ForestGrid × PostGIS — same spatial
// semantics as GET /api/coverage/grids). Registered BEFORE the route below
// so the two contracts stay clearly distinct:
//
//   GET /api/patrols/:id/coverage          → CoverageEvent[] (Android sync
//                                            feed — contract must not change)
//   GET /api/patrols/:id/coverage/summary  → this summary object
//
// Authorization mirrors GET /api/patrols/:id exactly (ownership or
// organizational scope via patrolVisibleTo).
// ---------------------------------------------------------------------
patrolsRouter.get('/:id/coverage/summary', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true, forestId: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  // The cell universe is bounded by the patrol's beat ONLY when that beat
  // text matches an actual Beat row; otherwise it falls back to the whole
  // deployment grid (the same default universe a division-wide user gets
  // from /api/coverage/grids). No fuzzy matching.
  const beatName = patrol.beat
    ? ((await prisma.beat.findFirst({ where: { name: patrol.beat }, select: { name: true } }))?.name ?? null)
    : null;

  const { totalCells, patrolledCells, pointCount, spatial } = await runPatrolCoverageSummary(
    id,
    beatName,
    patrol.forestId,
  );
  const coveragePercent = spatial === false
    ? null
    : totalCells > 0 ? Math.round((patrolledCells / totalCells) * 1000) / 10 : 0;
  res.json({ patrolId: id, totalCells, patrolledCells, coveragePercent, pointCount });
});

// Lightweight point feed for drawing a patrol's route on the report screen.
// Returns plain lat/lng/altitude/speed/timestamp so the client can render a
// track for patrols it did not record locally.
patrolsRouter.get('/:id/points', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const pts = await prisma.patrolPoint.findMany({
    where: {
      patrolId: id,
      latitude: { not: 0 },
      longitude: { not: 0 },
    },
    orderBy: { timestamp: 'asc' },
    select: {
      latitude: true,
      longitude: true,
      altitude: true,
      speed: true,
      bearing: true,
      accuracy: true,
      timestamp: true,
    },
  });
  res.json(
    pts.map((p) => ({
      lat: p.latitude,
      lng: p.longitude,
      altitude: p.altitude,
      speed: p.speed,
      bearing: p.bearing,
      accuracy: p.accuracy,
      t: p.timestamp,
    }))
  );
});

// Raw movement-mode readings for cross-device pull.
patrolsRouter.get('/:id/movement', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const readings = await prisma.movementModeReading.findMany({
    where: { patrolId: id },
    orderBy: { timestamp: 'asc' },
    select: { mode: true, confidence: true, speedKmh: true, timestamp: true },
  });
  res.json(
    readings.map((r) => ({
      mode: r.mode,
      confidence: r.confidence,
      speedKmh: r.speedKmh,
      t: r.timestamp,
    }))
  );
});

// All sensor readings for cross-device pull (accelerometer, gyroscope,
// magnetometer, barometer, step-readings) returned in one response.
patrolsRouter.get('/:id/sensors', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const [accel, gyro, mag, baro, steps] = await Promise.all([
    prisma.accelerometerReading.findMany({
      where: { patrolId: id },
      orderBy: { timestamp: 'asc' },
      select: { x: true, y: true, z: true, timestamp: true },
    }),
    prisma.gyroscopeReading.findMany({
      where: { patrolId: id },
      orderBy: { timestamp: 'asc' },
      select: { x: true, y: true, z: true, timestamp: true },
    }),
    prisma.magnetometerReading.findMany({
      where: { patrolId: id },
      orderBy: { timestamp: 'asc' },
      select: { x: true, y: true, z: true, timestamp: true },
    }),
    prisma.barometerReading.findMany({
      where: { patrolId: id },
      orderBy: { timestamp: 'asc' },
      select: { pressureHpa: true, altitudeM: true, timestamp: true },
    }),
    prisma.stepReading.findMany({
      where: { patrolId: id },
      orderBy: { timestamp: 'asc' },
      select: { steps: true, cadence: true, timestamp: true },
    }),
  ]);

  res.json({
    accelerometer: accel.map((r) => ({
      x: r.x, y: r.y, z: r.z, t: r.timestamp,
    })),
    gyroscope: gyro.map((r) => ({
      x: r.x, y: r.y, z: r.z, t: r.timestamp,
    })),
    magnetometer: mag.map((r) => ({
      x: r.x, y: r.y, z: r.z, t: r.timestamp,
    })),
    barometer: baro.map((r) => ({
      pressureHpa: r.pressureHpa, altitudeM: r.altitudeM, t: r.timestamp,
    })),
    steps: steps.map((r) => ({
      steps: r.steps, cadence: r.cadence, t: r.timestamp,
    })),
  });
});

// Incidents for cross-device pull.
patrolsRouter.get('/:id/incidents', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const incidents = await prisma.incident.findMany({
    where: { patrolId: id },
    orderBy: { reportedAt: 'asc' },
    select: {
      id: true, type: true, title: true, description: true,
      severity: true, details: true, latitude: true, longitude: true,
      accuracy: true, photos: true, occurredAt: true, reportedAt: true,
      status: true, syncStatus: true,
    },
  });
  res.json(
    incidents.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      description: i.description,
      severity: i.severity,
      details: i.details,
      latitude: i.latitude,
      longitude: i.longitude,
      accuracy: i.accuracy,
      photos: i.photos,
      occurredAt: i.occurredAt,
      reportedAt: i.reportedAt,
      status: i.status,
    }))
  );
});

// Activity segments for cross-device pull.
patrolsRouter.get('/:id/segments', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const segments = await prisma.activitySegment.findMany({
    where: { patrolId: id },
    orderBy: { startTime: 'asc' },
    select: { mode: true, startTime: true, endTime: true, confidence: true },
  });
  res.json(
    segments.map((s) => ({
      mode: s.mode,
      start: s.startTime,
      end: s.endTime,
      confidence: s.confidence,
    }))
  );
});

// Coverage events for cross-device pull.
patrolsRouter.get('/:id/coverage', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const events = await prisma.coverageEvent.findMany({
    where: { patrolId: id },
    orderBy: { timestamp: 'asc' },
    select: { type: true, latitude: true, longitude: true, timestamp: true },
  });
  res.json(
    events.map((e) => ({
      type: e.type,
      lat: e.latitude,
      lng: e.longitude,
      t: e.timestamp,
    }))
  );
});

// Time-integrity logs for cross-device pull.
patrolsRouter.get('/:id/integrity', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({
    where: { id },
    select: { id: true, userId: true, beat: true },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only view patrols within your scope');
  }

  const logs = await prisma.timeIntegrityLog.findMany({
    where: { patrolId: id },
    orderBy: { timestamp: 'asc' },
    select: {
      timestamp: true,
      gnssTimeAvailable: true,
      divergenceSeconds: true,
      autoTimeEnabled: true,
      tamperDetected: true,
      satellites: true,
    },
  });
  res.json(
    logs.map((l) => ({
      t: l.timestamp,
      gnssTimeAvailable: l.gnssTimeAvailable,
      divergenceSeconds: l.divergenceSeconds,
      autoTimeEnabled: l.autoTimeEnabled,
      tamperDetected: l.tamperDetected,
      satellites: l.satellites,
    }))
  );
});

const startSchema = z.object({ startedAt: z.coerce.date().optional() });

patrolsRouter.post('/:id/start', validateBody(startSchema), async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id }, select: { id: true, userId: true, beat: true } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only manage patrols within your scope');
  }

  const startedAt = req.body.startedAt ?? new Date();
  const updated = await prisma.patrol.update({
    where: { id },
    data: { status: 'ACTIVE', startedAt, syncStatus: 'SYNCED' },
  });
  patrolListCache.clear();
  res.status(200).json({ status: updated.status, startedAt });
});

const completeSchema = z.object({
  endedAt: z.coerce.date().optional(),
  totalSteps: z.number().int().min(0).max(500_000).nullish(),
  moveMinutes: z.number().int().min(0).max(24 * 60).nullish(),
  caloriesEstimate: z.number().finite().min(0).nullish(),
  heartPointsEstimate: z.number().finite().min(0).nullish(),
  avgSpeedKmh: z.number().finite().min(0).max(300).nullish(),
  detectedMethod: z.string().trim().max(80).nullish(),
});

patrolsRouter.post('/:id/complete', validateBody(completeSchema), async (req, res) => {
  const id = param(req, 'id');
  const body = req.body;
  const patrol = await prisma.patrol.findUnique({ where: { id }, select: { id: true, userId: true, beat: true, startedAt: true } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only manage patrols within your scope');
  }

  // Devices with broken session clocks have synced endedAt values that predate
  // their own GPS trace (one prod patrol recorded "ended" 27 min before its
  // last point). The telemetry is the source of truth: never let endedAt fall
  // before either the declared start or the last recorded point.
  const lastPoint = await prisma.$queryRaw<{ t: Date | null }[]>`
    SELECT COALESCE(MAX(timestamp), CURRENT_TIMESTAMP)::timestamptz AS t FROM "PatrolPoint" WHERE "patrolId" = ${id}
  `;
  let endedAt = req.body.endedAt ?? lastPoint[0]?.t ?? new Date();
  const startedAt = patrol.startedAt ?? endedAt;
  if (endedAt < startedAt) endedAt = lastPoint[0]?.t ?? startedAt;
  if (lastPoint[0]?.t && endedAt < lastPoint[0].t) endedAt = lastPoint[0].t;

  const updated = await prisma.patrol.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      endedAt,
      syncStatus: 'SYNCED',
      totalSteps: body.totalSteps ?? undefined,
      moveMinutes: body.moveMinutes ?? undefined,
      caloriesEstimate: body.caloriesEstimate ?? undefined,
      heartPointsEstimate: body.heartPointsEstimate ?? undefined,
      avgSpeedKmh: body.avgSpeedKmh ?? undefined,
      detectedMethod: body.detectedMethod ?? undefined,
    },
  });
  patrolListCache.clear();
  res.status(200).json({ status: updated.status, endedAt });
});