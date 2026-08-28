"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Minimal async-data hook: manages loading / error / data lifecycle for the
 * service layer. Supports optional background polling via intervalMs.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs?: number
) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    loader()
      .then((d) => {
        if (alive) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

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
          .catch((e: Error) => {
            if (alive) setError(e);
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
