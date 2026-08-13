import type { Request } from 'express';

/**
 * Express 5 types route params as `string | string[]` (array params). This
 * coerces a named param back to a plain string for database lookups.
 */
export function param(req: Request, name: string): string {
  const v = req.params[name];
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

export function queryString(req: Request, name: string): string | undefined {
  const v = req.query[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const first = v[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}
