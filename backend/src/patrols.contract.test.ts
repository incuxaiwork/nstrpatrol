import request from 'supertest';
import { createApp } from './app';
import { invalidateUserScope } from './middleware/auth';

jest.mock('./lib/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({ sub: 'me', role: 'ADMIN' })),
  signAccessToken: jest.fn(() => 'signed-token'),
  generateRefreshToken: jest.fn(() => ({ token: 'rt', hash: 'rh' })),
  hashRefreshToken: jest.fn(() => 'rh'),
  generateVerificationDigest: jest.fn(() => 'digest'),
}));

jest.mock('./db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    patrol: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    patrolPoint: { findMany: jest.fn(), count: jest.fn() },
    stepReading: { aggregate: jest.fn() },
    activitySegment: { findFirst: jest.fn() },
    coverageEvent: { findMany: jest.fn() },
    beat: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    range: { findMany: jest.fn(), findUnique: jest.fn() },
    subDivision: { findMany: jest.fn() },
    forest: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('./db/prisma') as {
  prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    patrol: { findMany: jest.Mock; findUnique: jest.Mock };
    patrolPoint: { count: jest.Mock };
    stepReading: { aggregate: jest.Mock };
    activitySegment: { findFirst: jest.Mock };
    coverageEvent: { findMany: jest.Mock };
    beat: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    range: { findMany: jest.Mock; findUnique: jest.Mock };
    subDivision: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
};

const app = createApp();

function baseUser(cader: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'me',
    email: 'user@test.gov.in',
    fullName: 'User',
    role: 'RANGER',
    cader,
    isAdmin: false,
    isActive: true,
    divisionId: null,
    subDivisionId: null,
    rangeId: null,
    beatId: null,
    ...extra,
  };
}
const dfoUser = () => baseUser('DFO', { role: 'ADMIN', isAdmin: true, divisionId: 'PT_MARKAPUR' });
const fboUser = () =>
  baseUser('FBO', { divisionId: 'PT_MARKAPUR', subDivisionId: 'sd-1', rangeId: 'r-1', beatId: 'b-1' });

/** Patrol rows as the DB would return them (beat is free text from devices). */
function patrolRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p-1',
    userId: 'me',
    forestId: 'f-1',
    name: 'Morning beat patrol',
    type: 'WALK',
    status: 'COMPLETED',
    startedAt: new Date('2026-08-20T06:00:00Z'),
    endedAt: new Date('2026-08-20T08:00:00Z'),
    createdAt: new Date('2026-08-20T06:00:00Z'),
    beat: 'CHILAKACHERLA',
    detectedMethod: 'WALK',
    user: { id: 'me', fullName: 'User', email: 'user@test.gov.in' },
    forest: { id: 'f-1', name: 'NSTR', code: 'NSTR' },
    ...over,
  };
}

interface SqlLike {
  strings: string[];
  values: unknown[];
}

/** Flatten nested Prisma.Sql tagged templates into text + bound values. */
function renderSql(piece: unknown): { text: string; values: unknown[] } {
  if (piece && typeof piece === 'object' && Array.isArray((piece as SqlLike).strings)) {
    const frag = piece as SqlLike;
    let text = frag.strings[0];
    const values: unknown[] = [];
    for (let i = 0; i < frag.values.length; i++) {
      const part = renderSql(frag.values[i]);
      text += part.text + frag.strings[i + 1];
      values.push(...part.values);
    }
    return { text, values };
  }
  return { text: '?', values: [piece] };
}

let capturedRaw: { text: string; values: unknown[] } | null = null;

function mockRaw(rows: unknown[]) {
  capturedRaw = null;
  prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    capturedRaw = renderSql({ strings, values });
    return Promise.resolve(rows);
  });
}

function lastRawCall() {
  expect(capturedRaw).not.toBeNull();
  return capturedRaw as { text: string; values: unknown[] };
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
});

