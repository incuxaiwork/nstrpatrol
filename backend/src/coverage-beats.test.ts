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
    mapAsset: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../src/db/prisma') as {
  prisma: {
    user: { findUnique: jest.Mock };
    range: { findUnique: jest.Mock; findMany: jest.Mock };
    beat: { findUnique: jest.Mock; findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
};

const app = createApp();

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

function fsoUser() {
  return {
    id: 'me',
    email: 'fso@test.gov.in',
    fullName: 'FSO',
    role: 'RANGER',
    cader: 'FSO',
    isAdmin: false,
    isActive: true,
    divisionId: 'PT_MARKAPUR',
    subDivisionId: null,
    rangeId: null,
    beatId: null,
  };
}

interface SqlLike {
  strings: string[];
  values: unknown[];
}

/** $queryRaw is invoked as a tagged template; flatten nested Prisma.Sql fragments. */
function renderSql(piece: unknown): string {
  if (piece && typeof piece === 'object' && Array.isArray((piece as SqlLike).strings)) {
    const frag = piece as SqlLike;
    return frag.strings.reduce((out, next, i) => {
      const val = frag.values[i];
      return val === undefined ? out + next : out + renderSql(val) + next;
    }, '');
  }
  return String(piece);
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
});

describe('GET /api/gis/ranges', () => {
  it('serves the derived range FeatureCollection (public layer)', async () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'range-DORNAL',
          geometry: { type: 'MultiPolygon', coordinates: [] },
          properties: { Range: 'DORNAL', beatCount: 4, Area_ha: 1200 },
        },
      ],
    };
    prisma.$queryRaw.mockResolvedValue([{ geojson: JSON.stringify(fc) }]);
    const res = await request(app).get('/api/gis/ranges');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features[0].properties.Range).toBe('DORNAL');
    const sql = prisma.$queryRaw.mock.calls[0][0][0] as string;
    expect(sql).toContain('ST_Union(b.geom)');
    expect(sql).toContain('GROUP BY b."rangeName"');
  });

  it('/api/gis/ranges is cached — a second request serves the same body without re-querying', async () => {
    prisma.$queryRaw.mockClear();
    const res = await request(app).get('/api/gis/ranges');
    expect(res.status).toBe(200);
    expect(res.body.features[0]?.properties.Range).toBe('DORNAL');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('GET /api/coverage/beats', () => {
  function beatRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      beat: 'CHILAKACHERLA',
      rangeName: 'DORNAL',
      totalCells: 10,
      patrolledCells: 4,
      pointCount: 12n,
      lastPatrolledAt: new Date('2026-08-20T07:30:00Z'),
      ...over,
    };
  }

  /** Raw mock that short-circuits the coverage capability probe query. */
  function mockCoverageRaw(rows: unknown[]) {
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = renderSql({ strings, values });
      if (/pg_attribute/.test(sql)) return Promise.resolve([{ ok: true }]);
      return Promise.resolve(rows);
    });
  }

  it('DFO sees every beat with per-beat coverage and zero-patrol summary', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockCoverageRaw([
      beatRow(),
      beatRow({ beat: 'BURUGUNDALA', patrolledCells: 0, pointCount: 0n, lastPatrolledAt: null }),
    ]);
    const res = await request(app).get('/api/coverage/beats').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.scope.kind).toBe('DIVISION');
    expect(res.body.summary).toMatchObject({
      beats: 2,
      totalCells: 20,
      patrolledCells: 4,
      unpatrolledCells: 16,
      zeroPatrolBeats: 1,
      pointCount: 12,
    });
    expect(res.body.rows[0]).toMatchObject({
      beat: 'CHILAKACHERLA',
      totalCells: 10,
      patrolledCells: 4,
      coveragePercent: 40,
      pointCount: 12,
    });
    expect(res.body.rows[0].lastPatrolledAt).toBe('2026-08-20T07:30:00.000Z');
    // A beat with grid cells but zero patrolled cells reports null-free 0%.
    expect(res.body.rows[1]).toMatchObject({ beat: 'BURUGUNDALA', patrolledCells: 0, coveragePercent: 0 });
  });

  it('beat with no intersecting cells has null coveragePercent (no fabricated 0%)', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    mockCoverageRaw([beatRow({ totalCells: 0, patrolledCells: 0, pointCount: 0n })]);
    const res = await request(app).get('/api/coverage/beats').set('Authorization', 'Bearer tok');
    expect(res.body.rows[0].coveragePercent).toBeNull();
    expect(res.body.summary.zeroPatrolBeats).toBe(0);
  });

  it('OPERATIONAL users only see beats their own patrols touched', async () => {
    prisma.user.findUnique.mockResolvedValue(fsoUser());
    mockCoverageRaw([
      beatRow({ beat: 'TOUCHED', patrolledCells: 2 }),
      beatRow({ beat: 'UNTOUCHED', patrolledCells: 0, pointCount: 0n, lastPatrolledAt: null }),
    ]);
    const res = await request(app).get('/api/coverage/beats').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: { beat: string }) => r.beat)).toEqual(['TOUCHED']);
    const calls = prisma.$queryRaw.mock.calls;
    const call = calls[calls.length - 1];
    const sql = renderSql({ strings: call[0], values: call.slice(1) });
    expect(sql).toContain('p."userId" =');
  });

  it('range filter restricts the cell universe to that range’s beats', async () => {
    prisma.user.findUnique.mockResolvedValue(dfoUser());
    prisma.range.findUnique.mockResolvedValue({ id: 'r-1', name: 'Y.PALEM' });
    prisma.beat.findMany.mockResolvedValue([{ name: 'AKKAPALEM' }]);
    mockCoverageRaw([]);
    const res = await request(app).get('/api/coverage/beats?rangeId=r-1').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([]);
    const calls = prisma.$queryRaw.mock.calls;
    const call = calls[calls.length - 1];
    const flat = JSON.stringify(call);
    expect(flat).toContain('AKKAPALEM');
  });

  it('unauthenticated → 401 and no query runs', async () => {
    const res = await request(app).get('/api/coverage/beats');
    expect(res.status).toBe(401);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
