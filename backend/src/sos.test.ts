import request from 'supertest';
import { createApp } from '../src/app';
import { invalidateUserScope } from './middleware/auth';

jest.mock('../src/lib/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({ sub: 'me', role: 'ADMIN' })),
  signAccessToken: jest.fn(() => 'signed-token'),
  generateRefreshToken: jest.fn(() => ({ token: 'rt', hash: 'rh' })),
  hashRefreshToken: jest.fn(() => 'rh'),
  generateVerificationDigest: jest.fn(() => 'digest'),
}));

jest.mock('../src/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    patrol: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    range: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    beat: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    incident: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    timeIntegrityLog: {
      findMany: jest.fn(),
    },
    coverageEvent: {
      findMany: jest.fn(),
    },
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../src/db/prisma') as {
  prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    patrol: { findUnique: jest.Mock; findMany: jest.Mock };
    range: { findMany: jest.Mock; findUnique: jest.Mock };
    beat: { findMany: jest.Mock; findUnique: jest.Mock };
    incident: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    timeIntegrityLog: { findMany: jest.Mock };
    coverageEvent: { findMany: jest.Mock };
  };
};

const app = createApp();

const AUTH = { Authorization: 'Bearer tok' };

function postSos(body: Record<string, unknown>) {
  return request(app).post('/api/sos').set(AUTH).send(body);
}

// --- actors ----------------------------------------------------------------

function rangerUser() {
  return {
    id: 'me',
    email: 'fbo@test.gov.in',
    fullName: 'FBO',
    role: 'RANGER',
    cader: 'FBO',
    isAdmin: false,
    isActive: true,
    divisionId: null,
    subDivisionId: null,
    rangeId: null,
    beatId: null,
  };
}

function froUser(rangeId: string | null = 'r-1') {
  return {
    ...rangerUser(),
    email: 'fro@test.gov.in',
    fullName: 'FRO',
    cader: 'FRO',
    rangeId,
  };
}

function dyDfoUser() {
  return {
    id: 'me',
    email: 'dydfo@test.gov.in',
    fullName: 'DyDFO',
    role: 'ADMIN',
    cader: 'DyDFO',
    isAdmin: true,
    isActive: true,
    divisionId: null,
    subDivisionId: 'sd-1',
    rangeId: null,
    beatId: null,
  };
}

function dfoUser() {
  return {
    id: 'me',
    email: 'dfo@test.gov.in',
    fullName: 'DFO',
    role: 'ADMIN',
    cader: 'DFO',
    isAdmin: true,
    isActive: true,
    divisionId: 'PT_MARKAPUR',
    subDivisionId: null,
    rangeId: null,
    beatId: null,
  };
}

function beatUser(cader: string) {
  return {
    ...rangerUser(),
    email: `${cader.toLowerCase()}@test.gov.in`,
    fullName: cader,
    cader,
    beatId: 'b-1',
  };
}

// --- db helpers ------------------------------------------------------------

const sosIncident = {
  id: 'sos-1',
  userId: 'me',
  patrolId: null,
  type: 'QUICK_CAPTURE',
  title: 'SOS',
  description: 'Emergency alert fired from ranger device',
  severity: 'HIGH',
  status: 'SUBMITTED',
  details: { sos: true },
  latitude: null,
  longitude: null,
  accuracy: null,
  photos: [],
  occurredAt: new Date(),
  reportedAt: new Date(),
  syncStatus: 'SYNCED',
  verifiedById: null,
  verifiedAt: null,
  resolutionNote: null,
};

/** Mocks the scope lookups for an assigned Range: range name → beats → users. */
function mockRangeScopedDb(rangeName: string, beatNames: string[], userIds: string[]) {
  prisma.range.findUnique.mockResolvedValue({ id: 'r-1', name: rangeName });
  prisma.beat.findMany.mockResolvedValue(beatNames.map((name) => ({ name })));
  prisma.user.findMany.mockResolvedValue(userIds.map((id) => ({ id })));
}

