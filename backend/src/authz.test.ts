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
      findMany: jest.fn(),
    },
    patrolPoint: {
      count: jest.fn(),
    },
    stepReading: {
      aggregate: jest.fn(),
    },
    activitySegment: {
      findFirst: jest.fn(),
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
    incident: { findUnique: jest.Mock; findMany: jest.Mock };
    patrolPoint: { count: jest.Mock };
    stepReading: { aggregate: jest.Mock };
    activitySegment: { findFirst: jest.Mock };
  };
};

const app = createApp();

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

function fieldUser() {
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

function fieldUserWith(cader: string, extra: Record<string, unknown> = {}) {
  return { ...fieldUser(), cader, ...extra };
}

const fullPatrol = {
  id: 'p1',
  userId: 'officer-a',
  beat: null,
  forestId: 'f1',
  type: 'WALK',
  status: 'COMPLETED',
  name: 'Patrol',
  description: null,
  startedAt: new Date(),
  endedAt: new Date(),
  syncStatus: 'SYNCED',
  createdAt: new Date(),
  updatedAt: new Date(),
  patrolMethod: null,
  teamLeader: null,
  detectedMethod: null,
  memberCount: 0,
  avgSpeedKmh: null,
  caloriesEstimate: null,
  heartPointsEstimate: null,
  armedStatus: null,
  user: { id: 'officer-a', fullName: 'A', email: 'a@x', phone: null, cader: 'FBO', role: 'RANGER' },
  forest: { id: 'f1', name: 'F', code: 'FC' },
};

function mockRangeScopedDb(rangeName: string, beatNames: string[], userIds: string[]) {
  prisma.range.findUnique.mockResolvedValue({ id: 'r-1', name: rangeName });
  prisma.beat.findMany.mockResolvedValue(beatNames.map((name) => ({ name })));
  prisma.user.findMany.mockResolvedValue(userIds.map((id) => ({ id })));
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
});

describe('patrol list authorization', () => {
  it('unauthenticated → 401', async () => {
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols');
    expect(res.status).toBe(401);
    expect(prisma.patrol.findMany).not.toHaveBeenCalled();
  });

  it('DFO sees division-wide patrols (no scope filter)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
    expect(where.userId).toBeUndefined();
  });

  it('DyDFO list is scoped to Dornal(a) patrols', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();
    const or = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(or).toContainEqual({ beat: { in: ['KALANUTHALA'] } });
    expect(or).toContainEqual({ userId: { in: ['officer-a'] } });
  });

  it('field user only sees their own patrols', async () => {
    prisma.user.findUnique.mockResolvedValue(fieldUser());
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('me');
  });
});

describe('patrol detail authorization', () => {
  it('DyDFO cannot view an out-of-scope patrol → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.patrol.findUnique.mockResolvedValue({ id: 'p1', userId: 'officer-markapur', beat: null });
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('DyDFO can view a patrol owned by a Dornal(a) officer', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.patrol.findUnique.mockResolvedValue({
      ...fullPatrol,
      userId: 'officer-a',
      beat: null,
    });
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }]);
    prisma.beat.findMany.mockResolvedValue([{ name: 'KALANUTHALA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    prisma.patrolPoint.count.mockResolvedValue(0);
    prisma.stepReading.aggregate.mockResolvedValue({ _sum: { steps: 0 } });
    prisma.activitySegment.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
  });
});

describe('FRO (assigned range) authorization', () => {
  function froUser() {
    return fieldUserWith('FRO', {
      email: 'fro@test.gov.in',
      divisionId: 'PT_MARKAPUR',
      subDivisionId: null,
      rangeId: 'r-1',
      beatId: null,
    });
  }

  it('list is scoped to the assigned Range only', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser());
    mockRangeScopedDb('Y.PALEM', ['AKKAPALEM', 'BOYALAPALLI'], ['y1', 'y2']);
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    const or = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(or).toContainEqual({ beat: { in: ['AKKAPALEM', 'BOYALAPALLI'] } });
    expect(or).toContainEqual({ userId: { in: ['y1', 'y2'] } });
  });

  it('can view a patrol on a beat of the assigned Range', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser());
    prisma.patrol.findUnique.mockResolvedValue({
      ...fullPatrol,
      userId: 'y1',
      beat: 'AKKAPALEM',
    });
    mockRangeScopedDb('Y.PALEM', ['AKKAPALEM'], ['y1']);
    prisma.patrolPoint.count.mockResolvedValue(0);
    prisma.stepReading.aggregate.mockResolvedValue({ _sum: { steps: 0 } });
    prisma.activitySegment.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
  });

  it('cannot view a patrol on another Range → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser());
    prisma.patrol.findUnique.mockResolvedValue({ id: 'p1', userId: 'markapur-officer', beat: 'TALLAKONDA' });
    mockRangeScopedDb('Y.PALEM', ['AKKAPALEM'], ['y1']);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('FRO without a range assignment does NOT auto-access any Range (own data only)', async () => {
    prisma.user.findUnique.mockResolvedValue(
      fieldUserWith('FRO', { email: 'fro-unassigned@test.gov.in' }),
    );
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('me');
    expect(where.AND).toBeUndefined();
    expect(prisma.range.findMany).not.toHaveBeenCalled();
    expect(prisma.range.findUnique).not.toHaveBeenCalled();
  });
});

