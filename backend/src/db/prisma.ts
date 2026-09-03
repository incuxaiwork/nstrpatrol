import { PrismaClient } from '@prisma/client';

/**
 * Connection resilience for an externally-hosted Postgres (Railway).
 *   • Single global instance — dev watch and hot reloads never open duplicate
 *     pools / exhaust PG connections.
 *   • connect_timeout: the Prisma engine fails a query fast (instead of
 *     hanging the request) when the DB host is unreachable.
 *   • The engine's pool auto-reconnects, so a transient outage recovers on the
 *     next query once the host is reachable again — the server never needs a
 *     manual restart to come back.
 */
const BASE_URL = process.env.DATABASE_URL ?? '';
const connectionUrl = appendConnectTimeout(BASE_URL);

export const prisma = new PrismaClient({
  datasources: { db: { url: connectionUrl } },
  log: process.env.NODE_ENV === 'test' ? [] : ['warn', 'error'],
});

/** Add/override `connect_timeout` (seconds) on the connection URL so a query
 *  against a down host times out quickly. Leaves the original URL untouched
 *  in env so Prisma CLI / migrations keep working. */
function appendConnectTimeout(url: string): string {
  if (!url) return url;
  const hasQuery = url.includes('?');
  const sep = hasQuery ? '&' : '?';
  return `${url}${sep}connect_timeout=10`;
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** True when an error indicates the DB host was unreachable (transient). */
function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /\bCan't reach database server\b/i.test(msg) ||
    /\b(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connection refused|ETIMEDOUT)\b/i.test(msg)
  );
}

/** Wrap a Prisma query with a small bounded retry for transient connectivity
 *  blips (externally-hosted Railway Postgres). A down host that recovers
 *  within the window succeeds instead of failing the request outright. */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 200,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastErr;
}
