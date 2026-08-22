import request from 'supertest';
import { createApp } from '../app';

const release = {
  id: 'rel_1',
  versionCode: 2,
  versionName: '1.1.0',
  apkKey: '20260821/abcdef0123456789.apk',
  sha256: 'a'.repeat(64),
  sizeBytes: 12345,
  notes: 'beta 2',
  isLatest: true,
  createdAt: new Date('2026-08-21T00:00:00Z'),
};

jest.mock('../db/prisma', () => ({
  prisma: {
    appRelease: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      $transaction: undefined,
    },
    user: { findUnique: jest.fn() },
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ sub: 'user_1' }),
}));

import { prisma } from '../db/prisma';
import { verifyAccessToken } from '../lib/jwt';

type ReleaseModel = {
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  updateMany: jest.Mock;
  create: jest.Mock;
};

const appRelease = (prisma as unknown as { appRelease: ReleaseModel }).appRelease;
const dbUser = (prisma as unknown as { user: { findUnique: jest.Mock } }).user;

function stubTransaction(): void {
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    async (fn: (tx: { appRelease: Pick<ReleaseModel, 'updateMany' | 'create'> }) => Promise<unknown>) =>
      fn({ appRelease: { updateMany: appRelease.updateMany, create: appRelease.create } }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  stubTransaction();
});

describe('GET /api/app/latest', () => {
  const app = createApp();

  it('is public and returns the latest release with downloadUrl', async () => {
    appRelease.findFirst.mockResolvedValue(release);
    const res = await request(app).get('/api/app/latest');
    expect(res.status).toBe(200);
    expect(res.body.versionCode).toBe(2);
    expect(res.body.downloadUrl).toBe(`/api/uploads/${release.apkKey}`);
  });

  it('returns 404 when no release is published', async () => {
    appRelease.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/app/latest');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/app', () => {
  const app = createApp();
  const validBody = {
    versionCode: 2,
    versionName: '1.1.0',
    apkKey: '20260821/abcdef0123456789.apk',
    sha256: 'a'.repeat(64),
    sizeBytes: 12345,
    notes: 'beta 2',
  };

  function loginAsAdmin(admin: boolean): void {
    (verifyAccessToken as jest.Mock).mockReturnValue({ sub: 'user_1' });
    dbUser.findUnique.mockResolvedValue({
      id: 'user_1',
      role: admin ? 'ADMIN' : 'RANGER',
      isAdmin: false,
      isActive: true,
    });
  }

  it('rejects unauthenticated callers', async () => {
    const res = await request(app).post('/api/app').send(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin callers', async () => {
    loginAsAdmin(false);
    const res = await request(app).post('/api/app').set('Authorization', 'Bearer t').send(validBody);
    expect(res.status).toBe(403);
  });

  it('creates the release and marks it as the single latest', async () => {
    loginAsAdmin(true);
    appRelease.findUnique.mockResolvedValue(null);
    appRelease.updateMany.mockResolvedValue({ count: 0 });
    appRelease.create.mockResolvedValue(release);

    const res = await request(app).post('/api/app').set('Authorization', 'Bearer t').send(validBody);
    expect(res.status).toBe(201);
    expect(appRelease.updateMany).toHaveBeenCalledWith({ data: { isLatest: false } });
    expect(appRelease.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionCode: 2, isLatest: true }),
    });
  });

  it('validates that apkKey comes from the uploads service', async () => {
    loginAsAdmin(true);
    const res = await request(app)
      .post('/api/app')
      .set('Authorization', 'Bearer t')
      .send({ ...validBody, apkKey: '../../etc/passwd' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});
