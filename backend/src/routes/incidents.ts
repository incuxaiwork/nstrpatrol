import { Router } from 'express';
import type { Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { param } from '../lib/http';
import { storeBuffer } from '../services/storage';
import { applyIncidentWhere, incidentVisibleTo, isOfficerScope } from '../lib/scope';

export const incidentsRouter = Router();

incidentsRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Lightweight in-memory TTL cache for incident list                   */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> { at: number; body: T }
const incidentListCache = new Map<string, CacheEntry<string>>();
const INCIDENT_LIST_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 10_000;

function incidentListCacheKey(userId: string, q: Record<string, unknown>): string {
  return `${userId}:${q.mine ?? ''}:${q.status ?? ''}:${q.type ?? ''}:${q.patrolId ?? ''}:${q.from ?? ''}:${q.to ?? ''}`;
}

export const incidentCreateSchema = z.object({
  id: z.string().min(1).max(50).nullish(),
  patrolId: z.string().min(1).max(50).nullish(),
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
  reportedAt: z.coerce.date().nullish(),
});

incidentsRouter.post('/', validateBody(incidentCreateSchema), async (req, res) => {
  const body = req.body;
  const patrolId = body.patrolId ?? null;
  const data = {
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
    reportedAt: body.reportedAt ?? new Date(),
    syncStatus: 'SYNCED' as const,
  };

  const incident = body.id
    ? await prisma.incident.upsert({
        where: { id: body.id },
        create: data,
        update: {},
      })
    : await prisma.incident.create({ data });
  incidentListCache.clear();
  res.status(201).json(incident);
});

const incidentListQuery = z.object({
  mine: z.literal('true').optional(),
  status: z.enum(['SUBMITTED', 'VERIFIED', 'RESOLVED', 'REJECTED']).optional(),
  type: z.enum(['HUMAN_IMPACT', 'ANIMAL_MORTALITY', 'SIGHTING', 'WATER_SOURCE', 'QUICK_CAPTURE', 'GENERAL']).optional(),
  patrolId: z.string().max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

incidentsRouter.get('/', validateQuery(incidentListQuery), async (req, res) => {
  const q = req.query as z.infer<typeof incidentListQuery>;

  const cacheKey = incidentListCacheKey(req.user!.id, q);
  const hit = incidentListCache.get(cacheKey);
  if (hit && Date.now() - hit.at < INCIDENT_LIST_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(hit.body);
    return;
  }

  const base: Record<string, unknown> = {};
  if (q.status) base.status = q.status;
  if (q.type) base.type = q.type;
  if (q.patrolId) base.patrolId = q.patrolId;
  if (q.from || q.to) {
    base.occurredAt = {
      ...(q.from ? { gte: q.from } : {}),
      ...(q.to ? { lte: q.to } : {}),
    };
  }
  const where = await applyIncidentWhere(req.user!, base as never, { mine: q.mine === 'true' });

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take: 200,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      description: true,
      severity: true,
      status: true,
      details: true,
      latitude: true,
      longitude: true,
      accuracy: true,
      photos: true,
      occurredAt: true,
      reportedAt: true,
      syncStatus: true,
      patrolId: true,
      verifiedById: true,
      verifiedAt: true,
      resolutionNote: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const body = JSON.stringify(incidents);
  incidentListCache.set(cacheKey, { at: Date.now(), body });
  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(body);
});

incidentsRouter.get('/:id', async (req, res) => {
  const incident = await prisma.incident.findUnique({ where: { id: param(req, 'id') } });
  if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
  if (!(await incidentVisibleTo(req.user!, incident))) {
    throw new HttpError(403, 'forbidden', 'You can only view incidents within your scope');
  }
  res.json(incident);
});

async function assertIncidentInScope(req: Request, id: string): Promise<void> {
  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
  if (!(await incidentVisibleTo(req.user!, incident))) {
    throw new HttpError(403, 'forbidden', 'You can only manage incidents within your scope');
  }
}

incidentsRouter.post('/:id/verify', requireAuth, async (req, res) => {
  // Acknowledgement is an officer action: DFO (division), DyDFO
  // (sub-division) or FRO (range). Field/beat users cannot verify — not even
  // their own incidents. incidentVisibleTo below then enforces the boundary.
  if (!isOfficerScope(req.user!)) {
    throw new HttpError(403, 'forbidden', 'Verification requires DFO/DyDFO/FRO authority');
  }
  await assertIncidentInScope(req, param(req, 'id'));
  const updated = await prisma.incident.update({
    where: { id: param(req, 'id') },
    data: { status: 'VERIFIED', verifiedById: req.user!.id, verifiedAt: new Date() },
  });
  incidentListCache.clear();
  res.json(updated);
});

const resolveSchema = z.object({
  resolutionNote: z.string().trim().max(2000).nullish(),
});

incidentsRouter.post('/:id/resolve', requireAdmin, validateBody(resolveSchema), async (req, res) => {
  await assertIncidentInScope(req, param(req, 'id'));
  const updated = await prisma.incident.update({
    where: { id: param(req, 'id') },
    data: { status: 'RESOLVED', resolutionNote: req.body.resolutionNote ?? null },
  });
  incidentListCache.clear();
  res.json(updated);
});

incidentsRouter.post('/:id/reject', requireAdmin, validateBody(resolveSchema), async (req, res) => {
  await assertIncidentInScope(req, param(req, 'id'));
  const updated = await prisma.incident.update({
    where: { id: param(req, 'id') },
    data: { status: 'REJECTED', resolutionNote: req.body.resolutionNote ?? null },
  });
  incidentListCache.clear();
  res.json(updated);
});

const photo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

incidentsRouter.post('/:id/photo-upload', photo.single('file'), async (req, res) => {
  const incident = await prisma.incident.findUnique({ where: { id: param(req, 'id') } });
  if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
  if (!(await incidentVisibleTo(req.user!, incident))) {
    throw new HttpError(403, 'forbidden', 'You can only add photos to incidents within your scope');
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
