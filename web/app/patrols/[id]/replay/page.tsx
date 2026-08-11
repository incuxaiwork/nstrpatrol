"use client";

/**
 * Patrol replay (PRD §6 — Patrol Replay): spatial timeline playback of a
 * patrol's route. Playback controls live on the map; the side panel shows
 * the event log in the original sequence.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, type BadgeTone } from "@/components/ui";
import { StatRow, Timeline } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { MapWorkspace } from "@/components/map";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatDateTime } from "@/lib/utils";
import type { PatrolEvent } from "@/lib/types";

export default function PatrolReplayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: patrol, error, loading, reload } = useAsyncData(() => patrols.get(params.id));

  if (loading || !patrol) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const events = [...(patrol.timeline ?? [])].sort((a, b) => a.time.localeCompare(b.time));

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
          { label: "Distance", value: patrol.distanceKm > 0 ? `${patrol.distanceKm} km` : "—" },
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
              <MapWorkspace
                mode="overview"
                heightClass="h-[420px]"
                replayPatrolId={patrol.id}
                onSelect={() => undefined}
              />
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title="Replay event log" icon="history" subtitle="Original field sequence preserved" />
            <div className="p-5">
              {events.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-soft">No timeline events logged for this patrol.</p>
              ) : (
                <Timeline
                  items={events.map((t) => ({
                    time: formatDateTime(t.time),
                    title: t.label,
                    detail: t.ranger ? `By ${t.ranger}` : undefined,
                    tone: eventTone(t.kind),
                    icon: eventIcon(t.kind),
                  }))}
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Patrol context" icon="info" />
            <dl className="space-y-2.5 p-4 text-sm">
              <ReplayRow label="Type" value={patrolTypeLabels[patrol.type]} />
              <ReplayRow label="Area" value={`${unitName(patrol.range)} · ${unitName(patrol.beat)}`} />
              <ReplayRow label="Leader" value={patrol.leader} />
              <ReplayRow label="Objective" value={patrol.objective} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Coverage" icon="target" />
            <div className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Beat coverage</span>
                <span className="font-semibold text-ink">{patrol.coveragePct}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={patrol.coveragePct >= 80 ? "h-full rounded-full bg-forest-600" : patrol.coveragePct >= 40 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-danger"}
                  style={{ width: `${patrol.coveragePct}%` }}
                />
              </div>
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

function eventTone(k: PatrolEvent["kind"]): BadgeTone {
  return k === "incident" ? "danger" : k === "sos" ? "danger" : k === "observation" ? "warning" : k === "checkpoint" ? "info" : "forest";
}

function eventIcon(k: PatrolEvent["kind"]): IconName {
  return k === "incident" ? "alert" : k === "sos" ? "sos" : k === "observation" ? "binoculars" : k === "checkpoint" ? "pin" : "check";
}