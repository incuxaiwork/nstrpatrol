import request from 'supertest';
import { createApp } from '../app';

/**
 * Tests for GET /api/patrols/live (live tracking feed) and the idempotent
 * GPS-point ingest that keeps the feed's data trustworthy when the Android
 * client re-uploads its pending set after an interrupted sync.
 */

jest.mock('../db/prisma', () => ({
  prisma: {
    patrol: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    patrolPoint: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      groupBy: jest.fn(),
    },
    stepReading: { createMany: jest.fn() },
    syncLog: { create: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    forest: { findFirst: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(),
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ sub: 'user_1' }),
}));

import { prisma } from '../db/prisma';
import { invalidateUserScope } from '../middleware/auth';

type PrismaMock = {
  patrol: { findMany: jest.Mock; upsert: jest.Mock };
  patrolPoint: { findMany: jest.Mock; createMany: jest.Mock; groupBy: jest.Mock };
  stepReading: { createMany: jest.Mock };
  syncLog: { create: jest.Mock };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  forest: { findFirst: jest.Mock; create: jest.Mock };
};
const db = prisma as unknown as PrismaMock;

const app = createApp();

const T0 = new Date('2026-08-22T04:48:14.379Z');
const P1 = [
  { t: '05:00', latitude: 12.81, longitude: 79.7 },
  { t: '05:08', latitude: 12.815, longitude: 79.704 },
  { t: '05:15', latitude: 12.82, longitude: 79.71 },
].map(({ t, ...rest }) => ({ ...rest, timestamp: new Date(`2026-08-22T${t}:00Z`) }));

function stubUser(overrides: Record<string, unknown> = {}): void {
  db.user.findUnique.mockResolvedValue({
    id: 'user_1',
    role: 'ADMIN',
    cader: 'DFO',
    isAdmin: true,
    isActive: true,
    divisionId: 'div_1',
    subDivisionId: null,
    rangeId: null,
    beatId: null,
    ...overrides,
  });
}

function point(patrolId: string, latitude: number, longitude: number, iso: string): Record<string, unknown> {
  return { patrolId, latitude, longitude, altitude: 120, speed: 1.4, bearing: 90, accuracy: 5, timestamp: new Date(iso) };
}

/** Route the two patrolPoint.findMany calls (latest + path) by query shape. */
function stubLiveQueries(opts: {
  patrols: Record<string, unknown>[];
  latest: Record<string, unknown>[];
  path: Record<string, unknown>[];
  counts: { patrolId: string; _count: { _all: number } }[];
}): void {
  db.patrol.findMany.mockResolvedValue(opts.patrols);
  db.patrolPoint.findMany.mockImplementation((args: { distinct?: unknown }) =>
    args.distinct ? Promise.resolve(opts.latest) : Promise.resolve(opts.path),
  );
  db.patrolPoint.groupBy.mockResolvedValue(opts.counts);
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
  stubUser();
});

