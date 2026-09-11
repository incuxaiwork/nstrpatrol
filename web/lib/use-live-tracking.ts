"use client";

/**
 * Live-tracking polling for the GIS workspace (GET /api/patrols/live).
 *
 * Deliberately plain setInterval polling — no WebSocket infrastructure exists
 * in this project. Guarantees:
 *   • ONE interval per mounted consumer; cleaned up on unmount (leaving /gis
 *     stops the feed entirely).
 *   • No overlapping requests: an in-flight poll blocks re-entry, and the
 *     shared API layer additionally dedupes identical concurrent GETs.
 *   • The browser tab being hidden pauses polling (visibilitychange); return
 *     triggers an immediate refresh when the feed is due.
 *   • The endpoint is fetched with ttl 0 (api.patrols.live) so the shared
 *     30 s GET cache can never serve a stale "live" response.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { gis, type GisLiveFeed } from "@/lib/services";

/** Poll cadence — inside the required 10–15 s window. */
export const LIVE_POLL_MS = 12_000;

/** Freshness thresholds applied to REAL GPS timestamps (never fetch time):
 *  <30 s current ("live"), 30–90 s stale, otherwise offline. */
export const LIVE_FRESH_MS = 30_000;
export const LIVE_STALE_MS = 90_000;

export interface LiveTrackingState {
  feed: GisLiveFeed | null;
  error: Error | null;
  /** True while a poll is in flight (initial load included). */
  fetching: boolean;
  /** Client clock (ms) of the last SUCCESSFUL fetch — drives "updated Xs ago". */
  lastFetchedAt: number | null;
  refresh: () => Promise<void>;
}

export function useLiveTracking(): LiveTrackingState {
  const [feed, setFeed] = useState<GisLiveFeed | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fetching, setFetching] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setFetching(true);
    try {
      const next = await gis.live();
      setFeed(next);
      setError(null);
      setLastFetchedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      inflight.current = false;
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    // Kick off the first poll as a macrotask rather than synchronously in the
    // effect body — avoids cascading renders on mount (react-hooks/
    // set-state-in-effect) without changing when data actually arrives.
    const kickoff = setTimeout(() => {
      void load();
    }, 0);
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, LIVE_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(kickoff);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  return { feed, error, fetching, lastFetchedAt, refresh: load };
}

/**
 * Re-render ticker for relative timestamps ("updated X seconds ago"). Ticks
 * every `ms` while mounted only.
 */
export function useTicker(ms = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type FixFreshness = "current" | "stale" | "none";

/**
 * Honest freshness of a GPS fix against this browser's clock, adjusted by
 * the server-clock skew captured at fetch time. A fix whose timestamp cannot
 * be parsed reads as "none" — never silently "current".
 */
export function fixFreshness(fixAt: string | null, skewMs: number, now: number): FixFreshness {
  if (!fixAt || !Number.isFinite(skewMs)) return "none";
  const t = new Date(fixAt).getTime();
  if (!Number.isFinite(t)) return "none";
  const age = now - (t + skewMs);
  if (!Number.isFinite(age)) return "none";
  if (age < LIVE_FRESH_MS) return "current";
  if (age <= LIVE_STALE_MS) return "stale";
  return "none";
}
