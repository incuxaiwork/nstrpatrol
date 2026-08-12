import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';

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

// Rangers start patrols on their own initiative. The creating user is the
// owner; a patrol starts ACTIVE immediately (no admin assignment step).
patrolsRouter.post('/', validateBody(patrolCreateSchema), async (req, res) => {
  const body = req.body;
  const forest = await prisma.forest.findUnique({ where: { id: body.forestId } });
  if (!forest) throw new HttpError(404, 'not_found', 'Forest not found');

  const patrol = await prisma.patrol.create({
    data: {
      userId: req.user!.id,
      forestId: body.forestId,
      name: body.name ?? null,
      description: body.description ?? null,
      type: body.type,
      status: 'ACTIVE',
      startedAt: new Date(),
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
  const where: Record<string, unknown> = {};
  if (q.forestId) where.forestId = q.forestId;
  if (q.status) where.status = q.status;
  if (q.mine === 'true' || !isAdmin(req)) {
    where.userId = req.user!.id;
  }

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
  if (!isAdmin(req) && patrol.userId !== req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You can only view your own patrols');
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
    WHERE pp."patrolId" = ${id}
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

const startSchema = z.object({ startedAt: z.coerce.date().optional() });

patrolsRouter.post('/:id/start', validateBody(startSchema), async (req, res) => {
  const id = param(req, 'id');
  const patrol = await prisma.patrol.findUnique({ where: { id } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!isAdmin(req) && patrol.userId !== req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You can only manage your own patrols');
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
  const patrol = await prisma.patrol.findUnique({ where: { id } });
  if (!patrol) throw new HttpError(404, 'not_found', 'Patrol not found');
  if (!isAdmin(req) && patrol.userId !== req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You can only manage your own patrols');
  }

  const lastPoint = await prisma.$queryRaw<{ t: Date | null }[]>`
    SELECT MAX(timestamp)::timestamptz AS t FROM "PatrolPoint" WHERE "patrolId" = ${id}
  `;
  const endedAt = req.body.endedAt ?? lastPoint[0]?.t ?? new Date();
  const updated = await prisma.patrol.update({
    where: { id },
    data: { status: 'COMPLETED', endedAt, syncStatus: 'SYNCED' },
  });
  res.status(200).json({ status: updated.status, endedAt });
});