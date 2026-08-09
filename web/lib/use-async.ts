"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Minimal async-data hook: manages loading / error / data lifecycle for the
 * service layer. Swap for a data-fetching library only if the project adopts
 * one later.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    loader()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, error, loading, reload };
}