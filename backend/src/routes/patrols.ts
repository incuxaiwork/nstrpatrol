import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { geometryForDb, type GGeometry } from '../lib/geo';

export const patrolsRouter = Router();

patrolsRouter.use(requireAuth);

const isAdmin = (req: { user?: { role: string; isAdmin: boolean } }) =>
  req.user!.role === 'ADMIN' || req.user!.isAdmin;

const patrolCreateSchema = z.object({
  forestId: z.string().cuid(),
  name: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(500).nullish(),
  type: z.enum(['WALK', 'BICYCLE', 'VEHICLE', 'STATIONARY']),
});

patrolsRouter.post('/', validateBody(patrolCreateSchema), async (req, res) => {
  const body = req.body;
  const forest = await prisma.forest.findUnique({ where: { id: body.forestId } });
  if (!forest) throw new HttpError(404, 'not_found', 'Forest not found');

  const patrol = await prisma.$transaction(async (tx) => {
    const created = await tx.patrol.create({
      data: {
        forestId: body.forestId,
        name: body.name ?? null,
        description: body.description ?? null,
        type: body.type,
      },
    });
    if (!isAdmin(req)) {
      await tx.patrolAssignment.create({
        data: { patrolId: created.id, userId: req.user!.id },
      });
    }
    return created;
  });

  res.status(201).json(patrol);
});

