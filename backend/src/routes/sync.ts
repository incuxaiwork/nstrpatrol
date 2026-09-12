import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { ingestEntity } from './telemetry';
import { incidentCreateSchema } from './incidents';
import { queryString } from '../lib/http';
import { getUserScope, incidentScopeFilter, isDivisionWide, patrolScopeFilter } from '../lib/scope';

export const syncRouter = Router();

syncRouter.use(requireAuth);

const uploadSchema = z.object({
  deviceId: z.string().trim().min(1).max(255).optional(),
  patrolId: z.string().min(1).max(50).optional(),
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
          'movement-mode',
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
          parsed.map((r) => {
            const data = {
              userId: req.user!.id,
              patrolId: r.patrolId ?? null,
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
              reportedAt: r.reportedAt ?? new Date(),
              syncStatus: 'SYNCED' as const,
            };
            return r.id
              ? prisma.incident.upsert({ where: { id: r.id }, create: data, update: {} })
              : prisma.incident.create({ data });
          }),
        );
        results.push({ entity: 'incidents', inserted: created.length });
        total += created.length;
      } else {
        const inserted = await ingestEntity(batch.entity, batch.records, req.user!);
        results.push({ entity: batch.entity, inserted });
        total += inserted;
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

  let patrolWhere: Prisma.PatrolWhereInput = { updatedAt: { gte: since } };
  if (!isDivisionWide(me)) {
    const scope = getUserScope(me);
    patrolWhere = scope.kind === 'OPERATIONAL'
      ? { userId: me.id, updatedAt: { gte: since } }
      : { AND: [{ updatedAt: { gte: since } }, (await patrolScopeFilter(me)) ?? {}] };
  }

  const patrols = await prisma.patrol.findMany({
    where: patrolWhere,
    include: {
      user: { select: { id: true, fullName: true } },
      forest: { select: { id: true, name: true, code: true } },
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
  let patrolFilter: Prisma.PatrolWhereInput = {};
  if (!isDivisionWide(me)) {
    const scope = getUserScope(me);
    patrolFilter = scope.kind === 'OPERATIONAL'
      ? { userId: me.id }
      : ((await patrolScopeFilter(me)) ?? {});
  }
  const patrolIds = (await prisma.patrol.findMany({
    where: patrolFilter,
    select: { id: true },
  })).map((p) => p.id);

  const lastLog = await prisma.syncLog.findFirst({
    orderBy: { startedAt: 'desc' },
    where: isDivisionWide(me) ? {} : { deviceId: { not: undefined } },
  });

  const patrolWhere = isDivisionWide(me) ? {} : { patrolId: { in: patrolIds } };
  const pendingWhere = (extra: Record<string, unknown>) => ({ syncStatus: 'PENDING', ...patrolWhere, ...extra }) as never;

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
      prisma.incident.count({
        where: {
          syncStatus: 'PENDING',
          ...(isDivisionWide(me)
            ? {}
            : getUserScope(me).kind === 'OPERATIONAL'
              ? { userId: me.id }
              : ((await incidentScopeFilter(me)) ?? {})),
        },
      }),
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
  const me = req.user!;

  let where: Prisma.SyncLogWhereInput | undefined;
  if (!isDivisionWide(me)) {
    const scope = getUserScope(me);
    const patrolWhere =
      scope.kind === 'OPERATIONAL' ? { userId: me.id } : ((await patrolScopeFilter(me)) ?? {});
    const patrolIds = (await prisma.patrol.findMany({ where: patrolWhere, select: { id: true } })).map((p) => p.id);
    where = patrolIds.length > 0 ? { patrolId: { in: patrolIds } } : { id: '__none__' };
  }

  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take,
    ...(where ? { where } : {}),
  });
  res.json(logs);
});
