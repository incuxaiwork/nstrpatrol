import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { ingestEntity } from './telemetry';
import { incidentCreateSchema } from './incidents';
import { queryString } from '../lib/http';

export const syncRouter = Router();

syncRouter.use(requireAuth);

const isAdmin = (req: { user?: { role: string; isAdmin: boolean } }) =>
  req.user!.role === 'ADMIN' || req.user!.isAdmin;

const uploadSchema = z.object({
  deviceId: z.string().trim().min(1).max(255).optional(),
  patrolId: z.string().cuid().optional(),
  batches: z
    .array(
      z.object({
        entity: z.enum([
          'points',
          'step-readings',
          'barometer',
          'accelerometer',
          'gyroscope',
          'magnetometer',
          'activity-segments',
          'coverage-events',
          'integrity-logs',
          'incidents',
        ]),
        records: z.array(z.record(z.string(), z.unknown())),
      }),
    )
    .max(20),
});

syncRouter.post('/upload', validateBody(uploadSchema), async (req, res) => {
  const { deviceId, patrolId, batches } = req.body;
  const results: { entity: string; inserted: number }[] = [];
  let total = 0;

  for (const batch of batches) {
    try {
      if (batch.entity === 'incidents') {
        const parsed = z.array(incidentCreateSchema).max(200).parse(batch.records);
        const created = await Promise.all(
          parsed.map((r) =>
            prisma.incident.create({
              data: {
                userId: req.user!.id,
                assignmentId: r.assignmentId ?? null,
                type: r.type,
                title: r.title,
                description: r.description ?? null,
                severity: r.severity,
                details: (r.details as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                latitude: r.latitude ?? null,
                longitude: r.longitude ?? null,
                accuracy: r.accuracy ?? null,
                photos: r.photos,
                occurredAt: r.occurredAt,
                reportedAt: new Date(),
                syncStatus: 'SYNCED',
              },
            }),
          ),
        );
        results.push({ entity: 'incidents', inserted: created.length });
        total += created.length;
      } else {
        const created = await ingestEntity(batch.entity, batch.records, req.user!);
        results.push({ entity: batch.entity, inserted: created.length });
        total += created.length;
      }
      await prisma.syncLog.create({
        data: {
          deviceId: deviceId ?? null,
          patrolId: patrolId ?? null,
          recordsCount: batch.records.length,
          status: 'SYNCED',
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      await prisma.syncLog.create({
        data: {
          deviceId: deviceId ?? null,
          patrolId: patrolId ?? null,
          recordsCount: batch.records.length,
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message.slice(0, 500) : 'unknown error',
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  }

  res.status(201).json({ results, totalInserted: total });
});

const changesQuery = z.object({
  since: z.coerce.date().optional(),
});

syncRouter.get('/changes', validateQuery(changesQuery), async (req, res) => {
  const since = (req.query as z.infer<typeof changesQuery>).since ?? new Date(0);
  const me = req.user!;

  const patrols = await prisma.patrol.findMany({
    where: {
      ...(isAdmin(req)
        ? { updatedAt: { gte: since } }
        : { assignments: { some: { userId: me.id } }, updatedAt: { gte: since } }),
    },
    include: {
      assignments: {
        select: { id: true, userId: true, status: true, startedAt: true, endedAt: true },
      },
    },
    orderBy: { updatedAt: 'asc' },
  });

  const assets = await prisma.mapAsset.findMany({
    where: { updatedAt: { gte: since } },
    orderBy: { updatedAt: 'asc' },
    select: { id: true, resourceKey: true, contentType: true, sizeBytes: true, sha256: true, version: true, updatedAt: true },
  });

  const openAlerts = await prisma.incident.count({
    where: { status: { in: ['SUBMITTED', 'VERIFIED'] } },
  });

  res.json({
    cursor: new Date().toISOString(),
    patrols,
    assets,
    openAlerts,
  });
});

syncRouter.get('/status', async (req, res) => {
  const me = req.user!;
  const assignments = await prisma.patrolAssignment.findMany({
    where: isAdmin(req) ? {} : { userId: me.id },
    select: { id: true },
  });
  const assignmentIds = assignments.map((a) => a.id);

  const lastLog = await prisma.syncLog.findFirst({
    orderBy: { startedAt: 'desc' },
    where: isAdmin(req) ? {} : { deviceId: { not: undefined } },
  });

  const assignmentFilter = isAdmin(req) ? {} : { assignmentId: { in: assignmentIds } };
  const pendingWhere = (extra: Record<string, unknown>) => ({ syncStatus: 'PENDING', ...assignmentFilter, ...extra }) as never;

  const [points, steps, barometer, accelerometer, gyroscope, magnetometer, segments, coverage, integrity, incidents] =
    await Promise.all([
      prisma.patrolPoint.count({ where: pendingWhere({}) }),
      prisma.stepReading.count({ where: pendingWhere({}) }),
      prisma.barometerReading.count({ where: pendingWhere({}) }),
      prisma.accelerometerReading.count({ where: pendingWhere({}) }),
      prisma.gyroscopeReading.count({ where: pendingWhere({}) }),
      prisma.magnetometerReading.count({ where: pendingWhere({}) }),
      prisma.activitySegment.count({ where: pendingWhere({}) }),
      prisma.coverageEvent.count({ where: pendingWhere({}) }),
      prisma.timeIntegrityLog.count({ where: pendingWhere({}) }),
      prisma.incident.count({ where: { syncStatus: 'PENDING', ...(isAdmin(req) ? {} : { userId: me.id }) } }),
    ]);

  res.json({
    lastSyncAt: lastLog?.startedAt ?? null,
    lastSyncStatus: lastLog?.status ?? null,
    pending: {
      points,
      steps,
      barometer,
      accelerometer,
      gyroscope,
      magnetometer,
      segments,
      coverage,
      integrity,
      incidents,
    },
    asOf: new Date().toISOString(),
  });
});

syncRouter.get('/logs', requireAdmin, async (req, res) => {
  const limit = queryString(req, 'limit');
  const take = Math.min(Number(limit) || 50, 200);
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take,
  });
  res.json(logs);
});
