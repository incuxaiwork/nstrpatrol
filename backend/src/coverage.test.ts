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
    range: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    beat: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../src/db/prisma') as {
  prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    range: { findUnique: jest.Mock; findMany: jest.Mock };
    beat: { findUnique: jest.Mock; findMany: jest.Mock };
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
const dyDfoUser = () =>
  baseUser('DyDFO', { role: 'ADMIN', isAdmin: true, divisionId: 'PT_MARKAPUR', subDivisionId: 'sd-1' });
const froUser = () =>
  baseUser('FRO', { divisionId: 'PT_MARKAPUR', subDivisionId: 'sd-1', rangeId: 'r-1' });
const fboUser = () =>
  baseUser('FBO', { divisionId: 'PT_MARKAPUR', subDivisionId: 'sd-1', rangeId: 'r-1', beatId: 'b-1' });
const fsoUser = () => baseUser('FSO', { divisionId: 'PT_MARKAPUR' });

function cellRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cell-1',
    gridCode: 'G001',
    forestId: 'f-1',
    forestCode: 'NSTR-R1',
    pointCount: 0,
    lastPatrolledAt: null,
    covered: false,
    ...over,
  };
}

function mockDyDfoDornalaDb() {
  // subdivision ranges → DORNAL / G.V.PALLI
  prisma.range.findMany.mockResolvedValue([{ id: 'r1', name: 'DORNAL' }, { id: 'r2', name: 'G.V.PALLI' }]);
  // beats of those ranges
  prisma.beat.findMany.mockResolvedValue([{ name: 'CHILAKACHERLA' }, { name: 'BURUGUNDALA' }]);
  // users assigned inside the subdivision
  prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
}

let capturedRaw: { text: string; values: unknown[] } | null = null;

interface SqlLike {
  strings: string[];
  values: unknown[];
}

/** $queryRaw is invoked as a tagged template; captured args are nested Prisma.Sql fragments. */
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