describe('patrol geography enrichment (GET /api/patrols)', () => {
  it('unauthenticated list request → 401', async () => {
    const res = await request(app).get('/api/patrols');
    expect(res.status).toBe(401);
  });

  it('resolves beat → range → subdivision → division for every patrol in one batched pass', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findMany.mockResolvedValue([
      patrolRow(),
      patrolRow({ id: 'p-2', beat: 'BURUGUNDALA' }),
    ]);
    prisma.beat.findMany.mockResolvedValue([
      { id: 'b-1', name: 'CHILAKACHERLA', rangeName: 'DORNAL' },
      { id: 'b-2', name: 'BURUGUNDALA', rangeName: 'DORNAL' },
    ]);
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL', subDivisionId: 'sd-1' }]);
    prisma.subDivision.findMany.mockResolvedValue([{ id: 'sd-1', name: 'Dornala' }]);

    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    // Batched lookup: exactly one query per hierarchy level, never per patrol.
    expect(prisma.beat.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.range.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.subDivision.findMany).toHaveBeenCalledTimes(1);

    expect(res.body[0].geography).toEqual({
      beatId: 'b-1',
      beat: 'CHILAKACHERLA',
      range: 'DORNAL',
      rangeId: 'r1',
      subDivision: 'Dornala',
      subDivisionId: 'sd-1',
      division: 'PT_MARKAPUR',
    });
    // A resolved beat yields the correct parent range…
    expect(res.body[0].geography.range).toBe('DORNAL');
    // …and that range's subdivision.
    expect(res.body[1].geography.subDivision).toBe('Dornala');
  });

  it('unresolved beat keeps its raw text but fabricates no hierarchy ids/names', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findMany.mockResolvedValue([patrolRow({ beat: 'NOT A REAL BEAT' })]);
    prisma.beat.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body[0].geography).toEqual({
      beatId: null,
      beat: 'NOT A REAL BEAT',
      range: null,
      rangeId: null,
      subDivision: null,
      subDivisionId: null,
      division: 'PT_MARKAPUR',
    });
  });

  it('null beat stays null across every geography field', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findMany.mockResolvedValue([patrolRow({ beat: null })]);
    const res = await request(app).get('/api/patrols').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body[0].geography.beat).toBeNull();
    expect(res.body[0].geography.range).toBeNull();
    expect(res.body[0].geography.subDivision).toBeNull();
    // No hierarchy lookups are needed when no patrol carries a beat.
    expect(prisma.beat.findMany).not.toHaveBeenCalled();
  });

  it('detail response carries the same enrichment', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.beat.findMany.mockResolvedValue([{ id: 'b-1', name: 'CHILAKACHERLA', rangeName: 'DORNAL' }]);
    prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL', subDivisionId: 'sd-1' }]);
    prisma.subDivision.findMany.mockResolvedValue([{ id: 'sd-1', name: 'Dornala' }]);
    mockRaw([{ points: 12n, distanceKm: 4.2, durationSeconds: 7200 }]);
    prisma.stepReading.aggregate.mockResolvedValue({ _sum: { steps: 9000 } });
    prisma.activitySegment.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/patrols/p-1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.geography).toMatchObject({ beatId: 'b-1', range: 'DORNAL', subDivision: 'Dornala' });
  });
});