describe('GET /api/patrols/live', () => {
  test('401 without a token', async () => {
    const res = await request(app).get('/api/patrols/live');
    expect(res.status).toBe(401);
  });

  test('division-wide admin sees all active patrols with latest fix, path and counts', async () => {
    stubLiveQueries({
      patrols: [
        {
          id: 'p1', name: 'Morning beat', type: 'WALK', status: 'ACTIVE', startedAt: T0,
          beat: 'Kalanuthala', userId: 'user_1', user: { id: 'user_1', fullName: 'Ranger Ravi' },
        },
        {
          id: 'p2', name: 'Sector sweep', type: 'VEHICLE', status: 'ACTIVE', startedAt: T0,
          beat: 'Vanur', userId: 'user_2', user: { id: 'user_2', fullName: 'Officer Priya' },
        },
      ],
      latest: [point('p2', 12.9, 79.8, '2026-08-22T05:10:00Z'), point('p1', 12.82, 79.71, '2026-08-22T05:15:00Z')],
      path: P1.map((r) => ({ patrolId: 'p1', ...r })),
      counts: [
        { patrolId: 'p1', _count: { _all: 420 } },
        { patrolId: 'p2', _count: { _all: 37 } },
      ],
    });

    const res = await request(app).get('/api/patrols/live').set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(typeof res.body.serverTime).toBe('string');
    expect(res.body.patrols).toHaveLength(2);

    const a = res.body.patrols[0];
    expect(a.id).toBe('p1');
    expect(a.ranger).toEqual({ id: 'user_1', fullName: 'Ranger Ravi' });
    expect(a.pointCount).toBe(420);
    expect(a.lastPointAt).toBe('2026-08-22T05:15:00.000Z');
    expect(a.latestPoint).toMatchObject({ lat: 12.82, lng: 79.71 });
    // Path is chronological — drawn as-is on the map.
    expect(a.path.map((f: { t: string }) => f.t)).toEqual([
      '2026-08-22T05:00:00.000Z',
      '2026-08-22T05:08:00.000Z',
      '2026-08-22T05:15:00.000Z',
    ]);

    const b = res.body.patrols[1];
    expect(b.id).toBe('p2');
    expect(b.ranger.fullName).toBe('Officer Priya');
    expect(b.lastPointAt).toBe('2026-08-22T05:10:00.000Z');
    expect(b.path).toHaveLength(0);
  });

  test('queries only ACTIVE patrols and selects one valid fix per patrol', async () => {
    stubLiveQueries({
      patrols: [{ id: 'p1', name: 'X', type: 'WALK', status: 'ACTIVE', startedAt: T0, beat: null, userId: 'user_1', user: { id: 'user_1', fullName: 'R' } }],
      latest: [], path: [], counts: [],
    });
    await request(app).get('/api/patrols/live?window=30').set('Authorization', 'Bearer t');

    const listWhere = db.patrol.findMany.mock.calls[0][0];
    expect(listWhere.where).toMatchObject({ status: 'ACTIVE' });

    const [latestQuery, pathQuery] = db.patrolPoint.findMany.mock.calls;
    expect(latestQuery[0].distinct).toEqual(['patrolId']);
    expect(latestQuery[0].orderBy).toEqual([{ patrolId: 'asc' }, { timestamp: 'desc' }]);
    // Valid-fix bounds + (0,0) sentinel exclusion live in SQL, not just JS.
    expect(latestQuery[0].where.latitude).toMatchObject({ gte: -90, lte: 90, not: 0 });
    expect(latestQuery[0].where.longitude).toMatchObject({ gte: -180, lte: 180, not: 0 });
    expect(pathQuery[0].where.timestamp.gte).toBeInstanceOf(Date);
    expect(pathQuery[0].orderBy).toEqual({ timestamp: 'asc' });
  });

  test('field user is scoped to own patrols only', async () => {
    stubUser({ id: 'user_1', role: 'RANGER', cader: 'FBO', isAdmin: false, divisionId: null, subDivisionId: null, rangeId: null, beatId: null });
    stubLiveQueries({
      patrols: [{ id: 'p1', name: 'Mine', type: 'WALK', status: 'ACTIVE', startedAt: T0, beat: null, userId: 'user_1', user: { id: 'user_1', fullName: 'Me' } }],
      latest: [], path: [], counts: [],
    });

    const res = await request(app).get('/api/patrols/live').set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    const where = db.patrol.findMany.mock.calls[0][0].where;
    // OPERATIONAL scope flattens to base + own userId (see applyPatrolWhere).
    expect(where).toMatchObject({ status: 'ACTIVE', userId: 'user_1' });
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(res.body.patrols[0].id).toBe('p1');
  });

  test('a synchronized-but-silent patrol reads as offline-capable (nulls, empty path)', async () => {
    stubLiveQueries({
      patrols: [{ id: 'p_stale', name: 'No fix yet', type: 'WALK', status: 'ACTIVE', startedAt: T0, beat: null, userId: 'user_1', user: { id: 'user_1', fullName: 'Ranger Ravi' } }],
      latest: [], path: [], counts: [],
    });

    const res = await request(app).get('/api/patrols/live').set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    const p = res.body.patrols[0];
    expect(p.lastPointAt).toBeNull();
    expect(p.latestPoint).toBeNull();
    expect(p.path).toEqual([]);
    expect(p.pointCount).toBe(0);
  });

  test('never surfaces invalid fixes or the (0,0) sentinel, even if stored', async () => {
    stubLiveQueries({
      patrols: [{ id: 'p1', name: 'X', type: 'WALK', status: 'ACTIVE', startedAt: T0, beat: null, userId: 'user_1', user: { id: 'user_1', fullName: 'R' } }],
      latest: [
        point('p1', 0, 0, '2026-08-22T05:20:00Z'),
        point('p1', 95, 79.7, '2026-08-22T05:19:00Z'),
        point('p1', 12.82, 999, '2026-08-22T05:18:00Z'),
        point('p1', 12.82, 79.71, '2026-08-22T05:15:00Z'),
      ],
      path: [
        { patrolId: 'p1', ...point('p1', 0, 0, '2026-08-22T05:16:00Z') },
        { patrolId: 'p1', ...point('p1', 12.83, 79.72, '2026-08-22T05:17:00Z') },
      ],
      counts: [{ patrolId: 'p1', _count: { _all: 3 } }],
    });

    const res = await request(app).get('/api/patrols/live').set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    const p = res.body.patrols[0];
    // Newest *valid* fix wins; sentinels and out-of-bounds rows are dropped.
    expect(p.latestPoint.lat).toBe(12.82);
    expect(p.latestPoint.lng).toBe(79.71);
    expect(p.lastPointAt).toBe('2026-08-22T05:15:00.000Z');
    expect(p.path.map((f: { lat: number }) => f.lat)).toEqual([12.83]);
  });

  test('path stays chronological even when rows arrive out of order', async () => {
    stubLiveQueries({
      patrols: [{ id: 'p1', name: 'X', type: 'WALK', status: 'ACTIVE', startedAt: T0, beat: null, userId: 'user_1', user: { id: 'user_1', fullName: 'R' } }],
      latest: [point('p1', 12.82, 79.71, '2026-08-22T05:15:00Z')],
      path: [
        { patrolId: 'p1', ...point('p1', 12.82, 79.71, '2026-08-22T05:15:00Z') },
        { patrolId: 'p1', ...point('p1', 12.81, 79.7, '2026-08-22T05:00:00Z') },
        { patrolId: 'p1', ...point('p1', 12.815, 79.704, '2026-08-22T05:08:00Z') },
      ],
      counts: [],
    });

    const res = await request(app).get('/api/patrols/live').set('Authorization', 'Bearer t');

    expect(res.body.patrols[0].path.map((f: { t: string }) => f.t)).toEqual([
      '2026-08-22T05:00:00.000Z',
      '2026-08-22T05:08:00.000Z',
      '2026-08-22T05:15:00.000Z',
    ]);
  });

  test('rejects out-of-range window parameter', async () => {
    const res = await request(app).get('/api/patrols/live?window=999').set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
  });
});

