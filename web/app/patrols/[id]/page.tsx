"use client";

/**
 * Patrol detail (PRD §6.3 — new operating model) — full operational record.
 * Read-only from the admin perspective: the portal monitors and reviews
 * patrols recorded by rangers in the field. The jurisdiction banner shows
 * whether the patrol lies within the ranger's normal jurisdiction or was
 * covered by a special authorization.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { authorizations, gis, patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, Progress, Avatar, type BadgeTone } from "@/components/ui";
import { StatRow, Timeline } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { MapWorkspace } from "@/components/map-loader";
import { DEFAULT_LAYER_STATE, type ForestLayerState } from "@/lib/map-layers";
import { JurisdictionBanner } from "@/components/jurisdiction";
import { resolveJurisdiction, authStatusLabel, authStatusTone } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatDateTime, formatMinutes, formatKm, geoLabel } from "@/lib/utils";
import type { PatrolEvent } from "@/lib/types";
import { ReportButton } from "@/components/reports/ReportButton";
import { PatrolReportDialog } from "@/components/reports/dialogs";

export default function PatrolDetailPage() {
  const params = useParams<{ id: string }>();
  const { pushToast } = useApp();
  const { data: patrol, error, loading, reload } = useAsyncData(() => patrols.get(params.id));
  const auths = useAsyncData(() => authorizations.list(), [], { cacheKey: "patrols:auths" });
  const spatial = useAsyncData(() => gis.spatial(), [], { cacheKey: "gis:spatial" });
  const [reportOpen, setReportOpen] = useState(false);

  const jurisdiction = useMemo(
    () => (patrol && auths.data ? resolveJurisdiction(patrol, auths.data) : undefined),
    [patrol, auths.data]
  );

  if (loading || !patrol || auths.loading || !auths.data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!patrol || !jurisdiction) return <NotFound what="patrol" id={params.id} onBack={() => pushToast("info", "Patrol lookup", "This patrol id does not exist in the records")} />;

  // Geography is only shown where the backend actually resolved it.
  const areaText = [patrol.division, patrol.range, patrol.beat].filter(Boolean).join(" / ") || "Unknown";
  const typeText = patrol.type ? patrolTypeLabels[patrol.type] : "Field";

  const eventTone = (k: PatrolEvent["kind"]): BadgeTone =>
    k === "incident" ? "danger" : k === "sos" ? "danger" : k === "observation" ? "warning" : k === "checkpoint" ? "info" : "forest";
  const eventIcon = (k: PatrolEvent["kind"]): IconName =>
    k === "incident" ? "alert" : k === "sos" ? "sos" : k === "observation" ? "binoculars" : k === "checkpoint" ? "pin" : "check";

  const crew = [patrol.leader, ...patrol.members];
  const auth = jurisdiction.authorization;

  return (
    <div>
      <PageHeader
        title={patrol.title}
        subtitle={`${patrol.code} · ${typeText} patrol · started ${formatDateTime(patrol.startScheduled)}`}
        actions={
          <>
            <Badge tone={patrolStatusTone[patrol.status]} dot>{patrolStatusLabel[patrol.status]}</Badge>
            <ReportButton onClick={() => setReportOpen(true)} />
            <Link
              href={`/patrols/${patrol.id}/replay`}
              className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="play" size={14} /> Replay
            </Link>
          </>
        }
      />

      <div className="mt-2">
        <JurisdictionBanner
          state={jurisdiction.state}
          authorization={auth}
          homeArea={jurisdiction.homeBeat ? [jurisdiction.homeDivision, jurisdiction.homeRange, jurisdiction.homeBeat].map((id) => geoLabel(id ?? "")).join(" / ") : undefined}
          patrolArea={areaText}
        />
      </div>

      <div className="mt-4">
        <StatRow
          items={[
            { label: "Distance", value: patrol.distanceKm != null ? formatKm(patrol.distanceKm) : "—" },
            { label: "Duration", value: patrol.durationMin > 0 ? formatMinutes(patrol.durationMin) : "—" },
            { label: "Checkpoints", value: patrol.checkpoints ?? "Not available" },
            { label: "Incidents", value: patrol.incidents, tone: patrol.incidents > 0 ? "danger" : undefined },
            { label: "Observations", value: patrol.observations },
            { label: "Photos", value: patrol.photos },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Route & live position" icon="map" subtitle="Press play to replay the patrol trace" />
            <div className="p-3">
              {spatial.data ? (
                <MapWorkspace
                  mode="focus"
                  heightClass="h-[300px]"
                  replayPatrolId={patrol.id}
                  replayPoints={patrol.route}
                  liveBeats={spatial.data.beats}
                  compartments={spatial.data.compartments}
                  boundary={spatial.data.boundary}
                  layerState={{ ...DEFAULT_LAYER_STATE, routes: true }}
                  onSelect={() => undefined}
                />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-xs text-ink-soft">
                  {spatial.loading ? "Loading map layers…" : "Map unavailable"}
                </div>
              )}
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
              <DetailRow label="Division" value={patrol.division || "Unknown"} />
              <DetailRow label="Range" value={patrol.range || "Unknown"} />
              <DetailRow label="Beat" value={patrol.beat || "Unassigned"} />
              <DetailRow label="Team" value={patrol.teamId || "—"} />
              <DetailRow label="Objective" value={patrol.objective || "—"} />
              <DetailRow label="Scheduled" value={formatDateTime(patrol.startScheduled)} />
              {patrol.startActual && <DetailRow label="Started" value={formatDateTime(patrol.startActual)} />}
              {patrol.endScheduled && <DetailRow label="Due by" value={formatDateTime(patrol.endScheduled)} />}
              {patrol.endActual && <DetailRow label="Completed" value={formatDateTime(patrol.endActual)} />}
            </dl>
          </Card>

          {auth && (
            <Card>
              <CardHeader title="Special authorization" icon="lock" iconTone="navy" subtitle="Patrol performed under this permission" />
              <dl className="space-y-2.5 p-4 text-sm">
                <DetailRow label="Authorization" value={<span className="font-mono">{auth.id}</span>} />
                <DetailRow label="Status" value={<Badge tone={authStatusTone[auth.status]} dot>{authStatusLabel[auth.status]}</Badge>} />
                <DetailRow label="Authorized area" value={`${unitName(auth.authDivision)} / ${unitName(auth.authRange)} / ${unitName(auth.authBeat)}`} />
                <DetailRow label="Approved by" value={auth.approvedBy ?? "—"} />
                <DetailRow label="Valid until" value={formatDateTime(auth.validUntil)} />
              </dl>
              <div className="border-t border-line p-4">
                <Link href={`/patrols/permissions/${auth.id}`} className="text-xs font-medium text-forest-700 hover:underline">
                  View authorization details →
                </Link>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Rangers" icon="users" subtitle={`${crew.length} rangers`} />
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
            <CardHeader
              title="Coverage"
              icon="target"
              subtitle="ForestGrid cells touched by this patrol (live from the backend)"
            />
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
                  <div className="mt-2">
                    <Progress
                      value={patrol.coveragePct}
                      tone={patrol.coveragePct >= 80 ? "forest" : patrol.coveragePct >= 40 ? "warning" : "danger"}
                    />
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      <PatrolReportDialog open={reportOpen} onClose={() => setReportOpen(false)} patrol={patrol} jurisdiction={jurisdiction} />
    </div>
  );
}

// -- helpers -----------------------------------------------------------

function NotFound({ what, id, onBack }: { what: string; id: string; onBack(): void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-card border border-line bg-white p-6 text-center">
      <Icon name="search" size={28} className="text-ink-faint" />
      <p className="text-sm font-medium text-ink">
        {what[0].toUpperCase() + what.slice(1)} <span className="font-mono">{id}</span> not found
      </p>
      <p className="max-w-sm text-xs text-ink-soft">
        It may not exist in the mock records, or the record is still syncing from the field.
      </p>
      <button onClick={onBack} className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700">
        <Icon name="chevronLeft" size={12} /> Back to patrols
      </button>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}