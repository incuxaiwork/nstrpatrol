import { Router } from 'express';
import { checkDatabase } from '../db/prisma';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const dbOk = await checkDatabase();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'unreachable',
  });
});