describe('GPS point ingest dedupe (POST /api/sync/upload)', () => {
  function uploadBatch(records: Record<string, unknown>[]): Promise<request.Response> {
    return request(app)
      .post('/api/sync/upload')
      .set('Authorization', 'Bearer t')
      .send({
        deviceId: 'device_1',
        patrolId: 'pat1',
        batches: [{ entity: 'points', records }],
      });
  }

  function devicePoint(latitude: number, longitude: number, timestampMs: number): Record<string, unknown> {
    return { patrolId: 'pat1', latitude, longitude, accuracy: 4, timestamp: timestampMs };
  }

  beforeEach(() => {
    // Ownership check: pat1 belongs to user_1.
    db.patrol.findMany.mockResolvedValue([{ id: 'pat1', userId: 'user_1' }]);
    db.syncLog.create.mockResolvedValue({});
  });

  test('first upload inserts every record', async () => {
    db.patrolPoint.findMany.mockResolvedValue([]);
    db.patrolPoint.createMany.mockResolvedValue({ count: 2 });

    const res = await uploadBatch([devicePoint(12.81, 79.7, 1000), devicePoint(12.815, 79.704, 2000)]);

    expect(res.status).toBe(201);
    expect(res.body.results[0]).toEqual({ entity: 'points', inserted: 2 });
    expect(db.patrolPoint.createMany).toHaveBeenCalledTimes(1);
  });

  test('re-uploading the same batch after an interrupted sync inserts nothing', async () => {
    // Both fixes already exist server-side (previous attempt persisted them
    // before the client crashed mid-sync).
    db.patrolPoint.findMany.mockResolvedValue([
      { patrolId: 'pat1', timestamp: new Date(1000) },
      { patrolId: 'pat1', timestamp: new Date(2000) },
    ]);
    db.patrolPoint.createMany.mockResolvedValue({ count: 0 });

    const res = await uploadBatch([devicePoint(12.81, 79.7, 1000), devicePoint(12.815, 79.704, 2000)]);

    expect(res.status).toBe(201);
    expect(res.body.totalInserted).toBe(0);
    expect(db.patrolPoint.createMany).not.toHaveBeenCalled();
  });

  test('collapses duplicates inside a single batch', async () => {
    db.patrolPoint.findMany.mockResolvedValue([]);
    db.patrolPoint.createMany.mockResolvedValue({ count: 1 });

    const res = await uploadBatch([
      devicePoint(12.81, 79.7, 1000),
      devicePoint(12.81, 79.7, 1000),
      devicePoint(12.81, 79.7, 1000),
    ]);

    expect(res.status).toBe(201);
    expect(res.body.results[0].inserted).toBe(1);
    const data = db.patrolPoint.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
  });

  test('partial overlap inserts only the genuinely new fixes', async () => {
    db.patrolPoint.findMany.mockResolvedValue([{ patrolId: 'pat1', timestamp: new Date(1000) }]);
    db.patrolPoint.createMany.mockResolvedValue({ count: 1 });

    const res = await uploadBatch([
      devicePoint(12.81, 79.7, 1000),
      devicePoint(12.82, 79.71, 3000),
    ]);

    expect(res.status).toBe(201);
    expect(res.body.results[0].inserted).toBe(1);
    const data = db.patrolPoint.createMany.mock.calls[0][0].data;
    expect((data[0].timestamp as Date).getTime()).toBe(3000);
  });

  test('other telemetry entities keep plain insert semantics (no dedupe)', async () => {
    db.stepReading.createMany.mockResolvedValue({ count: 2 });

    const res = await request(app)
      .post('/api/sync/upload')
      .set('Authorization', 'Bearer t')
      .send({
        batches: [{
          entity: 'step-readings',
          records: [
            { patrolId: 'pat1', steps: 10, timestamp: 1000 },
            { patrolId: 'pat1', steps: 10, timestamp: 1000 },
          ],
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.results[0].inserted).toBe(2);
    expect(db.patrolPoint.findMany).not.toHaveBeenCalled();
  });

  test('out-of-bounds coordinates are rejected at validation', async () => {
    const res = await uploadBatch([devicePoint(95, 79.7, 1000)]);
    expect(res.status).toBe(400);
  });
});
