import request from 'supertest';
import { createApp } from '../src/app';

jest.mock('../src/db/prisma', () => ({
  prisma: {},
  checkDatabase: jest.fn().mockResolvedValue(true),
}));

describe('app', () => {
  const app = createApp();

  it('GET /api returns service info', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('NSTR Patrol API');
  });

  it('GET /api/health returns ok when database is reachable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });
});
