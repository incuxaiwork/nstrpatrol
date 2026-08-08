import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { GeoValidationError } from '../lib/geo';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.issues,
      },
    });
    return;
  }

  if (err instanceof GeoValidationError) {
    res.status(422).json({ error: { code: 'invalid_geometry', message: err.message } });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { code: 'conflict', message: 'A record with that value already exists' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: { code: 'conflict', message: 'Related record does not exist' } });
      return;
    }
  }

  logger.error(err instanceof Error ? err.stack ?? err.message : String(err));
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
};
