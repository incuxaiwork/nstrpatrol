"use client";

/**
 * Deferred loader for the maplibre-gl MapWorkspace. Splits the ~1.5 MB
 * maplibre bundle out of every page that shows a map; only the GIS page
 * pays the full cost up front.
 */

import dynamic from "next/dynamic";
import type { MapProps } from "@/components/map";

export const MapWorkspace = dynamic(
  () => import("@/components/map").then((m) => m.MapWorkspace),
  {
    ssr: false,
    loading: () => (
      <div
        aria-busy="true"
        className="flex h-full min-h-64 w-full items-center justify-center rounded-card border border-line bg-surface text-sm text-ink-soft"
      >
        Loading map…
      </div>
    ),
  }
);

export type { GridRegionFilter } from "@/components/map";

export type { MapProps };