import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/error';
import { incidentScopeFilter, isDivisionWide, isOfficerScope, patrolVisibleTo } from '../lib/scope';

export const sosRouter = Router();
export const alertsRouter = Router();

sosRouter.use(requireAuth);

/** Anti-spam window between two SOS from the same user (server clock). */
export const SOS_COOLDOWN_MS = 60_000;

const sosSchema = z.object({
  id: z.string().min(1).max(50).nullish(),
  patrolId: z.string().min(1).max(50).nullish(),
  latitude: z.number().finite().min(-90).max(90).nullish(),
  longitude: z.number().finite().min(-180).max(180).nullish(),
  accuracy: z.number().finite().nonnegative().nullish(),
  message: z.string().trim().max(500).nullish(),
});

/** Matches exactly the incidents this route creates (never other quick captures). */
const SOS_WHERE: Prisma.IncidentWhereInput = {
  type: 'QUICK_CAPTURE',
  details: { path: ['sos'], equals: true },
};

const CADER_CONTACTS = ['FRO', 'DyRO', 'DFO', 'DyDFO'] as const;

function contactsQuery() {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ role: 'ADMIN' }, { cader: { in: [...CADER_CONTACTS] } }] },
    select: { id: true, fullName: true, phone: true, role: true, cader: true },
  });
}

function sosResponse(incident: unknown, contacts: unknown) {
  // Push notification wiring is pending (see implementation_status.md §10).
  return { incident, emergencyContacts: contacts, pushSent: false };
}

sosRouter.post('/', validateBody(sosSchema), async (req, res) => {
  const body = req.body;

  // Idempotency first: a network retry carrying an existing client-generated
  // ID must return the original SOS instead of creating a duplicate (and must
  // never trip the cooldown below).
  if (body.id) {
    const existing = await prisma.incident.findUnique({ where: { id: body.id } });
    if (existing) {
      if (existing.userId !== req.user!.id) {
        throw new HttpError(403, 'forbidden', 'This SOS ID belongs to another user');
      }
      res.status(200).json(sosResponse(existing, await contactsQuery()));
      return;
    }
  }

  // Patrol ownership: a nonexistent patrol is a client bug (400); someone
  // else's patrol is out of bounds (403). Never let P2003 become a 500.
  if (body.patrolId) {
    const patrol = await prisma.patrol.findUnique({
      where: { id: body.patrolId },
      select: { userId: true, beat: true },
    });
    if (!patrol) throw new HttpError(400, 'patrol_not_found', 'Patrol does not exist');
    if (!(await patrolVisibleTo(req.user!, patrol))) {
      throw new HttpError(403, 'forbidden', 'You can only attach an SOS to your own patrol');
    }
  }

  // Per-user cooldown on actual SOS creation (idempotent replays returned above).
  const cutoff = new Date(Date.now() - SOS_COOLDOWN_MS);
  const recent = await prisma.incident.findFirst({
    where: { userId: req.user!.id, ...SOS_WHERE, occurredAt: { gte: cutoff } },
    orderBy: { occurredAt: 'desc' },
    select: { occurredAt: true },
  });
  if (recent) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent.occurredAt.getTime() + SOS_COOLDOWN_MS - Date.now()) / 1000),
    );
    res.status(409).json({
      error: 'SOS_COOLDOWN',
      message: `An SOS was already raised recently. Wait ${retryAfterSeconds}s before raising another.`,
      retryAfterSeconds,
    });
    return;
  }

  const now = new Date();
  const data = {
    ...(body.id ? { id: body.id } : {}),
    userId: req.user!.id,
    patrolId: body.patrolId ?? null,
    type: 'QUICK_CAPTURE' as const,
    title: 'SOS',
    description: body.message ?? 'Emergency alert fired from ranger device',
    severity: 'HIGH' as const,
    status: 'SUBMITTED' as const,
    details: { sos: true },
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    accuracy: body.accuracy ?? null,
    photos: [],
    occurredAt: now,
    reportedAt: now,
    syncStatus: 'SYNCED' as const,
  };

  try {
    const incident = await prisma.incident.create({ data });
    res.status(201).json(sosResponse(incident, await contactsQuery()));
  } catch (err) {
    // Lost a create race against a concurrent request with the same client ID:
    // behave exactly like the idempotency check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && body.id) {
      const existing = await prisma.incident.findUnique({ where: { id: body.id } });
      if (existing && existing.userId === req.user!.id) {
        res.status(200).json(sosResponse(existing, await contactsQuery()));
        return;
      }
    }
    throw err;
  }
});

sosRouter.get('/contacts', async (req, res) => {
  const contacts = await contactsQuery();
  res.json(contacts);
});

const alertsQuery = z.object({
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

alertsRouter.get('/', requireAuth, async (req, res) => {
  const parsed = alertsQuery.safeParse(req.query);
  const since = parsed.success ? parsed.data.since : undefined;
  const take = parsed.success ? parsed.data.limit ?? 50 : 50;

  const divisionWide = isDivisionWide(req.user!);
  // DFO / legacy admin see the division-wide mixed feed; DyDFO and FRO get
  // their scope's SOS alerts; every other user gets no feed at all.
  if (!divisionWide && !isOfficerScope(req.user!)) {
    throw new HttpError(403, 'forbidden', 'Alert access requires DFO/DyDFO/FRO scope');
  }

  const incidentWhere: Prisma.IncidentWhereInput = {
    severity: 'HIGH',
    status: { in: ['SUBMITTED', 'VERIFIED'] },
    ...(since ? { occurredAt: { gte: since } } : {}),
  };
  if (!divisionWide) {
    const scopeFilter = await incidentScopeFilter(req.user!);
    if (scopeFilter) incidentWhere.AND = [scopeFilter];
  }

  const sosIncidents = await prisma.incident.findMany({
    where: incidentWhere,
    orderBy: { occurredAt: 'desc' },
    take,
    include: { user: { select: { id: true, fullName: true, phone: true, cader: true } } },
  });

  const sosFeed = sosIncidents.map((i) => ({
    type: 'SOS',
    timestamp: i.occurredAt,
    incidentId: i.id,
    latitude: i.latitude,
    longitude: i.longitude,
    ranger: i.user.fullName,
    details: i.description,
  }));

  // Tamper/coverage events stay division-wide-only: they are patrol-quality
  // signals, not life-safety alerts, so they are not part of the DyDFO/FRO view.
  if (!divisionWide) {
    res.json(sosFeed);
    return;
  }

  const [tamperLogs, coverageEvents] = await Promise.all([
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
    ...sosFeed,
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
