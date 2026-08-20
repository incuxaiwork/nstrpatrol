import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { applyPatrolWhere, patrolVisibleTo } from '../lib/scope';

export const patrolsRouter = Router();

patrolsRouter.use(requireAuth);

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
  res.json(patrols);
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
  const steps = stepsAgg._sum.steps ?? 0;

  const latestSegment = await prisma.activitySegment.findFirst({
    where: { patrolId: id },
    orderBy: { endTime: 'desc' },
    select: { mode: true },
  });
  // Prefer the stored value pushed from the device; fall back to the latest
  // activity segment so old data still reports something sensible.
  const detectedMethod = patrol.detectedMethod ?? latestSegment?.mode ?? 'STILL';

  res.json({
    ...patrol,
    detectedMethod,
    stats: { points: pointCount, distanceKm, durationSeconds, steps },
  });
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

const completeSchema = z.object({ endedAt: z.coerce.date().optional() });

patrolsRouter.post('/:id/complete', validateBody(completeSchema), async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id }, select: { id: true, userId: true, beat: true } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!(await patrolVisibleTo(req.user!, patrol))) {
    throw new HttpError(403, 'forbidden', 'You can only manage patrols within your scope');
  }

  const lastPoint = await prisma.$queryRaw<{ t: Date | null }[]>`
    SELECT COALESCE(MAX(timestamp), CURRENT_TIMESTAMP)::timestamptz AS t FROM "PatrolPoint" WHERE "patrolId" = ${id}
  `;
  const endedAt = req.body.endedAt ?? lastPoint[0]?.t ?? new Date();
  const updated = await prisma.patrol.update({
    where: { id },
    data: { status: 'COMPLETED', endedAt, syncStatus: 'SYNCED' },
  });
  res.status(200).json({ status: updated.status, endedAt });
});