const patrolListQuery = z.object({
  assignedTo: z.literal('me').optional(),
  status: z.enum(['ASSIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  forestId: z.string().cuid().optional(),
});

patrolsRouter.get('/', validateQuery(patrolListQuery), async (req, res) => {
  const q = req.query as z.infer<typeof patrolListQuery>;
  const where: Record<string, unknown> = {};
  if (q.forestId) where.forestId = q.forestId;
  if (q.status) where.status = q.status;
  if (q.assignedTo === 'me') {
    where.assignments = { some: { userId: req.user!.id } };
  } else if (!isAdmin(req)) {
    where.assignments = { some: { userId: req.user!.id } };
  }

  const patrols = await prisma.patrol.findMany({
    where,
    include: {
      forest: { select: { id: true, name: true, code: true } },
      assignments: {
        select: { id: true, userId: true, status: true, startedAt: true, endedAt: true },
      },
      _count: { select: { waypoints: true } },
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
      forest: { select: { id: true, name: true, code: true } },
      assignments: {
        include: { user: { select: { id: true, fullName: true, email: true, phone: true, cader: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      routes: {
        include: { route: { select: { id: true, name: true, patrolType: true, targetKm: true } } },
      },
      waypoints: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!isAdmin(req) && !patrol.assignments.some((a) => a.userId === req.user!.id)) {
    throw new HttpError(403, 'forbidden', 'You are not part of this patrol');
  }

  const stats = await prisma.$queryRaw<{ points: bigint; distanceKm: number; durationSeconds: number }[]>`
    SELECT COUNT(pp.id)::bigint AS points,
      COALESCE(
        ST_Length(ST_MakeLine(pp.geom ORDER BY pp.timestamp)::geography) / 1000.0, 0
      ) AS "distanceKm",
      COALESCE(
        EXTRACT(EPOCH FROM (MAX(pp.timestamp) - MIN(pp.timestamp))), 0
      ) AS "durationSeconds"
    FROM "PatrolPoint" pp
    JOIN "PatrolAssignment" pa ON pa.id = pp."assignmentId"
    WHERE pa."patrolId" = ${id}
  `;

  res.json({
    ...patrol,
    stats: {
      points: Number(stats[0].points ?? 0n),
      distanceKm: Math.round((stats[0].distanceKm ?? 0) * 100) / 100,
      durationSeconds: Math.round(stats[0].durationSeconds ?? 0),
    },
  });
});

const assignSchema = z.object({ userId: z.string().cuid() });

patrolsRouter.post('/:id/assignments', requireAdmin, validateBody(assignSchema), async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  const user = await prisma.user.findUnique({ where: { id: req.body.userId } });
  if (!user) throw new HttpError(404, 'not_found', 'User not found');

  const assignment = await prisma.patrolAssignment.create({
    data: { patrolId: id, userId: req.body.userId },
  });
  res.status(201).json(assignment);
});

patrolsRouter.delete('/:id/assignments/:assignmentId', requireAdmin, async (req, res) => {
  await prisma.patrolAssignment.delete({ where: { id: param(req, 'assignmentId') } });
  res.status(204).end();
});

async function assertOwnAssignment(req: { user?: { id: string; role: string; isAdmin: boolean } }, assignmentId: string) {
  const assignment = await prisma.patrolAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new HttpError(404, 'not_found', 'Assignment not found');
  if (assignment.userId !== req.user!.id && !isAdmin(req)) {
    throw new HttpError(403, 'forbidden', 'You can only manage your own assignments');
  }
  return assignment;
}

async function recomputePatrol(patrolId: string): Promise<void> {
  const assignments = await prisma.patrolAssignment.findMany({
    where: { patrolId },
    select: { startedAt: true, endedAt: true, status: true },
  });
  const startedAt = assignments
    .map((a) => a.startedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const endedAt = assignments
    .map((a) => a.endedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const status = assignments.every((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED')
    ? 'COMPLETED'
    : assignments.some((a) => a.status === 'ACTIVE')
      ? 'ACTIVE'
      : 'ASSIGNED';

  await prisma.patrol.update({
    where: { id: patrolId },
    data: {
      startedAt,
      endedAt,
      status: status as 'COMPLETED' | 'ACTIVE' | 'ASSIGNED',
      syncStatus: 'SYNCED',
    },
  });
}

const startSchema = z.object({ startedAt: z.coerce.date().optional() });

patrolsRouter.post('/:id/assignments/:assignmentId/start', validateBody(startSchema), async (req, res) => {
  const assignment = await assertOwnAssignment(req, param(req, 'assignmentId'));
  const startedAt = req.body.startedAt ?? new Date();
  await prisma.patrolAssignment.update({
    where: { id: assignment.id },
    data: { status: 'ACTIVE', startedAt },
  });
  await recomputePatrol(assignment.patrolId);
  res.status(200).json({ status: 'ACTIVE', startedAt });
});

const completeSchema = z.object({ endedAt: z.coerce.date().optional() });

patrolsRouter.post('/:id/assignments/:assignmentId/complete', validateBody(completeSchema), async (req, res) => {
  const assignment = await assertOwnAssignment(req, param(req, 'assignmentId'));

  const lastPoint = await prisma.$queryRaw<{ t: Date | null }[]>`
    SELECT MAX(timestamp)::timestamptz AS t FROM "PatrolPoint" WHERE "assignmentId" = ${assignment.id}
  `;
  const endedAt = req.body.endedAt ?? lastPoint[0]?.t ?? new Date();
  await prisma.patrolAssignment.update({
    where: { id: assignment.id },
    data: { status: 'COMPLETED', endedAt },
  });
  await recomputePatrol(assignment.patrolId);
  res.status(200).json({ status: 'COMPLETED', endedAt });
});

// ------------------------------------------------ routes + waypoints binding

const bindRouteSchema = z.object({
  routeId: z.string().cuid(),
  assignmentId: z.string().cuid().nullish(),
});

patrolsRouter.post('/:id/routes', requireAdmin, validateBody(bindRouteSchema), async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  const route = await prisma.patrolRoute.findUnique({ where: { id: req.body.routeId } });
  if (!route) throw new HttpError(404, 'not_found', 'Patrol route not found');

  const link = await prisma.patrolDutyRoute.create({
    data: { patrolId: id, routeId: req.body.routeId, assignmentId: req.body.assignmentId ?? null },
  });
  res.status(201).json(link);
});

patrolsRouter.delete('/:id/routes/:dutyRouteId', requireAdmin, async (req, res) => {
  await prisma.patrolDutyRoute.delete({ where: { id: param(req, 'dutyRouteId') } });
  res.status(204).end();
});

const waypointSchema = z.object({
  name: z.string().trim().min(1).max(160),
  assignmentId: z.string().cuid().nullish(),
  geometry: z.unknown().refine((v) => v != null, { message: 'geometry is required' }),
});

patrolsRouter.post('/:id/waypoints', requireAdmin, validateBody(waypointSchema), async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  const geometry: GGeometry = geometryForDb(req.body.geometry);

  const waypoint = await prisma.patrolWaypoint.create({
    data: { patrolId: id, name: req.body.name, assignmentId: req.body.assignmentId ?? null },
  });
  await prisma.$executeRaw`
    UPDATE "PatrolWaypoint" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text), 4326)
    WHERE id = ${waypoint.id}
  `;
  res.status(201).json(waypoint);
});

patrolsRouter.delete('/:id/waypoints/:waypointId', requireAdmin, async (req, res) => {
  await prisma.patrolWaypoint.delete({ where: { id: param(req, 'waypointId') } });
  res.status(204).end();
});

const checkinSchema = z.object({
  assignmentId: z.string().cuid(),
  reachedAt: z.coerce.date(),
  distanceMeters: z.number().finite().nonnegative().nullish(),
  accuracy: z.number().finite().nonnegative().nullish(),
});

patrolsRouter.post('/waypoints/:waypointId/checkin', validateBody(checkinSchema), async (req, res) => {
  const waypointId = param(req, 'waypointId');
  const waypoint = await prisma.patrolWaypoint.findUnique({ where: { id: waypointId } });
  if (!waypoint) throw new HttpError(404, 'not_found', 'Waypoint not found');
  const assignment = await assertOwnAssignment(req, req.body.assignmentId);
  if (waypoint.assignmentId && waypoint.assignmentId !== assignment.id) {
    throw new HttpError(403, 'forbidden', 'Waypoint is bound to another assignment');
  }

  const checkin = await prisma.waypointCheckin.upsert({
    where: { assignmentId_waypointId: { assignmentId: assignment.id, waypointId } },
    update: {
      reachedAt: req.body.reachedAt,
      distanceMeters: req.body.distanceMeters ?? null,
      accuracy: req.body.accuracy ?? null,
    },
    create: {
      assignmentId: assignment.id,
      waypointId,
      reachedAt: req.body.reachedAt,
      distanceMeters: req.body.distanceMeters ?? null,
      accuracy: req.body.accuracy ?? null,
    },
  });
  res.status(201).json(checkin);
});
