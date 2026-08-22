import request from 'supertest';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createApp } from '../app';

jest.mock('../db/prisma', () => ({
  prisma: {},
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

describe('GET /api/uploads/*key', () => {
  const app = createApp();

  beforeAll(async () => {
    // Force disk storage so roundtrips do not depend on S3 credentials.
    process.env.S3_BUCKET = '';
    process.env.STORAGE_DIR = await mkdtemp(path.join(tmpdir(), 'uploads-test-'));
  });

  it('serves a stored file by multi-segment key (Express 5 array params)', async () => {
    const { storeBuffer } = await import('../services/storage');
    const { key } = await storeBuffer(Buffer.from('hello-photo'), 'jpg');

    const res = await request(app).get(`/api/uploads/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.body).toEqual(Buffer.from('hello-photo'));
  });

  it('returns 404 (not 400) for a well-formed unknown key', async () => {
    const res = await request(app).get('/api/uploads/20260101/abcdef0123456789.jpg');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('returns 400 for a malformed key', async () => {
    const res = await request(app).get('/api/uploads/%2e%2e%2fetc%2fpasswd');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_key');
  });
});
