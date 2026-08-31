"use client";

/**
 * Patrol replay (PRD §6 — Patrol Replay): spatial timeline playback of a
 * patrol's route. Playback controls live on the map; the side panel shows
 * the event log in the original sequence and stays in sync with playback.
 * Routes are replayed from the GIS trace when available, otherwise from the
 * recorded GPS fixes (patrol.route).
 */

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { gis, patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { StatRow } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { MapWorkspace } from "@/components/map-loader";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatDateTime, clamp } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { PatrolEvent } from "@/lib/types";

export default function PatrolReplayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: patrol, error, loading, reload } = useAsyncData(() => patrols.get(params.id));
  const spatial = useAsyncData(() => gis.spatial(), [], { cacheKey: "gis:spatial" });

  const [playback, setPlayback] = useState(0);
  const [seek, setSeek] = useState<{ key: number; value: number } | null>(null);
  const seekKey = useRef(1);

  const events = useMemo(() => {
    if (!patrol) return [];
    return [...(patrol.timeline ?? [])].sort((a, b) => a.time.localeCompare(b.time));
  }, [patrol]);

  const eventWindow = useMemo(() => {
    if (!patrol) return { start: 0, end: 1 };
    const start = new Date(patrol.startActual ?? patrol.startScheduled).getTime();
    const end = patrol.endActual
      ? new Date(patrol.endActual).getTime()
      : start + (patrol.durationMin > 0 ? patrol.durationMin : 60) * 60_000;
    return { start, end: Math.max(end, start + 1) };
  }, [patrol]);

  const fractionOf = useCallback(
    (t: string) => clamp((new Date(t).getTime() - eventWindow.start) / (eventWindow.end - eventWindow.start), 0, 1),
    [eventWindow]
  );

  const activeEventIndex = useMemo(() => {
    let idx = -1;
    events.forEach((e, i) => {
      if (fractionOf(e.time) <= playback) idx = i;
    });
    return idx;
  }, [events, playback, fractionOf]);

  const jumpToEvent = (e: PatrolEvent) => {
    const f = fractionOf(e.time);
    setSeek({ key: seekKey.current, value: f });
    seekKey.current += 1;
    setPlayback(f);
  };

  if (loading || !patrol) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Patrol replay"
        subtitle={`${patrol.code} — ${patrol.title}`}
        actions={
          <>
            <Badge tone={patrolStatusTone[patrol.status]} dot>{patrolStatusLabel[patrol.status]}</Badge>
            <Link
              href={`/patrols/${patrol.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="chevronLeft" size={14} /> Back to patrol
            </Link>
          </>
        }
      />

      <StatRow
        items={[
          { label: "Distance", value: patrol.distanceKm != null ? `${patrol.distanceKm} km` : "—" },
          { label: "Duration", value: patrol.durationMin > 0 ? `${patrol.durationMin} min` : "—" },
          { label: "Checkpoints", value: patrol.checkpoints },
          { label: "Events", value: events.length },
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Route playback"
              icon="play"
              subtitle="Press play on the map to replay the patrol sequence"
            />
            <div className="p-3">
              {spatial.data ? (
                <MapWorkspace
                  mode="overview"
                  heightClass="h-[420px]"
                  replayPatrolId={patrol.id}
                  replayPoints={patrol.route}
                  liveBeats={spatial.data.beats}
                  compartments={spatial.data.compartments}
                  boundary={spatial.data.boundary}
                  onProgress={(p) => setPlayback(p)}
                  seekSignal={seek}
                  onSelect={() => undefined}
                />
              ) : (
                <div className="flex h-[420px] items-center justify-center text-xs text-ink-soft">
                  {spatial.loading ? "Loading map layers…" : "Map unavailable"}
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader
              title="Replay event log"
              icon="history"
              subtitle="Click an event to jump playback to it"
            />
            <div className="p-5">
              {events.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-soft">No timeline events logged for this patrol.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-line pl-5">
                  {events.map((t, i) => {
                    const active = i === activeEventIndex;
                    const past = fractionOf(t.time) <= playback;
                    return (
                      <li key={i} className="relative">
                        <span
                          className={cn(
                            "absolute -left-[26px] top-1 size-3 rounded-full border-2 border-white",
                            active
                              ? "bg-forest-700 ring-2 ring-forest-200"
                              : past
                                ? "bg-forest-500"
                                : "bg-zinc-300"
                          )}
                        />
                        <button
                          onClick={() => jumpToEvent(t)}
                          className={cn(
                            "w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-forest-50",
                            active && "bg-forest-50"
                          )}
                        >
                          <p className="text-xs text-ink-faint">{formatDateTime(t.time)}</p>
                          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            <Icon name={eventIcon(t.kind)} size={13} className="text-forest-700" />
                            {t.label}
                          </p>
                          {t.ranger && <p className="mt-0.5 text-xs text-ink-soft">By {t.ranger}</p>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Patrol context" icon="info" />
            <dl className="space-y-2.5 p-4 text-sm">
              <ReplayRow label="Type" value={patrol.type ? patrolTypeLabels[patrol.type] : "—"} />
              <ReplayRow label="Area" value={[patrol.range, patrol.beat].filter(Boolean).map((id) => unitName(id)).join(" · ") || "Unknown"} />
              <ReplayRow label="Leader" value={patrol.leader} />
              <ReplayRow label="Objective" value={patrol.objective} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Coverage" icon="target" subtitle="ForestGrid cells touched by this patrol (live from the backend)" />
            <div className="p-4">
              {patrol.coveragePct == null ? (
                <p className="text-sm text-ink-soft">
                  Coverage unavailable — the backend could not compute it for this patrol.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-soft">Patrolled cells</span>
                    <span className="font-semibold text-ink">{patrol.coveragePct}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={patrol.coveragePct >= 80 ? "h-full rounded-full bg-forest-600" : patrol.coveragePct >= 40 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-danger"}
                      style={{ width: `${patrol.coveragePct}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </Card>

          <button
            onClick={() => router.push("/gis")}
            className="w-full rounded-field border border-line-strong bg-white px-4 py-2.5 text-sm font-medium text-forest-800 hover:border-forest-600"
          >
            Open in GIS workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplayRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}

function eventIcon(k: PatrolEvent["kind"]): IconName {
  return k === "incident" ? "alert" : k === "sos" ? "sos" : k === "observation" ? "binoculars" : k === "checkpoint" ? "pin" : "check";
}