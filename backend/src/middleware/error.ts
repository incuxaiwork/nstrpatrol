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

/** True when an error indicates the database is unreachable — an externally
 *  hosted Postgres (Railway) is intentionally transient, so instead of leaking
 *  a raw driver stack we surface a clean 503 the client can act on. */
function isDatabaseUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1001', 'P1002', 'P1003'].includes(err.code)) ||
    /\bCan't reach database server\b/i.test(msg) ||
    /\b(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connection refused|connect ETIMEDOUT)\b/i.test(msg)
  );
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

  if (isDatabaseUnavailable(err)) {
    logger.warn(`database unreachable — returning 503: ${err instanceof Error ? err.message : String(err)}`);
    res.status(503).json({
      error: {
        code: 'database_unavailable',
        message: 'The database is temporarily unavailable. Please try again in a moment.',
      },
    });
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

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Database validation failed: ' + err.message } });
    return;
  }

  logger.error(err instanceof Error ? err.stack ?? err.message : String(err));
  res.status(500).json({ error: { code: 'internal_error', message: err instanceof Error ? err.message : 'Internal server error' } });
};
