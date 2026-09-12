"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getStaleData, setRouteData } from "@/lib/route-cache";

interface UseAsyncDataOpts {
  /** When set, the hook reads/writes to the route cache under this key. */
  cacheKey?: string;
  /** TTL for route cache reads (default 120s). */
  cacheTtlMs?: number;
  /** Skip route cache entirely (e.g. live feeds). */
  skipCache?: boolean;
}

/**
 * Minimal async-data hook: manages loading / error / data lifecycle for the
 * service layer. When `cacheKey` is provided, reads from the route-level
 * cache on mount so pages render instantly with previously-fetched data
 * while revalidating in the background.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  opts?: UseAsyncDataOpts,
) {
  const pathname = usePathname();
  const cacheKey = opts?.cacheKey;
  const skipCache = opts?.skipCache;
  const cacheTtlMs = opts?.cacheTtlMs;

  // Check route cache synchronously (before first render) to avoid skeleton flash.
  // Guard with `window` check so server and client start with identical state —
  // the module-level Map is per-request on the server but persists across
  // navigations on the client (where prefetch may have already populated it).
  const cachedData = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    if (skipCache || !cacheKey) return undefined;
    return getStaleData<T>(pathname, cacheKey);
  }, [pathname, cacheKey, skipCache]);

  const [data, setData] = useState<T | undefined>(cachedData);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(!cachedData);
  const [tick, setTick] = useState(0);

  // Track whether the mount fetch has completed at least once (for SWR).
  const hasLoaded = useRef(Boolean(cachedData));
  const mountedRef = useRef(true);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let alive = true;

    const run = async () => {
      try {
        const d = await loader();
        if (!alive) return;
        setData(d);
        setError(undefined);
        // Write to route cache so future navigations to this path are instant.
        if (cacheKey && !skipCache) {
          setRouteData(pathname, cacheKey, d);
        }
        hasLoaded.current = true;
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (alive) setLoading(false);
      }
    };

    // If we have cached data and this is not the first load,
    // render cached immediately, fetch in background (no skeleton).
    if (hasLoaded.current && cachedData) {
      setLoading(false);
      run();
    } else {
      setLoading(true);
      run();
    }

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, error, loading, reload };
}
