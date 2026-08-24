import request from 'supertest';
import { createApp } from '../app';

/**
 * Tests for POST /api/patrols/:id/complete — metric persistence and the
 * ended-at sanitization that guards against devices whose session clocks
 * "ended" a patrol before its own GPS trace (prod incident 18e9044a).
 */

jest.mock('../db/prisma', () => ({
  prisma: {
    patrol: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), findMany: jest.fn() },
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ sub: 'user_1' }),
}));

import { prisma } from '../db/prisma';
import { invalidateUserScope } from '../middleware/auth';

const patrolFindUnique = (prisma as unknown as { patrol: { findUnique: jest.Mock } }).patrol.findUnique;
const patrolUpdate = (prisma as unknown as { patrol: { update: jest.Mock } }).patrol.update;
const queryRaw = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
const dbUser = (prisma as unknown as { user: { findUnique: jest.Mock } }).user;

const app = createApp();

const START = new Date('2026-08-22T04:48:14.379Z');
const LAST_POINT = new Date('2026-08-22T05:15:50Z');

function stubAdmin(): void {
  dbUser.findUnique.mockResolvedValue({
    id: 'user_1',
    role: 'ADMIN',
    cader: 'DFO',
    isAdmin: true,
    isActive: true,
    divisionId: 'div_1',
    subDivisionId: null,
    rangeId: null,
    beatId: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
  stubAdmin();
  patrolFindUnique.mockResolvedValue({
    id: 'p1',
    userId: 'user_1',
    beat: 'Kalanuthala',
    startedAt: START,
  });
  // Division-wide admin sees every patrol.
  (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany.mockResolvedValue([
    { id: 'user_1' },
  ]);
});

function expectUpdateData(expected: Record<string, unknown>): void {
  const data = patrolUpdate.mock.calls[0][0].data;
  for (const [k, v] of Object.entries(expected)) {
    expect(data[k]).toEqual(v);
  }
}

describe('POST /api/patrols/:id/complete', () => {
  test('persists device metrics when provided', async () => {
    queryRaw.mockResolvedValue([{ t: LAST_POINT }]);
    patrolUpdate.mockResolvedValue({ status: 'COMPLETED', endedAt: LAST_POINT });

    const res = await request(app).post('/api/patrols/p1/complete').set('Authorization', 'Bearer t').send({
      totalSteps: 3210,
      moveMinutes: 27,
      avgSpeedKmh: 9.1,
      caloriesEstimate: 145.5,
      heartPointsEstimate: 22,
      detectedMethod: 'WALK',
    });

    expect(res.status).toBe(200);
    expect(patrolUpdate).toHaveBeenCalledTimes(1);
    expectUpdateData({
      status: 'COMPLETED',
      totalSteps: 3210,
      moveMinutes: 27,
      avgSpeedKmh: 9.1,
      detectedMethod: 'WALK',
    });
  });

  test('rejects an endedAt earlier than startedAt and falls back to last point', async () => {
    // Device clock corruption: ended 2.7 s after start despite a 28-min trace.
    queryRaw.mockResolvedValue([{ t: LAST_POINT }]);
    patrolUpdate.mockResolvedValue({ status: 'COMPLETED' });

    const res = await request(app)
      .post('/api/patrols/p1/complete')
      .set('Authorization', 'Bearer t')
      .send({ endedAt: new Date('2026-08-22T04:48:17.153Z').toISOString() });

    expect(res.status).toBe(200);
    const data = patrolUpdate.mock.calls[0][0].data;
    expect((data.endedAt as Date).getTime()).toBe(LAST_POINT.getTime());
  });

  test('never lets endedAt precede the last recorded point', async () => {
    queryRaw.mockResolvedValue([{ t: LAST_POINT }]);
    patrolUpdate.mockResolvedValue({ status: 'COMPLETED' });

    // Ended mid-trace (device claimed end before points stopped arriving).
    const res = await request(app)
      .post('/api/patrols/p1/complete')
      .set('Authorization', 'Bearer t')
      .send({ endedAt: new Date('2026-08-22T05:00:00Z').toISOString() });

    expect(res.status).toBe(200);
    const data = patrolUpdate.mock.calls[0][0].data;
    expect((data.endedAt as Date).getTime()).toBe(LAST_POINT.getTime());
  });

  test('plain complete without body still completes using the point span', async () => {
    queryRaw.mockResolvedValue([{ t: LAST_POINT }]);
    patrolUpdate.mockResolvedValue({ status: 'COMPLETED' });

    const res = await request(app).post('/api/patrols/p1/complete').set('Authorization', 'Bearer t').send({});

    expect(res.status).toBe(200);
    const data = patrolUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('COMPLETED');
    expect((data.endedAt as Date).getTime()).toBe(LAST_POINT.getTime());
    // Metrics absent from the body must NOT overwrite stored values with nulls.
    expect(data.totalSteps).toBeUndefined();
    expect(data.moveMinutes).toBeUndefined();
    expect(data.avgSpeedKmh).toBeUndefined();
  });
});
