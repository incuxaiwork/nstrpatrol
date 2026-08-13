import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { storeBuffer } from '../services/storage';

export const incidentsRouter = Router();

incidentsRouter.use(requireAuth);

const isAdmin = (req: { user?: { role: string; isAdmin: boolean } }) =>
  req.user!.role === 'ADMIN' || req.user!.isAdmin;

export const incidentCreateSchema = z.object({
  patrolId: z.string().min(1).max(40).nullish(),
  type: z.enum(['HUMAN_IMPACT', 'ANIMAL_MORTALITY', 'SIGHTING', 'WATER_SOURCE', 'QUICK_CAPTURE', 'GENERAL']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),
  details: z.record(z.string(), z.unknown()).nullish(),
  latitude: z.number().finite().min(-90).max(90).nullish(),
  longitude: z.number().finite().min(-180).max(180).nullish(),
  accuracy: z.number().finite().nonnegative().nullish(),
  photos: z.array(z.string().min(1)).default([]),
  occurredAt: z.coerce.date(),
});

incidentsRouter.post('/', validateBody(incidentCreateSchema), async (req, res) => {
  const body = req.body;
  const patrolId = body.patrolId ?? null;

  const incident = await prisma.incident.create({
    data: {
      userId: req.user!.id,
      patrolId,
      type: body.type,
      title: body.title,
      description: body.description ?? null,
      severity: body.severity,
      details: body.details ?? Prisma.JsonNull,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy: body.accuracy ?? null,
      photos: body.photos,
      occurredAt: body.occurredAt,
      reportedAt: new Date(),
      syncStatus: 'SYNCED',
    },
  });
  res.status(201).json(incident);
});

const incidentListQuery = z.object({
  mine: z.literal('true').optional(),
  status: z.enum(['SUBMITTED', 'VERIFIED', 'RESOLVED', 'REJECTED']).optional(),
  type: z.enum(['HUMAN_IMPACT', 'ANIMAL_MORTALITY', 'SIGHTING', 'WATER_SOURCE', 'QUICK_CAPTURE', 'GENERAL']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

incidentsRouter.get('/', validateQuery(incidentListQuery), async (req, res) => {
  const q = req.query as z.infer<typeof incidentListQuery>;
  const where: Record<string, unknown> = {};
  if (q.mine === 'true' || !isAdmin(req)) where.userId = req.user!.id;
  if (q.status) where.status = q.status;
  if (q.type) where.type = q.type;
  if (q.from || q.to) {
    where.occurredAt = {
      ...(q.from ? { gte: q.from } : {}),
      ...(q.to ? { lte: q.to } : {}),
    };
  }

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take: 200,
  });
  res.json(incidents);
});

incidentsRouter.get('/:id', async (req, res) => {
  const incident = await prisma.incident.findUnique({ where: { id: param(req, 'id') } });
  if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
  if (!isAdmin(req) && incident.userId !== req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You can only view your own incidents');
  }
  res.json(incident);
});

incidentsRouter.post('/:id/verify', requireAdmin, async (req, res) => {
  const updated = await prisma.incident.update({
    where: { id: param(req, 'id') },
    data: { status: 'VERIFIED', verifiedById: req.user!.id, verifiedAt: new Date() },
  });
  res.json(updated);
});

const resolveSchema = z.object({
  resolutionNote: z.string().trim().max(2000).nullish(),
});

incidentsRouter.post('/:id/resolve', requireAdmin, validateBody(resolveSchema), async (req, res) => {
  const updated = await prisma.incident.update({
    where: { id: param(req, 'id') },
    data: { status: 'RESOLVED', resolutionNote: req.body.resolutionNote ?? null },
  });
  res.json(updated);
});

incidentsRouter.post('/:id/reject', requireAdmin, validateBody(resolveSchema), async (req, res) => {
  const updated = await prisma.incident.update({
    where: { id: param(req, 'id') },
    data: { status: 'REJECTED', resolutionNote: req.body.resolutionNote ?? null },
  });
  res.json(updated);
});

const photo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

incidentsRouter.post('/:id/photo-upload', photo.single('file'), async (req, res) => {
  const incident = await prisma.incident.findUnique({ where: { id: param(req, 'id') } });
  if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
  if (!isAdmin(req) && incident.userId !== req.user!.id) {
    throw new HttpError(403, 'forbidden', 'You can only add photos to your own incidents');
  }
  if (!req.file) throw new HttpError(400, 'validation_error', 'file field is required');

  const ext = req.file.originalname.includes('.') ? req.file.originalname.split('.').pop()! : 'jpg';
  const stored = await storeBuffer(req.file.buffer, ext);
  const updated = await prisma.incident.update({
    where: { id: incident.id },
    data: { photos: [...incident.photos, stored.key] },
  });
  res.status(201).json({ key: stored.key, size: stored.size, photos: updated.photos });
});
