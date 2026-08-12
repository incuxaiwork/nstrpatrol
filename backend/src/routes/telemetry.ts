import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { param } from '../lib/http';
import { HttpError } from '../middleware/error';

export const telemetryRouter = Router();

telemetryRouter.use(requireAuth);

const isAdmin = (req: { user?: { role: string; isAdmin: boolean } }) =>
  req.user!.role === 'ADMIN' || req.user!.isAdmin;

async function authorizePatrols(
  user: { id: string; role: string; isAdmin: boolean },
  records: { patrolId: string }[],
): Promise<void> {
  const unique = [...new Set(records.map((r) => r.patrolId))];
  if (unique.length === 0) throw new HttpError(400, 'validation_error', 'No records provided');
  const patrols = await prisma.patrol.findMany({
    where: { id: { in: unique } },
    select: { id: true, userId: true },
  });
  const found = new Set(patrols.map((p) => p.id));
  for (const id of unique) {
    if (!found.has(id)) throw new HttpError(404, 'not_found', `Patrol ${id} does not exist`);
  }
  if (!user.isAdmin) {
    for (const p of patrols) {
      if (p.userId !== user.id) {
        throw new HttpError(403, 'forbidden', 'You can only upload telemetry for your own patrols');
      }
    }
  }
}

const MAX_BATCH = 2000;
const dateTime = z.coerce.date();
const ts = z.object({ patrolId: z.string().cuid(), timestamp: dateTime });
const axis = { x: z.number().finite().nullish(), y: z.number().finite().nullish(), z: z.number().finite().nullish() };

const schemas = {
  'points': z.array(
    ts.extend({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      altitude: z.number().finite().nullish(),
      speed: z.number().finite().nonnegative().nullish(),
      bearing: z.number().finite().min(0).max(360).nullish(),
      accuracy: z.number().finite().nonnegative().nullish(),
      gridId: z.string().cuid().nullish(),
    }),
  ),
  'step-readings': z.array(
    ts.extend({
      steps: z.number().int().nonnegative(),
      cadence: z.number().finite().nonnegative().nullish(),
    }),
  ),
  'barometer': z.array(
    ts.extend({
      pressureHpa: z.number().finite(),
      altitudeM: z.number().finite().nullish(),
    }),
  ),
  'accelerometer': z.array(ts.extend(axis)),
  'gyroscope': z.array(ts.extend(axis)),
  'magnetometer': z.array(ts.extend(axis)),
  'activity-segments': z.array(
    z.object({
      patrolId: z.string().cuid(),
      startTime: dateTime,
      endTime: dateTime,
      mode: z.enum(['WALK', 'BICYCLE', 'VEHICLE', 'STATIONARY']),
      confidence: z.number().finite().min(0).max(1).nullish(),
    }),
  ),
  'coverage-events': z.array(
    ts.extend({
      type: z.enum([
        'OUTSIDE_BEAT',
        'NON_FOREST',
        'OFF_ROUTE',
        'SPEED_MISMATCH',
        'JUMP',
        'WAYPOINT_MISSED',
        'MOCK_LOCATION',
        'DEVICE_STATIONARY',
      ]),
      latitude: z.number().finite().min(-90).max(90).nullish(),
      longitude: z.number().finite().min(-180).max(180).nullish(),
    }),
  ),
  'integrity-logs': z.array(
    ts.extend({
      gnssTimeAvailable: z.boolean(),
      divergenceSeconds: z.number().int().default(0),
      autoTimeEnabled: z.boolean(),
      tamperDetected: z.boolean(),
      satellites: z.number().int().nonnegative().default(0),
    }),
  ),
} as const;

type EndpointKey = keyof typeof schemas;
type DataMap = Record<
  EndpointKey,
  { model: 'patrolPoint' | 'stepReading' | 'barometerReading' | 'accelerometerReading' | 'gyroscopeReading' | 'magnetometerReading' | 'activitySegment' | 'coverageEvent' | 'timeIntegrityLog' }
>;

const modelMap: DataMap = {
  'points': { model: 'patrolPoint' },
  'step-readings': { model: 'stepReading' },
  'barometer': { model: 'barometerReading' },
  'accelerometer': { model: 'accelerometerReading' },
  'gyroscope': { model: 'gyroscopeReading' },
  'magnetometer': { model: 'magnetometerReading' },
  'activity-segments': { model: 'activitySegment' },
  'coverage-events': { model: 'coverageEvent' },
  'integrity-logs': { model: 'timeIntegrityLog' },
};

for (const key of Object.keys(schemas) as EndpointKey[]) {
  const schema = schemas[key];
  telemetryRouter.post(`/${key}`, validateBody(schema.max(MAX_BATCH)), async (req, res) => {
    const created = await ingestEntity(key, req.body, req.user!);
    res.status(201).json({ inserted: created.length, records: created });
  });
}

/**
 * Shared ingest path used by the dedicated telemetry endpoints and the
 * mixed-batch sync upload. Validates, authorizes ownership and inserts.
 */
export async function ingestEntity(
  key: EndpointKey,
  input: unknown,
  user: { id: string; role: string; isAdmin: boolean },
): Promise<{ id: string }[]> {
  const schema = schemas[key] as z.ZodArray<z.ZodType<Record<string, unknown>>>;
  const records = schema.max(MAX_BATCH).parse(input) as { patrolId: string }[];
  await authorizePatrols(user, records);

  const data = records.map((r) => ({ ...r, syncStatus: 'SYNCED' as const }));
  const model = (prisma as unknown as Record<string, { createManyAndReturn: (args: { data: unknown[] }) => Promise<{ id: string }[]> }>)[
    modelMap[key].model
  ];
  return model.createManyAndReturn({ data });
}

telemetryRouter.post('/patrol/:id/aggregates', async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!isAdmin(req) && patrol.userId !== req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You can only compute aggregates for your own patrols');
  }

  const agg = await prisma.$queryRaw<
    { points: bigint; distanceKm: number; movingSeconds: number; totalSeconds: number; grids: bigint }[]
  >`
    WITH gaps AS (
      SELECT
        timestamp,
        speed,
        "gridId",
        CASE
          WHEN speed IS NULL OR speed > 0.5 THEN
            EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp)))
          ELSE 0
        END AS moving_seconds
      FROM "PatrolPoint"
      WHERE "patrolId" = ${id}
    )
    SELECT
      COUNT(*)::bigint AS points,
      COALESCE(
        (SELECT ST_Length(ST_MakeLine(geom ORDER BY timestamp)::geography) / 1000.0
         FROM "PatrolPoint" WHERE "patrolId" = ${id}),
        0
      )::float8 AS "distanceKm",
      COALESCE(SUM(moving_seconds), 0)::float8 AS "movingSeconds",
      COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0)::float8 AS "totalSeconds",
      COUNT(DISTINCT "gridId")::bigint AS grids
    FROM gaps
  `;
  const a = agg[0];
  res.json({
    patrolId: id,
    points: Number(a?.points ?? 0n),
    distanceKm: Math.round((a?.distanceKm ?? 0) * 100) / 100,
    movingSeconds: Math.round(a?.movingSeconds ?? 0),
    totalSeconds: Math.round(a?.totalSeconds ?? 0),
    gridsTouched: Number(a?.grids ?? 0n),
    computedAt: new Date().toISOString(),
  });
});