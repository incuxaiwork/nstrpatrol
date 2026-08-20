import { Router } from 'express';
import { healthRouter } from './health';
import { gisRouter } from './gis';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { devicesRouter } from './devices';
import { forestsRouter } from './forests';
import { mapRouter } from './map';
import { patrolsRouter } from './patrols';
import { telemetryRouter } from './telemetry';
import { incidentsRouter } from './incidents';
import { syncRouter } from './sync';
import { sosRouter, alertsRouter } from './sos';
import { optionsRouter } from './options';
import { uploadsRouter } from './uploads';
import { coverageRouter } from './coverage';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({ name: 'NSTR Patrol API', version: '0.0.1' });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/gis', gisRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/devices', devicesRouter);
apiRouter.use('/forests', forestsRouter);
apiRouter.use('/map', mapRouter);
apiRouter.use('/patrols', patrolsRouter);
apiRouter.use('/telemetry', telemetryRouter);
apiRouter.use('/incidents', incidentsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/sos', sosRouter);
apiRouter.use('/alerts', alertsRouter);
apiRouter.use('/options', optionsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/coverage', coverageRouter);