describe('FBO/ABO (assigned beat) authorization', () => {
  function beatUser(cader: string) {
    return fieldUserWith(cader, {
      email: `${cader.toLowerCase()}@test.gov.in`,
      divisionId: 'PT_MARKAPUR',
      subDivisionId: 'sd-1',
      rangeId: 'r-1',
      beatId: 'b-1',
    });
  }

  it('ABO list is scoped to the assigned Beat (own geography)', async () => {
    prisma.user.findUnique.mockResolvedValue(beatUser('ABO'));
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-1', name: 'CHILAKACHERLA' });
    prisma.user.findMany.mockResolvedValue([{ id: 'me' }, { id: 'co-officer' }]);
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    const or = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(or).toContainEqual({ beat: 'CHILAKACHERLA' });
    expect(or).toContainEqual({ userId: { in: ['me', 'co-officer'] } });
  });

  it('FBO cannot view a patrol on another Beat → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(beatUser('FBO'));
    prisma.patrol.findUnique.mockResolvedValue({ id: 'p1', userId: 'other-officer', beat: 'ZAVUKU' });
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-1', name: 'CHILAKACHERLA' });
    prisma.user.findMany.mockResolvedValue([{ id: 'me' }]);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('FBO can view own patrol within the assigned Beat', async () => {
    prisma.user.findUnique.mockResolvedValue(beatUser('FBO'));
    prisma.patrol.findUnique.mockResolvedValue({ ...fullPatrol, userId: 'me', beat: 'CHILAKACHERLA' });
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-1', name: 'CHILAKACHERLA' });
    prisma.user.findMany.mockResolvedValue([{ id: 'me' }]);
    prisma.patrolPoint.count.mockResolvedValue(0);
    prisma.stepReading.aggregate.mockResolvedValue({ _sum: { steps: 0 } });
    prisma.activitySegment.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
  });
});

describe('DyRO / FSO (OPERATIONAL, no fixed boundary) authorization', () => {
  it.each(['DyRO', 'FSO'])('%s sees own patrols only', async (cader) => {
    prisma.user.findUnique.mockResolvedValue(fieldUserWith(cader));
    prisma.patrol.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const where = prisma.patrol.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('me');
    expect(prisma.range.findMany).not.toHaveBeenCalled();
  });

  it.each(['DyRO', 'FSO'])('%s cannot view another officer\u2019s patrol → 403', async (cader) => {
    prisma.user.findUnique.mockResolvedValue(fieldUserWith(cader));
    prisma.patrol.findUnique.mockResolvedValue({ id: 'p1', userId: 'officer-a', beat: 'CHILAKACHERLA' });
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });
});

describe('unauthorized actions → 403', () => {
  it('field user cannot verify an incident', async () => {
    prisma.user.findUnique.mockResolvedValue(fieldUser());
    const res = await request(app)
      .post('/api/incidents/i1/verify')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('field user cannot update another user', async () => {
    prisma.user.findUnique.mockResolvedValue(fieldUser());
    const res = await request(app)
      .patch('/api/users/u1')
      .send({ cader: 'FRO' })
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('DFO (division-wide) can view any patrol regardless of beat', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue({ ...fullPatrol, userId: 'officer-a', beat: 'Y.PALEM' });
    prisma.patrolPoint.count.mockResolvedValue(0);
    prisma.stepReading.aggregate.mockResolvedValue({ _sum: { steps: 0 } });
    prisma.activitySegment.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/patrols/p1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
  });
});