describe('GET /api/patrols/:id/coverage/summary (ForestGrid coverage)', () => {
  it('unauthenticated request → 401 and no SQL runs', async () => {
    const res = await request(app).get('/api/patrols/p-1/coverage/summary');
    expect(res.status).toBe(401);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('nonexistent patrol → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/patrols/nope/coverage/summary').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('patrol outside the requester scope → 403 (no SQL runs)', async () => {
    // FBO assigned to b-1 ("OTHER BEAT") requesting someone else's patrol.
    prisma.user.findUnique.mockResolvedValue(fboUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow({ userId: 'someone-else', beat: 'CHILAKACHERLA' }));
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-1', name: 'OTHER BEAT' });
    prisma.user.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns the documented summary shape with a correct percentage', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.beat.findFirst.mockResolvedValue({ name: 'CHILAKACHERLA' });
    mockRaw([{ totalCells: 8, patrolledCells: 3, pointCount: 21 }]);

    const res = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      patrolId: 'p-1',
      totalCells: 8,
      patrolledCells: 3,
      coveragePercent: 37.5,
      pointCount: 21,
    });
  });

  it('rounds percentages to one decimal (1 of 3 cells → 33.3)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.beat.findFirst.mockResolvedValue({ name: 'CHILAKACHERLA' });
    mockRaw([{ totalCells: 3, patrolledCells: 1, pointCount: 2 }]);
    const res = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.body.coveragePercent).toBe(33.3);
  });

  it('empty patrol / empty universe returns an honest zeroed summary (no NaN)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.beat.findFirst.mockResolvedValue({ name: 'CHILAKACHERLA' });
    mockRaw([{ totalCells: 0, patrolledCells: 0, pointCount: 0 }]);
    const res = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      patrolId: 'p-1',
      totalCells: 0,
      patrolledCells: 0,
      coveragePercent: 0,
      pointCount: 0,
    });
  });

  it('derives cells from ForestGrid ∩ Beat geometry with PostGIS — never gridId or an analysis grid', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.beat.findFirst.mockResolvedValue({ name: 'CHILAKACHERLA' });
    mockRaw([{ totalCells: 5, patrolledCells: 5, pointCount: 50 }]);
    await request(app).get('/api/patrols/p-1/coverage/summary').set('Authorization', 'Bearer tok');

    const raw = lastRawCall();
    expect(raw.text).toContain('FROM "ForestGrid"');
    expect(raw.text).toContain('ST_Intersects(fg.geom, b.geom)');
    expect(raw.text).toContain('ST_Intersects(sc.geom, pp.geom)');
    // Beat-bounded universe uses the resolved beat NAME parameter.
    expect(raw.values).toContain('CHILAKACHERLA');
    // Point attribution is scoped to this patrol only.
    expect(raw.text).toContain('pp."patrolId" = ?');
    expect(raw.values).toContain('p-1');
    // Contract guardrails: no gridId column, no client analysis-grid table.
    expect(raw.text).not.toContain('"gridId"');
    expect(raw.text).not.toContain('AnalysisGrid');
    // Coverage is derived, never written back.
    expect(raw.text.toLowerCase()).not.toContain('update');
    expect(raw.text.toLowerCase()).not.toContain('insert');
  });

  it('a patrol whose beat text matches nothing falls back to the unbounded grid universe', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow({ beat: 'MYSTERY BEAT' }));
    prisma.beat.findFirst.mockResolvedValue(null);
    mockRaw([{ totalCells: 500, patrolledCells: 4, pointCount: 9 }]);
    const res = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    // No Beat clause when the beat cannot be authoritatively resolved.
    expect(raw.text).not.toContain('FROM "Beat"');
    expect(res.body.coveragePercent).toBe(0.8);
  });

  it('the owner within an FBO scope can read their own patrol summary', async () => {
    prisma.user.findUnique.mockResolvedValue(fboUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow({ userId: 'me' }));
    prisma.beat.findFirst.mockResolvedValue({ name: 'CHILAKACHERLA' });
    mockRaw([{ totalCells: 2, patrolledCells: 2, pointCount: 7 }]);
    const res = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.coveragePercent).toBe(100);
  });
});

describe('mobile CoverageEvent contract preservation', () => {
  it('GET /api/patrols/:id/coverage still returns a JSON ARRAY of events (Android SyncManager)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.coverageEvent.findMany.mockResolvedValue([
      { type: 'OUTSIDE_BEAT', latitude: 15.2, longitude: 78.9, timestamp: new Date('2026-08-20T07:00:00Z') },
    ]);
    const res = await request(app).get('/api/patrols/p-1/coverage').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ type: 'OUTSIDE_BEAT', lat: 15.2, lng: 78.9 });
  });

  it('summary endpoint returns an OBJECT — the two contracts remain distinct', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.patrol.findUnique.mockResolvedValue(patrolRow());
    prisma.beat.findFirst.mockResolvedValue({ name: 'CHILAKACHERLA' });
    mockRaw([{ totalCells: 4, patrolledCells: 2, pointCount: 5 }]);
    const summary = await request(app)
      .get('/api/patrols/p-1/coverage/summary')
      .set('Authorization', 'Bearer tok');
    expect(Array.isArray(summary.body)).toBe(false);
    expect(summary.body.totalCells).toBe(4);
  });
});
