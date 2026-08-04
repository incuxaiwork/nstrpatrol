import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/error';
import { httpLogger } from './middleware/logger';
import { apiRouter } from './routes';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(httpLogger);
  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
