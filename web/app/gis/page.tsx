"use client";

/**
 * GIS Intelligence (PRD §9) — the full map workspace with layer control,
 * live markers, patrol route playback, and the zero-patrol-zone board.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { gis } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data";
import { MapWorkspace, LayerManager, MapSidebarFacts } from "@/components/map";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import { zeroPatrolZones, gisMarkers } from "@/lib/mock/gis";
import { mockRangers } from "@/lib/mock/people";
import { mockObservations, categoryMeta } from "@/lib/mock/observations";
import { stamp, exportRows } from "@/lib/export";

function heatTone(v: number): number {
  return 0.12 + v * 0.55;
}

function selectedDetail(selected: string | null, beats: { id: string; name: string; coveragePct: number }[]) {
  if (!selected) return null;
  const beat = beats.find((b) => b.id === selected);
  if (beat) {
    const zero = zeroPatrolZones.includes(beat.id);
    return {
      kind: "beat" as const,
      title: `${unitName(beat.id)} beat`,
      body: `${beat.coveragePct}% coverage`,
      href: "/gis",
      cta: "Zoom to beat",
      tone: zero ? "danger" : ("neutral" as const),
      tag: zero ? "Zero patrol zone" : undefined,
    };
  }
  const marker = gisMarkers.find((m) => m.id === selected);
  if (!marker) return null;
  if (marker.kind === "ranger") {
    const r = mockRangers.find((x) => marker.label.toLowerCase().startsWith(x.code.toLowerCase()));
    if (r) {
      return {
        kind: "ranger" as const,
        title: r.name,
        body: `${r.code} · ${r.designation} · ${unitName(r.beat)}`,
        href: `/rangers/${r.id}`,
        cta: "Open profile",
        tone: "neutral" as const,
        tag: "Ranger",
      };
    }
  }
  if (marker.kind === "observation" || marker.kind === "incident") {
    const code = marker.label.match(/(OB-\d+)/i)?.[1];
    const o = mockObservations.find((x) => x.code === code);
    if (o) {
      return {
        kind: "observation" as const,
        title: o.title,
        body: `${o.code} · ${categoryMeta[o.category].label} · ${unitName(o.beat)}`,
        href: `/observations/${o.id}`,
        cta: "Open report",
        tone: "danger" as const,
        tag: o.severity.toUpperCase(),
      };
    }
    return {
      kind: "incident" as const,
      title: marker.label,
      body: "Incident marker on the live map",
      href: "/observations/list",
      cta: "View reports",
      tone: "danger" as const,
      tag: "Incident",
    };
  }
  if (marker.kind === "sos") {
    return {
      kind: "sos" as const,
      title: marker.label,
      body: "SOS received — response team dispatched",
      href: "/patrols",
      cta: "Open patrols",
      tone: "danger" as const,
      tag: "SOS",
    };
  }
  return {
    kind: "marker" as const,
    title: marker.label,
    body: "Map feature",
    href: "/gis",
    cta: "Dismiss",
    tone: "neutral" as const,
    tag: "Marker",
  };
}

export default function GisPage() {
  const layersData = useAsyncData(() => gis.layers());
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [replayPatrol, setReplayPatrol] = useState<string | null>("p-2026-0118");

  const routes = useMemo(() => gis.routes(), []);
  const beats = useMemo(() => gis.beats(), []);
  const heat = useMemo(() => gis.heat(), []);

  if (layersData.loading || !layersData.data) return <SkeletonRows rows={8} />;
  if (layersData.error) return <ErrorState message={layersData.error.message} onRetry={layersData.reload} />;

  const layers = layersData.data.map((l) => ({
    ...l,
    visible: visibility[l.id] ?? l.visible,
  }));
  const onToggle = (id: string) =>
    setVisibility((v) => ({ ...v, [id]: !(v[id] ?? layers.find((l) => l.id === id)!.visible) }));

const zeroPatrolBeats = beats.filter((b) => zeroPatrolZones.includes(b.id));
  const detail = selectedDetail(selected, beats);

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `gis-catalog-${stamp()}`, [
      ...gisMarkers.map((m) => ({
        id: m.id,
        kind: m.kind,
        label: m.label,
        x: m.x,
        y: m.y,
      })),
      ...zeroPatrolBeats.map((b) => ({
        id: b.id,
        kind: "zero-patrol-beat",
        label: unitName(b.id),
        coveragePct: b.coveragePct,
      })),
    ]);
  };

  return (
    <div>
      <PageHeader
        title="GIS Intelligence"
        subtitle="Live operational mapping — patrol traces, observations and coverage"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExport} />
            <Link
              href="/observations/list"
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              Reports on map
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Card className="overflow-hidden">
            <MapWorkspace
              mode="workspace"
              heightClass="h-[560px]"
              layers={layers}
              selectedId={selected}
              onSelect={setSelected}
              replayPatrolId={replayPatrol}
              headerActions={<LayerManager layers={layers} onToggle={onToggle} />}
              detailCard={detail ? <SelectedCard detail={detail} onClose={() => setSelected(null)} /> : undefined}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <MapSidebarFacts />

          <Card>
            <CardHeader title="Route playback" icon="play" subtitle="Replay a completed patrol trace" />
            <div className="space-y-2 p-4">
              {routes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReplayPatrol(r.patrolId)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-card border px-3 py-2.5 text-left transition-colors",
                    replayPatrol === r.patrolId
                      ? "border-forest-600 bg-forest-50"
                      : "border-line bg-surface hover:border-forest-600"
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.label}</p>
                    <p className="text-xs text-ink-soft">{r.patrolId} · {r.status}</p>
                  </div>
                  {replayPatrol === r.patrolId && <Badge tone="success">Active</Badge>}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

<div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Zero-patrol zones" icon="alert" iconTone="danger" subtitle="Beats without patrol coverage in the last 14 days" />
          <DataTable
            rows={zeroPatrolBeats}
            loading={false}
            columns={[
              {
                key: "id", header: "Beat",
                render: (b) => (
                  <div>
                    <p className="font-medium text-ink">{unitName(b.id)}</p>
                    <p className="font-mono text-xs text-ink-soft">{b.id}</p>
                  </div>
                ),
              },
              {
                key: "lastPatrol", header: "Last patrol",
                render: () => <Badge tone="danger">14+ days</Badge>,
              },
              {
                key: "gap", header: "Coverage gap",
                render: () => <span className="font-semibold text-danger">Critical</span>,
              },
            ]}
            empty={<p className="py-8 text-center text-sm text-ink-soft">No beats flagged.</p>}
          />
        </Card>

        <Card>
          <CardHeader title="Activity heatmap" icon="layers" subtitle="Patrol & incident density blocks (mock)" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {heat.map((h) => (
              <div key={`${h.x}-${h.y}`} className="rounded-card border border-line" style={{ height: 64, background: `rgba(179, 38, 30, ${heatTone(h.intensity)})` }}>
                <span className="block px-3 pt-2 text-[11px] font-medium text-white">
                  {Math.round(h.intensity * 100)}% density
                </span>
                <span className="block px-3 text-[10px] text-white/70">block {h.x},{h.y}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function cn(...args: unknown[]) { return args.filter(Boolean).join(" "); }

type Detail = ReturnType<typeof selectedDetail>;

function SelectedCard({ detail, onClose }: { detail: NonNullable<Detail>; onClose(): void }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-pop" role="dialog" aria-label={detail.title}>
      <div className="flex items-start justify-between gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          {detail.tag && (
            <Badge tone={detail.tone === "danger" ? "danger" : "neutral"}>{detail.tag}</Badge>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Map selection</p>
        </div>
        <button onClick={onClose} aria-label="Close popup" className="text-ink-faint hover:text-ink">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-ink">{detail.title}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{detail.body}</p>
        <Link
          href={detail.href}
          onClick={onClose}
          className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700"
        >
          <Icon name="chevronRight" size={12} /> {detail.cta}
        </Link>
      </div>
    </div>
  );
}