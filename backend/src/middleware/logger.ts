import { pinoHttp } from 'pino-http';

export const pino = pinoHttp({
  quietReqLogger: true,
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  autoLogging: { ignore: (req) => req.url === '/health' },
});

export const httpLogger = pino;
export const logger = pino.logger;
