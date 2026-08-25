/**
 * Route-level data cache — survives component unmounts across navigations.
 *
 * Pages write their fetched data here; `useAsyncData` reads from here on
 * mount so pages render instantly with previously-fetched data while
 * refreshing in the background (stale-while-revalidate).
 *
 * Keys are `pathname::cacheKey` (e.g. "/patrols::list", "/patrols::roster").
 */

interface CacheEntry<T = unknown> {
  data: T;
  at: number;
}

const store = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 120_000; // 2 minutes

/** Write data into the route cache. */
export function setRouteData<T>(pathname: string, cacheKey: string, data: T): void {
  store.set(`${pathname}::${cacheKey}`, { data, at: Date.now() });
}

/**
 * Read cached data if it exists and hasn't expired.
 * Returns `undefined` on miss or stale entry.
 */
export function getRouteData<T>(pathname: string, cacheKey: string, ttlMs = DEFAULT_TTL_MS): T | undefined {
  const entry = store.get(`${pathname}::${cacheKey}`) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.at > ttlMs) return undefined;
  return entry.data;
}

/** Read cached data regardless of age (for stale-while-revalidate). */
export function getStaleData<T>(pathname: string, cacheKey: string): T | undefined {
  const entry = store.get(`${pathname}::${cacheKey}`) as CacheEntry<T> | undefined;
  return entry?.data;
}

/** Check if a valid (non-stale) cache entry exists. */
export function hasFreshData(pathname: string, cacheKey: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const entry = store.get(`${pathname}::${cacheKey}`);
  if (!entry) return false;
  return Date.now() - entry.at <= ttlMs;
}

/** Clear all route cache entries. */
export function clearRouteCache(): void {
  store.clear();
}

/** Clear cache entries matching a pathname prefix. */
export function clearRouteCacheFor(pathname: string): void {
  const prefix = `${pathname}::`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
