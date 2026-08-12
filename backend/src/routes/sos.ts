import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const sosRouter = Router();
export const alertsRouter = Router();

sosRouter.use(requireAuth);

const sosSchema = z.object({
  patrolId: z.string().cuid().nullish(),
  latitude: z.number().finite().min(-90).max(90).nullish(),
  longitude: z.number().finite().min(-180).max(180).nullish(),
  accuracy: z.number().finite().nonnegative().nullish(),
  message: z.string().trim().max(500).nullish(),
});

sosRouter.post('/', validateBody(sosSchema), async (req, res) => {
  const body = req.body;
  const incident = await prisma.incident.create({
    data: {
      userId: req.user!.id,
      patrolId: body.patrolId ?? null,
      type: 'QUICK_CAPTURE',
      title: 'SOS',
      description: body.message ?? 'Emergency alert fired from ranger device',
      severity: 'HIGH',
      status: 'SUBMITTED',
      details: { sos: true },
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy: body.accuracy ?? null,
      photos: [],
      occurredAt: new Date(),
      reportedAt: new Date(),
      syncStatus: 'SYNCED',
    },
  });

  const contacts = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: 'ADMIN' }, { cader: { in: ['FRO', 'DyRO'] } }] },
    select: { id: true, fullName: true, phone: true, role: true, cader: true },
  });

  // Push notification wiring is pending (see implementation_status.md §10).
  res.status(201).json({ incident, emergencyContacts: contacts, pushSent: false });
});

sosRouter.get('/contacts', async (req, res) => {
  const contacts = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: 'ADMIN' }, { cader: { in: ['FRO', 'DyRO'] } }] },
    select: { id: true, fullName: true, phone: true, role: true, cader: true },
  });
  res.json(contacts);
});

const alertsQuery = z.object({
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

alertsRouter.get('/', requireAdmin, async (req, res) => {
  const parsed = alertsQuery.safeParse(req.query);
  const since = parsed.success ? parsed.data.since : undefined;
  const take = parsed.success ? parsed.data.limit ?? 50 : 50;

  const [sosIncidents, tamperLogs, coverageEvents] = await Promise.all([
    prisma.incident.findMany({
      where: {
        severity: 'HIGH',
        status: { in: ['SUBMITTED', 'VERIFIED'] },
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take,
      include: { user: { select: { id: true, fullName: true, phone: true, cader: true } } },
    }),
    prisma.timeIntegrityLog.findMany({
      where: {
        tamperDetected: true,
        ...(since ? { timestamp: { gte: since } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take,
      include: { patrol: { select: { id: true, userId: true } } },
    }),
    prisma.coverageEvent.findMany({
      where: {
        type: { in: ['MOCK_LOCATION', 'SPEED_MISMATCH', 'JUMP', 'OUTSIDE_BEAT'] },
        ...(since ? { timestamp: { gte: since } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take,
      include: { patrol: { select: { id: true, userId: true } } },
    }),
  ]);

  const feed = [
    ...sosIncidents.map((i) => ({
      type: 'SOS',
      timestamp: i.occurredAt,
      incidentId: i.id,
      latitude: i.latitude,
      longitude: i.longitude,
      ranger: i.user.fullName,
      details: i.description,
    })),
    ...tamperLogs.map((t) => ({
      type: 'TAMPER',
      timestamp: t.timestamp,
      patrolId: t.patrolId,
      rangerId: t.patrol.userId,
      details: `Time tamper detected (divergence ${t.divergenceSeconds}s)`,
    })),
    ...coverageEvents.map((c) => ({
      type: 'COVERAGE',
      eventType: c.type,
      timestamp: c.timestamp,
      patrolId: c.patrolId,
      rangerId: c.patrol.userId,
      latitude: c.latitude,
      longitude: c.longitude,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json(feed);
});
