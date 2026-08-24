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
      syncStatus: 'SYNCED',
    },
  });
  res.status(201).json(patrol);
});

const patrolListQuery = z.object({
  mine: z.literal('true').optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  forestId: z.string().cuid().optional(),
});

patrolsRouter.get('/', validateQuery(patrolListQuery), async (req, res) => {
  const q = req.query as z.infer<typeof patrolListQuery>;
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

  // Batched geography enrichment (≤1 query per hierarchy level for the list).
  const geoIndex = await resolvePatrolGeographyIndex(patrols);
  res.json(patrols.map((p) => ({ ...p, geography: geographyFor(p, geoIndex) })));
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
    // PostGIS may not be available — fall back to simple count
    pointCount = await prisma.patrolPoint.count({ where: { patrolId: id } });
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
    modes = await prisma.$queryRaw<{ mode: string; seconds: number }[]>`
      SELECT mode, COALESCE(SUM(EXTRACT(EPOCH FROM ("endTime" - "startTime"))), 0)::int AS seconds
      FROM "ActivitySegment" WHERE "patrolId" = ${id} GROUP BY mode ORDER BY 2 DESC
    `;
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

  const { totalCells, patrolledCells, pointCount } = await runPatrolCoverageSummary(
    id,
    beatName,
    patrol.forestId,
  );
  const coveragePercent = totalCells > 0 ? Math.round((patrolledCells / totalCells) * 1000) / 10 : 0;
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
    where: { patrolId: id },
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
  res.status(200).json({ status: updated.status, endedAt });
});