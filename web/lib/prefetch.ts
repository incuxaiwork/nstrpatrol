/**
 * Route prefetch registry — maps nav routes to their data-loading functions.
 * Called by the sidebar on hover so data is in the route cache before the
 * user clicks through.
 */

import { setRouteData } from "@/lib/route-cache";
import { patrols, rangers, hierarchy, observations, sos as sosService, analytics, gis } from "@/lib/services";

type PrefetchEntry = { cacheKey: string; loader: () => Promise<unknown> };

function defineRoute(path: string, entries: PrefetchEntry[]) {
  return { path, entries };
}

/** Inflight dedup — don't fire the same loader twice concurrently. */
const inflight = new Map<string, Promise<unknown>>();

async function runLoader(cacheKey: string, loader: () => Promise<unknown>): Promise<void> {
  if (inflight.has(cacheKey)) return;
  const p = loader()
    .then((data) => {
      setRouteData("/", cacheKey, data); // pathname resolved at call time
      inflight.delete(cacheKey);
    })
    .catch(() => {
      inflight.delete(cacheKey);
    });
  inflight.set(cacheKey, p);
}

const routes = [
  defineRoute("/sos", [
    { cacheKey: "sos:cases", loader: () => sosService.cases() },
    { cacheKey: "sos:feed", loader: () => sosService.feed() },
  ]),
  defineRoute("/patrols", [
    { cacheKey: "patrols:list", loader: () => patrols.list() },
    { cacheKey: "patrols:roster", loader: () => rangers.list() },
    { cacheKey: "patrols:hierarchy", loader: () => hierarchy.units() },
  ]),
  defineRoute("/patrols/history", [
    { cacheKey: "patrols:list", loader: () => patrols.list() },
  ]),
  defineRoute("/patrols/reports", [
    { cacheKey: "patrols:reports", loader: () => patrols.reports() },
  ]),
  defineRoute("/patrols/permissions", [
    // authorizations are in-memory mock, always instant
  ]),
  defineRoute("/rangers", [
    { cacheKey: "rangers:list", loader: () => rangers.list() },
  ]),
  defineRoute("/rangers/teams", [
    { cacheKey: "rangers:teams", loader: () => rangers.teams() },
    { cacheKey: "rangers:list", loader: () => rangers.list() },
  ]),
  defineRoute("/rangers/vehicles", [
    { cacheKey: "rangers:vehicles", loader: () => rangers.vehicles() },
  ]),
  defineRoute("/rangers/weapons", [
    { cacheKey: "rangers:weapons", loader: () => rangers.weapons() },
  ]),
  defineRoute("/rangers/equipment", [
    { cacheKey: "rangers:equipment", loader: () => rangers.equipment() },
  ]),
  defineRoute("/observations", [
    { cacheKey: "observations:list", loader: () => observations.list() },
  ]),
  defineRoute("/observations/list", [
    { cacheKey: "observations:list", loader: () => observations.list() },
  ]),
  defineRoute("/gis", [
    { cacheKey: "gis:spatial", loader: () => gis.spatial() },
    { cacheKey: "gis:markers", loader: () => gis.markers() },
    { cacheKey: "gis:routes", loader: () => gis.routes() },
    { cacheKey: "gis:live", loader: () => gis.live() },
  ]),
  defineRoute("/analytics", [
    { cacheKey: "analytics:weekly", loader: () => analytics.weeklyTrend() },
    { cacheKey: "analytics:monthly", loader: () => analytics.monthly() },
    { cacheKey: "analytics:wildlife", loader: () => analytics.wildlife() },
    { cacheKey: "analytics:humanImpact", loader: () => analytics.humanImpact() },
    { cacheKey: "analytics:waterBodies", loader: () => analytics.waterBodies() },
    { cacheKey: "analytics:mortality", loader: () => analytics.mortality() },
    { cacheKey: "analytics:beatCoverage", loader: () => analytics.beatCoverage() },
    { cacheKey: "analytics:heatmap", loader: () => analytics.heatmap() },
    { cacheKey: "analytics:jurisdiction", loader: () => analytics.jurisdiction() },
  ]),
  defineRoute("/analytics/rangers", [
    { cacheKey: "analytics:weekly", loader: () => analytics.weeklyTrend() },
    { cacheKey: "analytics:wildlife", loader: () => analytics.wildlife() },
    { cacheKey: "analytics:mortality", loader: () => analytics.mortality() },
  ]),
  defineRoute("/analytics/beats", [
    { cacheKey: "analytics:weekly", loader: () => analytics.weeklyTrend() },
    { cacheKey: "analytics:beatCoverage", loader: () => analytics.beatCoverage() },
  ]),
  defineRoute("/analytics/ranges", [
    { cacheKey: "analytics:weekly", loader: () => analytics.weeklyTrend() },
    { cacheKey: "analytics:monthly", loader: () => analytics.monthly() },
  ]),
  defineRoute("/analytics/divisions", [
    { cacheKey: "analytics:weekly", loader: () => analytics.weeklyTrend() },
    { cacheKey: "analytics:comparison", loader: () => analytics.comparison() },
  ]),
  defineRoute("/work-analytics", []),
];

const routeMap = new Map(routes.map((r) => [r.path, r.entries]));

/** Resolve a pathname to its closest matching prefetch route. */
function resolveEntries(pathname: string): PrefetchEntry[] {
  // Exact match first
  const exact = routeMap.get(pathname);
  if (exact) return exact;

  // Find the longest prefix match (e.g. /patrols/abc123 → /patrols)
  let best = "";
  for (const key of routeMap.keys()) {
    if (pathname.startsWith(key + "/") && key.length > best.length) {
      best = key;
    }
  }
  return best ? routeMap.get(best)! : [];
}

/** Fires prefetch loaders for the given pathname. Non-blocking. */
export function prefetchRoute(pathname: string): void {
  const entries = resolveEntries(pathname);
  for (const entry of entries) {
    // Write with the target pathname so cache keys are correct.
    const prefixedKey = `${pathname}::${entry.cacheKey}`;
    if (inflight.has(prefixedKey)) continue;
    const p = entry.loader()
      .then((data) => {
        setRouteData(pathname, entry.cacheKey, data);
        inflight.delete(prefixedKey);
      })
      .catch(() => {
        inflight.delete(prefixedKey);
      });
    inflight.set(prefixedKey, p);
  }
}
