import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { incidentScopeFilter, isDivisionWide, patrolScopeFilter } from '../lib/scope';

export const sosRouter = Router();
export const alertsRouter = Router();

sosRouter.use(requireAuth);

const sosSchema = z.object({
  patrolId: z.string().min(1).max(50).nullish(),
  latitude: z.number().finite().min(-90).max(90).nullish(),
  longitude: z.number().finite().min(-180).max(180).nullish(),
  accuracy: z.number().finite().nonnegative().nullish(),
  message: z.string().trim().max(500).nullish(),
});

const CADER_CONTACTS = ['FRO', 'DyRO', 'DFO', 'DyDFO'] as const;

function contactsQuery() {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ role: 'ADMIN' }, { cader: { in: [...CADER_CONTACTS] } }] },
    select: { id: true, fullName: true, phone: true, role: true, cader: true },
  });
}

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

  const contacts = await contactsQuery();

  // Push notification wiring is pending (see implementation_status.md §10).
  res.status(201).json({ incident, emergencyContacts: contacts, pushSent: false });
});

sosRouter.get('/contacts', async (req, res) => {
  const contacts = await contactsQuery();
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

  const incidentWhere: Prisma.IncidentWhereInput = {
    severity: 'HIGH',
    status: { in: ['SUBMITTED', 'VERIFIED'] },
    ...(since ? { occurredAt: { gte: since } } : {}),
  };
  if (!isDivisionWide(req.user!)) {
    const scopeFilter = await incidentScopeFilter(req.user!);
    if (scopeFilter) incidentWhere.AND = [scopeFilter];
  }

  const patrolWhere: Prisma.PatrolWhereInput = since ? { updatedAt: { gte: since } } : {};
  if (!isDivisionWide(req.user!)) {
    const scopeFilter = await patrolScopeFilter(req.user!);
    if (scopeFilter) patrolWhere.AND = [scopeFilter];
  }

  const [sosIncidents, tamperLogs, coverageEvents] = await Promise.all([
    prisma.incident.findMany({
      where: incidentWhere,
      orderBy: { occurredAt: 'desc' },
      take,
      include: { user: { select: { id: true, fullName: true, phone: true, cader: true } } },
    }),
    prisma.timeIntegrityLog.findMany({
      where: {
        tamperDetected: true,
        ...(since ? { timestamp: { gte: since } } : {}),
        ...(isDivisionWide(req.user!) ? {} : { patrol: patrolWhere as never }),
      },
      orderBy: { timestamp: 'desc' },
      take,
      include: { patrol: { select: { id: true, userId: true } } },
    }),
    prisma.coverageEvent.findMany({
      where: {
        type: { in: ['MOCK_LOCATION', 'SPEED_MISMATCH', 'JUMP', 'OUTSIDE_BEAT'] },
        ...(since ? { timestamp: { gte: since } } : {}),
        ...(isDivisionWide(req.user!) ? {} : { patrol: patrolWhere as never }),
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
