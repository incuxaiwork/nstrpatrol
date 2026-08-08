import { Router } from 'express';
import { healthRouter } from './health';
import { gisRouter } from './gis';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({ name: 'NSTR Patrol API', version: '0.0.1' });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/gis', gisRouter);