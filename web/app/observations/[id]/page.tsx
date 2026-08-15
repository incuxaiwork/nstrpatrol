"use client";

/**
 * Observation detail (PRD §8.3) — full report with media, context,
 * related items and resolution workflow (mock).
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { gis, observations, patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, Avatar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { MapWorkspace } from "@/components/map";
import { Dialog } from "@/components/overlays";
import { MediaViewer } from "@/components/media-viewer";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { severityLabel, severityTone, observationStatusLabel, observationStatusTone } from "@/lib/nav";
import { categoryMeta } from "@/lib/mock/observations";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo } from "@/lib/utils";

export default function ObservationDetailPage() {
  const params = useParams<{ id: string }>();
  const { pushToast } = useApp();
  const { data: obs, error, loading, reload } = useAsyncData(() => observations.get(params.id));
  const patrol = useAsyncData(() => (obs?.patrolId ? patrols.get(obs.patrolId) : Promise.resolve(undefined)));
  const spatial = useAsyncData(() => gis.spatial());

  const [resolveOpen, setResolveOpen] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);

  if (loading || !obs || spatial.loading || !spatial.data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title={obs.title}
        subtitle={`${obs.code} · ${categoryMeta[obs.category].label} · ${unitName(obs.range)} · ${timeAgo(obs.recordedAt)} by ${obs.recordedBy}`}
        actions={
          <>
            {obs.priority === "urgent" && <Badge tone="danger">Urgent</Badge>}
            <Badge tone={severityTone[obs.severity]} dot>{severityLabel[obs.severity]}</Badge>
            <Badge tone={observationStatusTone[obs.status]} dot>{observationStatusLabel[obs.status]}</Badge>
            <button
              onClick={() => setEscalateOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-field border border-danger/40 bg-white px-3 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              <Icon name="alert" size={14} /> Escalate
            </button>
            <button
              onClick={() => setResolveOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              <Icon name="check" size={15} /> Mark resolved
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Description" icon="file" />
            <p className="p-5 text-sm leading-relaxed text-ink">{obs.description}</p>
          </Card>

          <Card>
            <CardHeader title="Media" icon="camera" subtitle={`${obs.media?.length ?? 0} attachments`} />
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              {(obs.media ?? []).map((m, i) => (
                <button
                  key={i}
                  onClick={() => setMediaIndex(i)}
                  className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-surface text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                >
                  <Icon name={m.type === "photo" ? "camera" : "radio"} size={20} />
                  <span className="px-2 text-center text-xs">{m.label}</span>
                </button>
              ))}
              {(obs.media ?? []).length === 0 && (
                <p className="col-span-full py-6 text-center text-sm text-ink-soft">No media uploaded for this report.</p>
              )}
            </div>
            {obs.voiceNoteMin ? (
              <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-sm text-ink-soft">
                <Icon name="radio" size={15} />
                Voice note available · {obs.voiceNoteMin}s transcript pending
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Location" icon="map" subtitle="Coordinates recorded from the field device" />
            <div className="p-3">
              <MapWorkspace mode="overview" heightClass="h-[240px]" liveBeats={spatial.data.beats} compartments={spatial.data.compartments} onSelect={() => undefined} />
            </div>
            <p className="px-4 pb-4 font-mono text-xs text-ink-soft">
              {obs.lat.toFixed(5)}, {obs.lng.toFixed(5)}
            </p>
          </Card>

          {obs.related?.length ? (
            <Card>
              <CardHeader title="Related reports" icon="link" />
              <div className="divide-y divide-line">
                {obs.related.map((rid) => (
                  <Link key={rid} href={`/observations/${rid}`} className="flex items-center justify-between px-4 py-2.5 text-sm text-ink hover:bg-forest-50/40">
                    <span className="font-mono text-xs text-forest-800">{rid}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                      View <Icon name="chevronRight" size={12} />
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Context" icon="info" />
            <dl className="space-y-2.5 p-4 text-sm">
              <DetailRow label="Category" value={categoryMeta[obs.category].label} />
              <DetailRow label="Subcategory" value={obs.subcategory} />
              <DetailRow label="Species" value={obs.species ?? "—"} />
              <DetailRow label="Group size" value={obs.groupSize ?? "—"} />
              <DetailRow label="Division" value={unitName(obs.division)} />
              <DetailRow label="Range" value={unitName(obs.range)} />
              <DetailRow label="Beat" value={unitName(obs.beat)} />
              <DetailRow label="Recorded by" value={obs.recordedBy} />
              <DetailRow label="Patrol" value={obs.patrolId ?? "—"} />
            </dl>
          </Card>

          {patrol.data && (
            <Link href={`/patrols/${patrol.data.id}`} className="block">
              <Card>
                <CardHeader title="Linked patrol" icon="route" />
                <div className="flex items-center gap-2.5 p-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-forest-100 text-forest-800">
                    <Icon name="route" size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{patrol.data.title}</p>
                    <p className="text-xs text-ink-soft">{patrol.data.code} · {patrol.data.leader}</p>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {obs.actionTaken && (
            <Card>
              <CardHeader title="Action taken" icon="check" />
              <p className="p-4 text-sm text-ink">{obs.actionTaken}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="Attribution" icon="users" />
            <div className="flex items-center gap-2.5 p-4">
              <Avatar name={obs.recordedBy} size={32} />
              <div>
                <p className="text-sm font-medium text-ink">{obs.recordedBy}</p>
                <p className="text-xs text-ink-soft">{timeAgo(obs.recordedAt)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onClose={() => setResolveOpen(false)} title="Resolve report" icon="check">
        <p className="text-sm text-ink-soft">Document the resolution before closing {obs.code}.</p>
        <textarea
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
          placeholder="e.g. Snare removed, area double-combed, advisory issued"
          className="mt-3 min-h-24 w-full rounded-field border border-line-strong bg-white px-3 py-2 text-sm focus:border-forest-600 focus:outline-none"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setResolveOpen(false)} className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50">
            Cancel
          </button>
          <button
            onClick={async () => {
              setResolveOpen(false);
              await observations.setStatus(obs.id, "resolved");
              reload();
              pushToast("success", "Report resolved", `${obs.code} marked as resolved (mock store)`);
            }}
            className="h-9 rounded-field bg-forest-800 px-4 text-sm font-medium text-white hover:bg-forest-700"
          >
            Resolve report
          </button>
        </div>
      </Dialog>

      {/* Escalate dialog */}
      <Dialog open={escalateOpen} onClose={() => setEscalateOpen(false)} title="Escalate report" icon="sos">
        <p className="text-sm text-ink-soft">
          Escalation notifies the SOC duty officer and Divisional Forest Officer (mock).
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setEscalateOpen(false)} className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50">
            Cancel
          </button>
          <button
            onClick={async () => {
              setEscalateOpen(false);
              await observations.setStatus(obs.id, "escalated");
              reload();
              pushToast("warning", "Report escalated", `${obs.code} escalated — SOC notified (mock store)`);
            }}
            className="h-9 rounded-field bg-danger px-4 text-sm font-medium text-white hover:bg-danger/90"
          >
            Escalate
          </button>
        </div>
      </Dialog>

      {/* Media viewer */}
      {mediaIndex !== null && obs.media?.length ? (
        <MediaViewer
          items={obs.media}
          index={mediaIndex}
          onClose={() => setMediaIndex(null)}
          onIndexChange={setMediaIndex}
        />
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}