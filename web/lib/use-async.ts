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
  /** Polling interval in ms. */
  intervalMs?: number;
}

/**
 * Minimal async-data hook: manages loading / error / data lifecycle for the
 * service layer. When `cacheKey` is provided, reads from the route-level
 * cache on mount so pages render instantly with previously-fetched data
 * while revalidating in the background. Supports optional background polling.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  optsOrInterval?: UseAsyncDataOpts | number
) {
  const pathname = usePathname();
  const opts = typeof optsOrInterval === "number" ? { intervalMs: optsOrInterval } : optsOrInterval;
  const cacheKey = opts?.cacheKey;
  const skipCache = opts?.skipCache;
  const intervalMs = opts?.intervalMs;

  // Check route cache synchronously (before first render) to avoid skeleton flash.
  const cachedData = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    if (skipCache || !cacheKey) return undefined;
    return getStaleData<T>(pathname, cacheKey);
  }, [pathname, cacheKey, skipCache]);

  const [data, setData] = useState<T | undefined>(cachedData);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(!cachedData);
  const [tick, setTick] = useState(0);

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

    if (hasLoaded.current && cachedData) {
      setLoading(false);
      run();
    } else {
      setLoading(true);
      run();
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs && intervalMs > 0) {
      timer = setInterval(() => {
        loader()
          .then((d) => {
            if (alive) {
              setData(d);
              setError(undefined);
            }
          })
          .catch((e: unknown) => {
            if (alive) setError(e instanceof Error ? e : new Error(String(e)));
          });
      }, intervalMs);
    }

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, intervalMs, ...deps]);

  return { data, error, loading, reload };
}

