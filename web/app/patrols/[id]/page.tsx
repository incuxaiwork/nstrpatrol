"use client";

/**
 * Patrol detail (PRD §6.3) — full operational record: stats, route map,
 * unit context, crew, timeline, notes, and status actions (dispatch /
 * complete / cancel via mock confirm dialogs). Print and export are
 * wired to the global export dialog.
 */

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, Progress, Avatar, type BadgeTone } from "@/components/ui";
import { StatRow, Timeline } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { MapWorkspace } from "@/components/map";
import { ConfirmDialog, ExportDialog, ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatDateTime, formatMinutes, formatKm } from "@/lib/utils";
import type { PatrolEvent } from "@/lib/types";

export default function PatrolDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useApp();
  const { data: patrol, error, loading, reload } = useAsyncData(() => patrols.get(params.id));
  const [confirm, setConfirm] = useState<"cancel" | "complete" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  if (loading || !patrol) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const eventTone = (k: PatrolEvent["kind"]): BadgeTone =>
    k === "incident" ? "danger" : k === "sos" ? "danger" : k === "observation" ? "warning" : k === "checkpoint" ? "info" : "forest";
  const eventIcon = (k: PatrolEvent["kind"]): IconName =>
    k === "incident" ? "alert" : k === "sos" ? "sos" : k === "observation" ? "binoculars" : k === "checkpoint" ? "pin" : "check";

  const crew = [patrol.leader, ...patrol.members];

  return (
    <div>
      <PageHeader
        title={patrol.title}
        subtitle={`${patrol.code} · ${patrolTypeLabels[patrol.type]} patrol · started ${formatDateTime(patrol.startScheduled)}`}
        actions={
          <>
            <Badge tone={patrolStatusTone[patrol.status]} dot>{patrolStatusLabel[patrol.status]}</Badge>
            <button
              onClick={() => { navigator.clipboard?.writeText(patrol.code); pushToast("success", "Copied", `${patrol.code} copied to clipboard`); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="copy" size={14} /> Copy code
            </button>
            <ExportButton />
            {patrol.status === "ongoing" || patrol.status === "delayed" ? (
              <button
                onClick={() => setConfirm("complete")}
                className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
              >
                <Icon name="check" size={15} /> Complete
              </button>
            ) : null}
            {patrol.status === "planned" || patrol.status === "assigned" ? (
              <button
                onClick={() => setConfirm("cancel")}
                className="inline-flex h-9 items-center gap-2 rounded-field border border-danger/40 bg-white px-4 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                <Icon name="x" size={15} /> Cancel patrol
              </button>
            ) : null}
          </>
        }
      />

      <StatRow
        items={[
          { label: "Distance", value: patrol.distanceKm > 0 ? formatKm(patrol.distanceKm) : "—" },
          { label: "Duration", value: patrol.durationMin > 0 ? formatMinutes(patrol.durationMin) : "—" },
          { label: "Checkpoints", value: patrol.checkpoints },
          { label: "Incidents", value: patrol.incidents, tone: patrol.incidents > 0 ? "danger" : undefined },
          { label: "Observations", value: patrol.observations },
          { label: "Photos", value: patrol.photos },
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Route & live position" icon="map" subtitle="Mock trace — real GPS feed replaces this in production" />
            <div className="p-3">
              <MapWorkspace
                mode="overview"
                heightClass="h-[300px]"
                replayPatrolId={patrol.id}
                onSelect={() => undefined}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Patrol timeline" icon="history" subtitle={`${patrol.timeline.length} events logged`} />
            <div className="p-5">
              {patrol.timeline.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-soft">No timeline events logged yet.</p>
              ) : (
                <Timeline
                  items={patrol.timeline.map((t) => ({
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
            <CardHeader title="Details" icon="info" />
            <dl className="space-y-2.5 p-4 text-sm">
              <DetailRow label="Division" value={unitName(patrol.division)} />
              <DetailRow label="Range" value={unitName(patrol.range)} />
              <DetailRow label="Beat" value={unitName(patrol.beat)} />
              <DetailRow label="Team" value={patrol.teamId} />
              <DetailRow label="Objective" value={patrol.objective} />
              <DetailRow label="Scheduled" value={formatDateTime(patrol.startScheduled)} />
              {patrol.startActual && <DetailRow label="Started" value={formatDateTime(patrol.startActual)} />}
              {patrol.endScheduled && <DetailRow label="Due by" value={formatDateTime(patrol.endScheduled)} />}
              {patrol.endActual && <DetailRow label="Completed" value={formatDateTime(patrol.endActual)} />}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Crew" icon="users" subtitle={`${crew.length} rangers`} />
            <div className="space-y-2.5 p-4">
              {crew.map((name, i) => (
                <div key={name} className="flex items-center gap-2.5">
                  <Avatar name={name} size={28} />
                  <span className="text-sm text-ink">{name}</span>
                  {i === 0 && <Badge tone="forest">Leader</Badge>}
                </div>
              ))}
            </div>
          </Card>

          {patrol.notes && (
            <Card>
              <CardHeader title="Notes" icon="file" />
              <p className="p-4 text-sm text-ink-soft">{patrol.notes}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="Coverage" icon="target" />
            <div className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Beat coverage</span>
                <span className="font-semibold text-ink">{patrol.coveragePct}%</span>
              </div>
              <div className="mt-2">
                <Progress
                  value={patrol.coveragePct}
                  tone={patrol.coveragePct >= 80 ? "forest" : patrol.coveragePct >= 40 ? "warning" : "danger"}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        danger={confirm === "cancel"}
        title={confirm === "cancel" ? "Cancel this patrol?" : "Complete this patrol?"}
        message={
          confirm === "cancel"
            ? `Patrol ${patrol.code} will be marked as cancelled. This cannot be undone (mock action — no backend call).`
            : `Mark ${patrol.code} as completed? Duration and coverage are finalised from the field log (mock action).`
        }
        confirmLabel={confirm === "cancel" ? "Cancel patrol" : "Complete patrol"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          pushToast(
            confirm === "cancel" ? "warning" : "success",
            confirm === "cancel" ? "Patrol cancelled" : "Patrol completed",
            `${patrol.code} ${confirm === "cancel" ? "cancelled" : "completed"} (mock)`
          );
          router.refresh();
        }}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

// -- helpers -----------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}