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
    user: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn() },
  },
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('./db/prisma') as {
  prisma: {
    user: { findUnique: jest.Mock; count: jest.Mock; create: jest.Mock };
  };
};

const app = createApp();

const adminRecord = {
  id: 'me',
  email: 'admin@test.gov.in',
  fullName: 'Admin',
  role: 'ADMIN',
  cader: 'DFO',
  isAdmin: true,
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  invalidateUserScope();
  // Two distinct lookups hit this mock: the auth middleware resolves the
  // requester by id ("me" → admin); the register handler checks whether the
  // NEW email already exists (only the admin's own address conflicts).
  prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id === adminRecord.id) return Promise.resolve(adminRecord);
    if (where.email != null) {
      return Promise.resolve(where.email === adminRecord.email ? adminRecord : null);
    }
    return Promise.resolve(null);
  });
});

describe('POST /api/auth/register (authenticated admin user creation)', () => {
  it('unauthenticated creation after bootstrap → 403', async () => {
    // No Authorization header: optionalAuth yields no req.user.
    prisma.user.count.mockResolvedValue(5);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.gov.in', password: 'Str0ngPass!x', fullName: 'New User', cader: 'FBO' });
    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('derives ADMIN from the DFO cader — server-side authoritative mapping', async () => {
    prisma.user.count.mockResolvedValue(5);
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'u-2', isActive: true, ...data })
    );

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer tok')
      .send({ email: 'dfo2@test.gov.in', password: 'Str0ngPass!x', fullName: 'Second DFO', cader: 'DFO' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('ADMIN');
    expect(res.body.isAdmin).toBe(true);
  });

  it('a client-suggested role is stripped and never honored (FBO stays RANGER)', async () => {
    prisma.user.count.mockResolvedValue(5);
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'u-3', isActive: true, ...data })
    );

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer tok')
      .send({
        email: 'fbo@test.gov.in',
        password: 'Str0ngPass!x',
        fullName: 'Beat Officer',
        cader: 'FBO',
        role: 'ADMIN', // must be ignored
      });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('RANGER');
    expect(res.body.isAdmin).toBe(false);

    const created = prisma.user.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(created.role).toBe('RANGER');
    expect(created.cader).toBe('FBO');
    expect(created).not.toHaveProperty('password');
    expect(String(created.passwordHash)).not.toEqual('Str0ngPass!x');
  });

  it('first-run bootstrap still promotes the very first account to ADMIN', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'u-1', isActive: true, ...data })
    );

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'first@test.gov.in', password: 'Str0ngPass!x', fullName: 'Founder', cader: 'ABO' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('ADMIN');
  });

  it('rejects weak passwords before any database write', async () => {
    prisma.user.count.mockResolvedValue(5);
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer tok')
      .send({ email: 'weak@test.gov.in', password: 'short', fullName: 'Weak', cader: 'FBO' });
    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('duplicate email → 409', async () => {
    prisma.user.count.mockResolvedValue(5);
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer tok')
      .send({ email: 'admin@test.gov.in', password: 'Str0ngPass!x', fullName: 'Dup', cader: 'FBO' });
    expect(res.status).toBe(409);
  });
});