function mockRaw(rows: unknown[]) {
  capturedRaw = null;
  prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    const raw = renderSql({ strings, values });
    capturedRaw = { text: raw.text, values: raw.values };
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

describe('coverage authorization (who may ask)', () => {
  it('unauthenticated → 401', async () => {
    const res = await request(app).get('/api/coverage/grids');
    expect(res.status).toBe(401);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('FSO (OPERATIONAL) cannot pass a range filter → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(fsoUser());
    const res = await request(app).get('/api/coverage/grids?rangeId=r-9').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('FSO (OPERATIONAL) cannot pass a beat filter → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(fsoUser());
    const res = await request(app).get('/api/coverage/grids?beatId=b-9').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('FBO cannot pass a range filter → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(fboUser());
    const res = await request(app).get('/api/coverage/grids?rangeId=r-1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('DyDFO requesting a range outside the sub-division → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.range.findUnique.mockResolvedValue({ id: 'r-x', name: 'MARKAPUR', subDivisionId: null });
    const res = await request(app).get('/api/coverage/grids?rangeId=r-x').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('DyDFO requesting a beat outside the sub-division → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.range.findMany.mockResolvedValue([]);
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-x', name: 'KALANUTHALA', rangeName: 'MARKAPUR' });
    const res = await request(app).get('/api/coverage/grids?beatId=b-x').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requesting a range that does not exist → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.range.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/coverage/grids?rangeId=r-nope').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
  });

  it('requesting a beat that does not exist → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.beat.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/coverage/grids?beatId=b-nope').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
  });
});

describe('DFO (division-wide) coverage', () => {
  it('sees every cell; patrolled + unpatrolled listed; summary computed', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockRaw([
      cellRow({ gridCode: 'G001', pointCount: 3, covered: true, lastPatrolledAt: new Date('2026-08-18T09:00:00Z') }),
      cellRow({ id: 'cell-2', gridCode: 'G002' }),
    ]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ kind: 'DIVISION', subDivisionId: null, rangeId: null, beatId: null });
    expect(res.body.summary).toMatchObject({ totalCells: 2, patrolledCells: 1, unpatrolledCells: 1, coveragePercent: 50, pointCount: 3 });
    expect(res.body.cells[0]).toMatchObject({ gridCode: 'G001', covered: true, pointCount: 3 });
    expect(res.body.cells[0].lastPatrolledAt).toBe('2026-08-18T09:00:00.000Z');
    expect(res.body.cells[1]).toMatchObject({ gridCode: 'G002', covered: false, pointCount: 0 });
  });

  it('division-wide query has no beat/patrol scoping and no filter params', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockRaw([]);
    await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    const raw = lastRawCall();
    expect(raw.text).not.toContain('Beat');
    expect(raw.text).not.toContain('WHERE p.');
    expect(raw.values.length).toBe(0);
  });

  it('division-wide forestId filter narrows cells and is bound as a parameter', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockRaw([]);
    await request(app).get('/api/coverage/grids?forestId=f-1').set('Authorization', 'Bearer tok');
    const raw = lastRawCall();
    expect(raw.text).toContain('fg."forestId" =');
    expect(raw.values).toContain('f-1');
  });

  it('division-wide can narrow by range via rangeId', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.range.findUnique.mockResolvedValue({ id: 'r-1', name: 'Y.PALEM' });
    prisma.beat.findMany.mockResolvedValue([{ name: 'AKKAPALEM' }]);
    mockRaw([]);
    const res = await request(app).get('/api/coverage/grids?rangeId=r-1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    expect(raw.text).toContain('EXISTS (SELECT 1 FROM "Beat" b WHERE b.name = ANY(');
    expect(raw.values).toContainEqual(['AKKAPALEM']);
    expect(raw.text).toContain('p."beat" = ANY(');
  });
});

describe('DyDFO (sub-division) coverage', () => {
  it('Dornal(a) scope: cells ∩ subdivision beats, points from scoped users OR scoped beat names', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    mockDyDfoDornalaDb();
    mockRaw([
      cellRow({ gridCode: 'G010', pointCount: 2, covered: true }),
      cellRow({ id: 'cell-2', gridCode: 'G011' }),
    ]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.scope.kind).toBe('SUB_DIVISION');
    expect(res.body.summary).toMatchObject({ totalCells: 2, patrolledCells: 1, coveragePercent: 50 });

    const raw = lastRawCall();
    // cell universe restricted to the subdivision's beats
    expect(raw.text).toContain('EXISTS (SELECT 1 FROM "Beat" b WHERE b.name = ANY(');
    expect(raw.values).toContainEqual(['CHILAKACHERLA', 'BURUGUNDALA']);
    // patrol visibility = scoped users OR subdivision beat names
    expect(raw.text).toContain('p."userId" = ANY(');
    expect(raw.text).toContain('p."beat" = ANY(');
    expect(raw.values).toContainEqual(['officer-a']);
    expect(raw.values).toContainEqual(['CHILAKACHERLA', 'BURUGUNDALA']);
  });

  it('rangeId filter inside the sub-division is accepted', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.range.findUnique.mockResolvedValue({ id: 'r1', name: 'DORNAL', subDivisionId: 'sd-1' });
    prisma.beat.findMany.mockResolvedValue([{ name: 'CHILAKACHERLA' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    mockRaw([]);
    const res = await request(app).get('/api/coverage/grids?rangeId=r1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    expect(raw.values).toContainEqual(['CHILAKACHERLA']);
  });

  it('beatId filter inside the sub-division is accepted', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-1', name: 'CHILAKACHERLA', rangeName: 'DORNAL' });
    prisma.user.findMany.mockResolvedValue([{ id: 'officer-a' }]);
    mockRaw([]);
    const res = await request(app).get('/api/coverage/grids?beatId=b-1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    expect(raw.values).toContainEqual(['CHILAKACHERLA']);
  });
});

describe('FRO (assigned range) coverage', () => {
  it('restricts cells to the assigned range beats and patrols to range users', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser());
    prisma.range.findUnique.mockResolvedValue({ id: 'r-1', name: 'Y.PALEM' });
    prisma.beat.findMany.mockResolvedValue([{ name: 'AKKAPALEM' }, { name: 'BOYALAPALLI' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'y1' }]);
    mockRaw([cellRow({ covered: true, pointCount: 1 })]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.scope.kind).toBe('RANGE');
    const raw = lastRawCall();
    expect(raw.values).toContainEqual(['AKKAPALEM', 'BOYALAPALLI']);
    expect(raw.values).toContainEqual(['y1']);
  });

  it('cannot filter to another range → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(froUser());
    prisma.range.findUnique.mockResolvedValue({ id: 'r-9', name: 'MARKAPUR' });
    const res = await request(app).get('/api/coverage/grids?rangeId=r-9').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });
});

describe('FBO (assigned beat) coverage', () => {
  it('restricts cells to the assigned beat and patrols to beat users', async () => {
    prisma.user.findUnique.mockResolvedValue(fboUser());
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-1', name: 'CHILAKACHERLA' });
    prisma.user.findMany.mockResolvedValue([{ id: 'me' }, { id: 'co' }]);
    mockRaw([cellRow({ covered: true, pointCount: 4 })]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    expect(raw.values).toContainEqual(['CHILAKACHERLA']);
    expect(raw.values).toContainEqual(['me', 'co']);
  });

  it('cannot filter to another beat → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(fboUser());
    prisma.beat.findUnique.mockResolvedValue({ id: 'b-x', name: 'ZAVUKU', rangeName: 'V.P.SOUTH' });
    const res = await request(app).get('/api/coverage/grids?beatId=b-x').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });
});

describe('coverage derivation semantics', () => {
  it('multiple points in one cell → covered with point count (multiple patrols count together)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockRaw([
      cellRow({ gridCode: 'G065', pointCount: 9, covered: true, lastPatrolledAt: new Date('2026-08-18T09:00:00Z') }),
    ]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.cells[0]).toMatchObject({ covered: true, pointCount: 9 });
    expect(res.body.summary.pointCount).toBe(9);
    // point rows from every visible patrol flow through one SQL JOIN — points
    // are never aggregated per patrol in JS.
    const raw = lastRawCall();
    expect(raw.text).toContain('pp."patrolId" IN (SELECT id FROM visible)');
  });

  it('cells with no points stay unpatrolled (points outside all cells simply never match)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockRaw([
      cellRow({ gridCode: 'G100' }),
      cellRow({ id: 'cell-2', gridCode: 'G101' }),
      cellRow({ id: 'cell-3', gridCode: 'G102' }),
    ]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ totalCells: 3, patrolledCells: 0, coveragePercent: 0, pointCount: 0 });
    expect(res.body.cells.every((c: { covered: boolean }) => !c.covered)).toBe(true);
  });

  it('from/to date filters are bound to patrol-point timestamps', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockRaw([]);
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-31T00:00:00Z');
    const res = await request(app).get(`/api/coverage/grids?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`).set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    expect(raw.text).toContain('pp."timestamp" >= ');
    expect(raw.text).toContain('pp."timestamp" <= ');
    expect(raw.values).toContain('2026-08-01T00:00:00.000Z');
    expect(raw.values).toContain('2026-08-31T00:00:00.000Z');
  });

  it('OPERATIONAL user sees only cells their own patrols covered (100% of their cells)', async () => {
    prisma.user.findUnique.mockResolvedValue(fsoUser());
    mockRaw([
      cellRow({ gridCode: 'G200', covered: true, pointCount: 2 }),
      cellRow({ id: 'cell-2', gridCode: 'G201', covered: false, pointCount: 0 }),
    ]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    const raw = lastRawCall();
    expect(raw.text).toContain('p."userId" = ');
    expect(res.body.scope.kind).toBe('OPERATIONAL');
    expect(res.body.cells).toHaveLength(1);
    expect(res.body.cells[0]).toMatchObject({ gridCode: 'G200', covered: true });
    expect(res.body.summary).toMatchObject({ totalCells: 1, patrolledCells: 1, coveragePercent: 100 });
  });

  it('empty result keeps summary zeroed (no NaN)', async () => {
    prisma.user.findUnique.mockResolvedValue(dyDfoUser());
    mockDyDfoDornalaDb();
    mockRaw([]);
    const res = await request(app).get('/api/coverage/grids').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ totalCells: 0, patrolledCells: 0, unpatrolledCells: 0, coveragePercent: 0, pointCount: 0 });
    expect(res.body.cells).toEqual([]);
  });
});