function mockSubDivisionDb(beatNames: string[], userIds: string[]) {
  prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
  prisma.beat.findMany.mockResolvedValue(beatNames.map((name) => ({ name })));
  prisma.user.findMany.mockResolvedValue(userIds.map((id) => ({ id })));
  prisma.patrol.findMany.mockResolvedValue([]);
}

/** Default happy-path mocks for POST /api/sos as a plain field ranger. */
function mockSosCreate(actor: Record<string, unknown> = rangerUser()) {
  prisma.user.findUnique.mockResolvedValue(actor);
  prisma.incident.findFirst.mockResolvedValue(null);
  prisma.incident.create.mockResolvedValue({ ...sosIncident });
  prisma.user.findMany.mockResolvedValue([]);
}

/**
 * Emulates the cooldown lookup's real DB semantics (`occurredAt >= cutoff`):
 * the mocked row is only returned when it falls inside the queried window,
 * exactly as Prisma would filter it.
 */
function mockCooldownLastSos(lastOccurredAt: Date | null) {
  prisma.incident.findFirst.mockImplementation(
    (args: { where: { occurredAt?: { gte?: Date } } }) => {
      const gte = args?.where?.occurredAt?.gte;
      if (!lastOccurredAt || !gte || lastOccurredAt < gte) return Promise.resolve(null);
      return Promise.resolve({ occurredAt: lastOccurredAt });
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
});

// --- creation --------------------------------------------------------------

describe('POST /api/sos creation', () => {
  it('authenticated user creates SOS → 201 with incident + contacts', async () => {
    mockSosCreate();
    const res = await postSos({});
    expect(res.status).toBe(201);
    expect(res.body.incident.id).toBe('sos-1');
    expect(res.body.incident.type).toBe('QUICK_CAPTURE');
    expect(res.body.incident.title).toBe('SOS');
    expect(res.body.incident.severity).toBe('HIGH');
    expect(res.body.incident.status).toBe('SUBMITTED');
    expect(res.body.incident.details).toEqual({ sos: true });
    expect(Array.isArray(res.body.emergencyContacts)).toBe(true);
    expect(res.body.pushSent).toBe(false);
  });

  it('anonymous user → 401', async () => {
    const res = await request(app).post('/api/sos').send({});
    expect(res.status).toBe(401);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('valid GPS is persisted', async () => {
    mockSosCreate();
    const res = await postSos({ latitude: 15.89, longitude: 78.91, accuracy: 12.5, message: 'Tusker attack' });
    expect(res.status).toBe(201);
    const data = prisma.incident.create.mock.calls[0][0].data;
    expect(data.latitude).toBe(15.89);
    expect(data.longitude).toBe(78.91);
    expect(data.accuracy).toBe(12.5);
    expect(data.description).toBe('Tusker attack');
  });

  it('null GPS stays null (coordinates never fabricated)', async () => {
    mockSosCreate();
    const res = await postSos({ latitude: null, longitude: null });
    expect(res.status).toBe(201);
    const data = prisma.incident.create.mock.calls[0][0].data;
    expect(data.latitude).toBeNull();
    expect(data.longitude).toBeNull();
    expect(data.accuracy).toBeNull();
  });

  it.each([
    ['latitude', { latitude: 95 }],
    ['longitude', { longitude: -200 }],
    ['accuracy', { accuracy: -1 }],
  ])('invalid %s → 400', async (_field, payload) => {
    mockSosCreate();
    const res = await postSos(payload);
    expect(res.status).toBe(400);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('message > 500 chars → 400', async () => {
    mockSosCreate();
    const res = await postSos({ message: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });
});

// --- idempotency -----------------------------------------------------------

describe('POST /api/sos idempotency', () => {
  it('same client ID twice → exactly one incident', async () => {
    mockSosCreate();
    prisma.incident.findUnique
      .mockResolvedValueOnce(null) // first POST: no existing incident
      .mockResolvedValueOnce({ ...sosIncident }); // retry: found
    const first = await postSos({ id: 'sos-1' });
    const res = await postSos({ id: 'sos-1' });
    expect(first.status).toBe(201);
    expect(res.status).toBe(200);
    expect(prisma.incident.create).toHaveBeenCalledTimes(1);
  });

  it('client ID belonging to another user → 403 (no enumeration)', async () => {
    mockSosCreate();
    prisma.incident.findUnique.mockResolvedValue({ ...sosIncident, userId: 'someone-else' });
    const res = await postSos({ id: 'sos-1' });
    expect(res.status).toBe(403);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('retry with same ID returns the existing incident identity', async () => {
    mockSosCreate();
    prisma.incident.findUnique.mockResolvedValue({ ...sosIncident, id: 'sos-abc' });
    const res = await postSos({ id: 'sos-abc' });
    expect(res.status).toBe(200);
    expect(res.body.incident.id).toBe('sos-abc');
    expect(res.body.incident.userId).toBe('me');
    expect(Array.isArray(res.body.emergencyContacts)).toBe(true);
  });
});

// --- patrol ownership ------------------------------------------------------

describe('POST /api/sos patrol ownership', () => {
  it('own patrol → allowed', async () => {
    mockSosCreate();
    prisma.patrol.findUnique.mockResolvedValue({ userId: 'me', beat: 'CHILAKACHERLA' });
    const res = await postSos({ patrolId: 'p1' });
    expect(res.status).toBe(201);
    expect(prisma.incident.create.mock.calls[0][0].data.patrolId).toBe('p1');
  });

  it("another user's patrol → 403", async () => {
    mockSosCreate();
    prisma.patrol.findUnique.mockResolvedValue({ userId: 'other-ranger', beat: 'ZAVUKU' });
    const res = await postSos({ patrolId: 'p1' });
    expect(res.status).toBe(403);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('nonexistent patrol → 400 (never a Prisma P2003 500)', async () => {
    mockSosCreate();
    prisma.patrol.findUnique.mockResolvedValue(null);
    const res = await postSos({ patrolId: 'ghost' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('patrol_not_found');
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('no patrolId → allowed (nullable behavior preserved)', async () => {
    mockSosCreate();
    const res = await postSos({});
    expect(res.status).toBe(201);
    expect(prisma.patrol.findUnique).not.toHaveBeenCalled();
    expect(prisma.incident.create.mock.calls[0][0].data.patrolId).toBeNull();
  });
});

// --- cooldown --------------------------------------------------------------

describe('POST /api/sos 60s cooldown', () => {
  it('first SOS → 201', async () => {
    mockSosCreate();
    mockCooldownLastSos(null);
    const res = await postSos({});
    expect(res.status).toBe(201);
  });

  it('second SOS within 60 seconds → 409 SOS_COOLDOWN with computed retryAfterSeconds', async () => {
    mockSosCreate();
    mockCooldownLastSos(new Date(Date.now() - 10_000));
    const res = await postSos({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SOS_COOLDOWN');
    expect(typeof res.body.retryAfterSeconds).toBe('number');
    expect(res.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(51);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('retry of the SAME idempotency ID during cooldown → existing incident, NOT 409', async () => {
    mockSosCreate();
    mockCooldownLastSos(new Date(Date.now() - 5_000));
    prisma.incident.findUnique.mockResolvedValue({ ...sosIncident });
    const res = await postSos({ id: 'sos-1' });
    expect(res.status).toBe(200);
    expect(res.body.incident.id).toBe('sos-1');
    expect(prisma.incident.findFirst).not.toHaveBeenCalled();
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('SOS after cooldown expired → allowed (61s-old SOS is outside the window)', async () => {
    mockSosCreate();
    mockCooldownLastSos(new Date(Date.now() - 61_000));
    const res = await postSos({});
    expect(res.status).toBe(201);
    expect(prisma.incident.create).toHaveBeenCalled();
  });
});

// --- alert access ----------------------------------------------------------

describe('GET /api/alerts authorization', () => {
  function feedSosRow(id: string, userId: string) {
    return {
      id,
      occurredAt: new Date(),
      latitude: 15.89,
      longitude: 78.91,
      description: 'SOS',
      user: { id: userId, fullName: 'Ranger', phone: '+91-90000-00000', cader: 'FBO' },
    };
  }

  it('DFO sees division-wide SOS (mixed feed incl. tamper/coverage)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.incident.findMany.mockResolvedValue([feedSosRow('sos-1', 'ranger-1')]);
    prisma.timeIntegrityLog.findMany.mockResolvedValue([]);
    prisma.coverageEvent.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/alerts').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('SOS');
    expect(res.body[0].incidentId).toBe('sos-1');
    expect(prisma.timeIntegrityLog.findMany).toHaveBeenCalled();
    expect(prisma.coverageEvent.findMany).toHaveBeenCalled();
    const where = prisma.incident.findMany.mock.calls[0][0].where;
    expect(where.severity).toBe('HIGH');
    expect(where.AND).toBeUndefined();
  });

  it('DyDFO sees only Dornal(a) sub-division SOS (no tamper/coverage)', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    mockSubDivisionDb(['KALANUTHALA'], ['dornala-ranger']);
    // A patrol on a Dornal(a) beat → incidentScopeFilter includes its id.
    prisma.patrol.findMany.mockResolvedValue([{ id: 'p-dornala' }]);
    prisma.incident.findMany.mockResolvedValue([feedSosRow('sos-2', 'dornala-ranger')]);
    const res = await request(app).get('/api/alerts').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('SOS');
    const where = prisma.incident.findMany.mock.calls[0][0].where;
    const or = (where.AND as { OR: Record<string, unknown>[] }[])[0].OR;
    expect(or).toContainEqual({ userId: { in: ['dornala-ranger'] } });
    expect(or).toContainEqual({ patrolId: { in: ['p-dornala'] } });
    expect(prisma.timeIntegrityLog.findMany).not.toHaveBeenCalled();
    expect(prisma.coverageEvent.findMany).not.toHaveBeenCalled();
  });

  it('FRO sees only own Range SOS', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser('r-1'));
    mockRangeScopedDb('Y.PALEM', ['AKKAPALEM'], ['y1']);
    prisma.patrol.findMany.mockResolvedValue([{ id: 'p-beat' }]);
    prisma.incident.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/alerts').set(AUTH);
    expect(res.status).toBe(200);
    const where = prisma.incident.findMany.mock.calls[0][0].where;
    const or = (where.AND as { OR: Record<string, unknown>[] }[])[0].OR;
    expect(or).toContainEqual({ userId: { in: ['y1'] } });
    expect(or).toContainEqual({ patrolId: { in: ['p-beat'] } });
    expect(prisma.timeIntegrityLog.findMany).not.toHaveBeenCalled();
  });

  it('unrelated FRO is scoped to their own Range only (cross-range SOS excluded)', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser('r-2'));
    mockRangeScopedDb('MARKAPUR', ['TALAKONA'], ['z1']);
    prisma.patrol.findMany.mockResolvedValue([{ id: 'p-z' }]);
    prisma.incident.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/alerts').set(AUTH);
    expect(res.status).toBe(200);
    const where = prisma.incident.findMany.mock.calls[0][0].where;
    const or = (where.AND as { OR: Record<string, unknown>[] }[])[0].OR;
    expect(or).toContainEqual({ userId: { in: ['z1'] } });
    expect(JSON.stringify(where)).not.toContain('y1');
  });

  it('operational ranger (no area scope) → 403, no organization-wide SOS', async () => {
    prisma.user.findUnique.mockResolvedValue(rangerUser());
    const res = await request(app).get('/api/alerts').set(AUTH);
    expect(res.status).toBe(403);
    expect(prisma.incident.findMany).not.toHaveBeenCalled();
  });

  it('beat-scoped field user → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(beatUser('ABO'));
    const res = await request(app).get('/api/alerts').set(AUTH);
    expect(res.status).toBe(403);
    expect(prisma.incident.findMany).not.toHaveBeenCalled();
  });
});

// --- acknowledgement -------------------------------------------------------

describe('POST /api/incidents/:id/verify authorization', () => {
  const target = { id: 'i1', userId: 'ranger-9', patrolId: null };

  it('DFO can verify in-scope SOS', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.incident.findUnique.mockResolvedValue({ ...target });
    prisma.incident.update.mockResolvedValue({ ...target, status: 'VERIFIED' });
    const res = await request(app).post('/api/incidents/i1/verify').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VERIFIED');
    expect(prisma.incident.update.mock.calls[0][0].data.verifiedById).toBe('me');
  });

  it('DyDFO can verify in-scope SOS', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    mockSubDivisionDb(['KALANUTHALA'], ['ranger-9']);
    prisma.incident.findUnique.mockResolvedValue({ ...target, userId: 'ranger-9' });
    prisma.incident.update.mockResolvedValue({ ...target, status: 'VERIFIED' });
    const res = await request(app).post('/api/incidents/i1/verify').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VERIFIED');
  });

  it('FRO can verify in-range SOS', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser('r-1'));
    mockRangeScopedDb('Y.PALEM', ['AKKAPALEM'], ['ranger-9']);
    prisma.incident.findUnique.mockResolvedValue({ ...target, userId: 'ranger-9' });
    prisma.incident.update.mockResolvedValue({ ...target, status: 'VERIFIED' });
    const res = await request(app).post('/api/incidents/i1/verify').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VERIFIED');
  });

  it('FRO cannot verify out-of-range SOS → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser('r-1'));
    mockRangeScopedDb('Y.PALEM', ['AKKAPALEM'], ['y1']);
    prisma.incident.findUnique.mockResolvedValue({ ...target, userId: 'outsider' });
    const res = await request(app).post('/api/incidents/i1/verify').set(AUTH);
    expect(res.status).toBe(403);
    expect(prisma.incident.update).not.toHaveBeenCalled();
  });

  it('unauthorized ranger cannot verify SOS → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(rangerUser());
    const res = await request(app).post('/api/incidents/i1/verify').set(AUTH);
    expect(res.status).toBe(403);
    expect(prisma.incident.update).not.toHaveBeenCalled();
  });

  it('verified status is preserved (VERIFIED = acknowledged, not merged)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.incident.findUnique.mockResolvedValue({ ...target });
    prisma.incident.update.mockResolvedValue({
      ...target,
      status: 'VERIFIED',
      verifiedById: 'me',
      verifiedAt: new Date(),
    });
    const res = await request(app).post('/api/incidents/i1/verify').set(AUTH);
    const data = prisma.incident.update.mock.calls[0][0].data;
    expect(data.status).toBe('VERIFIED');
    expect(res.body.verifiedById).toBe('me');
    expect(res.body.verifiedAt).toBeDefined();
  });

  it('resolved remains resolved (admin action, distinct meaning)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.incident.findUnique.mockResolvedValue({ ...target, status: 'VERIFIED' });
    prisma.incident.update.mockResolvedValue({ ...target, status: 'RESOLVED' });
    const res = await request(app)
      .post('/api/incidents/i1/resolve')
      .set(AUTH)
      .send({ resolutionNote: 'Ranger safe' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESOLVED');
    expect(prisma.incident.update.mock.calls[0][0].data.status).toBe('RESOLVED');
  });

  it('rejected remains rejected (false alarm, distinct meaning)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.incident.findUnique.mockResolvedValue({ ...target, status: 'SUBMITTED' });
    prisma.incident.update.mockResolvedValue({ ...target, status: 'REJECTED' });
    const res = await request(app)
      .post('/api/incidents/i1/reject')
      .set(AUTH)
      .send({ resolutionNote: 'Accidental trigger' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    expect(prisma.incident.update.mock.calls[0][0].data.status).toBe('REJECTED');
  });
});

// --- alert lifecycle -------------------------------------------------------

describe('GET /api/alerts lifecycle', () => {
  it('SUBMITTED and VERIFIED appear; RESOLVED and REJECTED disappear', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.incident.findMany.mockResolvedValue([]);
    prisma.timeIntegrityLog.findMany.mockResolvedValue([]);
    prisma.coverageEvent.findMany.mockResolvedValue([]);
    await request(app).get('/api/alerts').set(AUTH);
    const where = prisma.incident.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['SUBMITTED', 'VERIFIED'] });
    expect(JSON.stringify(where)).not.toContain('RESOLVED');
    expect(JSON.stringify(where)).not.toContain('REJECTED');
  });
});
