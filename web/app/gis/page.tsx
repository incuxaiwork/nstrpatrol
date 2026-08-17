"use client";

/**
 * GIS Intelligence (PRD §9) — the full map workspace with layer control,
 * live markers, patrol route playback, and the zero-patrol-zone board.
 */

import { useState } from "react";
import Link from "next/link";
import { gis, rangers as servicesRangers, observations as servicesObservations } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { api } from "@/lib/api";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data";
import { MapWorkspace, MapSidebarFacts } from "@/components/map";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { stamp, exportRows } from "@/lib/export";
import { ReportButton } from "@/components/reports/ReportButton";
import { RegionReportDialog } from "@/components/reports/dialogs";
import type { GisMarker, GisRoute } from "@/lib/mock/gis";

function beatIsZero(b: { id: string; isZeroPatrol?: boolean }): boolean {
  return b.isZeroPatrol === true;
}

function heatTone(v: number): number {
  return 0.12 + v * 0.55;
}

function selectedDetail(
  selected: string | null,
  beats: { id: string; name: string; coveragePct: number | null }[],
  comps: { id: string; compNo: string; beat: string; areaHa: number }[],
  routes: GisRoute[],
  markers: GisMarker[]
) {
  if (!selected) return null;
  const route = routes.find((r) => r.id === selected);
  if (route) {
    return {
      kind: "route" as const,
      title: route.label,
      body: `${route.patrolId} · ${route.status}`,
      href: `/patrols/${route.patrolId}`,
      cta: "Open patrol",
      tone: "neutral" as const,
      tag: "Patrol route",
    };
  }
  const comp = comps.find((c) => c.id === selected);
  if (comp) {
    return {
      kind: "compartment" as const,
      title: `Compartment ${comp.compNo}`,
      body: `${comp.areaHa > 0 ? comp.areaHa + " ha · " : ""}${comp.beat || "beat not mapped"}`,
      href: "/gis",
      cta: "Dismiss",
      tone: "neutral" as const,
      tag: "Compartment",
    };
  }
  const beat = beats.find((b) => b.id === selected);
  if (beat) {
    const zero = beatIsZero(beat);
    return {
      kind: "beat" as const,
      title: `${beat.name} beat`,
      body: beat.coveragePct == null ? "Coverage data pending" : `${beat.coveragePct}% coverage`,
      href: "/gis",
      cta: "Zoom to beat",
      tone: zero ? "danger" : ("neutral" as const),
      tag: zero ? "Zero patrol zone" : undefined,
    };
  }
  const marker = markers.find((m) => m.id === selected);
  if (!marker) return null;
  return {
    kind: marker.kind,
    title: marker.label,
    body: "Incident marker on the live map",
    href: "/observations/list",
    cta: "View reports",
    tone: "danger" as const,
    tag: marker.kind === "sos" ? "SOS" : marker.kind === "observation" ? "Observation" : "Incident",
  };
}

export default function GisPage() {
  // Beats come from the backend GIS API (GeoJSON → GL layers).
  const beatsData = useAsyncData(() => gis.beats());
  const assetsData = useAsyncData(() => gis.assets());
  const [selected, setSelected] = useState<string | null>(null);
  // No patrol preselected — play/pause appears only after the admin picks one.
  const [replayPatrol, setReplayPatrol] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const markersData = useAsyncData(() => gis.markers());
  const routesData = useAsyncData(() => gis.routes());
  const heatData = useAsyncData(() => gis.heat());
  const rangersData = useAsyncData(() => servicesRangers.list());
  const observationsData = useAsyncData(() => servicesObservations.list());
  const compartmentsData = useAsyncData(() => gis.compartments());
  const boundaryData = useAsyncData(() => gis.boundary());
  const gridsData = useAsyncData(() => gis.grids());

  if (beatsData.loading || !beatsData.data || compartmentsData.loading || !compartmentsData.data || boundaryData.loading || !boundaryData.data || gridsData.loading || !gridsData.data)
    return <SkeletonRows rows={8} />;
  if (beatsData.error) return <ErrorState message={beatsData.error.message} onRetry={beatsData.reload} />;
  if (compartmentsData.error) return <ErrorState message={compartmentsData.error.message} onRetry={compartmentsData.reload} />;
  if (boundaryData.error) return <ErrorState message={boundaryData.error.message} onRetry={boundaryData.reload} />;
  if (gridsData.error) return <ErrorState message={gridsData.error.message} onRetry={gridsData.reload} />;

  const beats = beatsData.data;
  const compartments = compartmentsData.data;
  const boundary = boundaryData.data;
  const grids = gridsData.data;
  const markers = markersData.data ?? [];
  const routes = routesData.data ?? [];
  const heat = heatData.data ?? [];

  // Selecting a patrol route on the map arms the replay for that patrol.
  const handleSelect = (id: string | null) => {
    if (!id) {
      setSelected(null);
      return;
    }
    const route = routes.find((r) => r.id === id);
    if (route) setReplayPatrol(route.patrolId);
    setSelected(id);
  };

  const zeroPatrolBeats = beats.filter((b) => beatIsZero(b));
  const detail = selectedDetail(selected, beats, compartments, routes, markers);

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `gis-catalog-${stamp()}`, [
      ...markers.map((m) => ({
        id: m.id,
        kind: m.kind,
        label: m.label,
        x: m.x,
        y: m.y,
      })),
      ...zeroPatrolBeats.map((b) => ({
        id: b.id,
        kind: "zero-patrol-beat",
        label: b.name,
        coveragePct: b.coveragePct,
      })),
      ...compartments.map((c) => ({
        id: c.id,
        kind: "compartment",
        label: c.compNo,
        beat: c.beat,
        areaHa: c.areaHa,
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
            <ReportButton onClick={() => setReportOpen(true)} />
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
            {markersData.error && (
              <p className="border-b border-line px-4 py-2 text-xs text-danger">
                Couldn&apos;t load map markers — showing the map without incident points.
              </p>
            )}
            <MapWorkspace
              mode="workspace"
              heightClass="h-[560px]"
              liveBeats={beats}
              compartments={compartments}
              boundary={boundary}
              grids={grids}
              markers={markers}
              routes={routes}
              heat={heat}
              selectedId={selected}
              onSelect={handleSelect}
              replayPatrolId={replayPatrol}
              detailCard={detail ? <SelectedCard detail={detail} onClose={() => setSelected(null)} /> : undefined}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <MapSidebarFacts rangers={rangersData.data ?? []} observations={observationsData.data ?? []} />

          {assetsData.data && assetsData.data.length > 0 && (
            <Card>
              <CardHeader
                title="Map assets"
                icon="layers"
                subtitle={`${assetsData.data.length} file(s) served by the backend GIS API`}
              />
              <div className="space-y-1.5 p-4">
                {assetsData.data.map((a) => (
                  <a
                    key={a.id}
                    href={api.gis.asset(a.resourceKey)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-forest-50"
                  >
                    <Icon name="file" size={15} className="text-forest-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{a.resourceKey}</span>
                      <span className="block text-xs text-ink-soft">
                        {a.contentType} · {Math.round(a.sizeBytes / 1024)} KB · v{a.version}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Route playback" icon="play" subtitle="Replay a completed patrol trace" />
            {routesData.error && (
              <p className="px-4 pb-2 text-xs text-danger">
                Couldn&apos;t load patrol routes — {routesData.error.message}
              </p>
            )}
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
              {routes.length === 0 && !routesData.error && (
                <p className="py-4 text-center text-sm text-ink-soft">No patrol routes with GPS traces yet.</p>
              )}
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
                    <p className="font-medium text-ink">{b.name}</p>
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
          <CardHeader title="Activity heatmap" icon="layers" subtitle="Patrol & incident density blocks (API GAP — backend does not expose heat aggregates)" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {heat.map((h) => (
              <div key={`${h.x}-${h.y}`} className="rounded-card border border-line" style={{ height: 64, background: `rgba(179, 38, 30, ${heatTone(h.intensity)})` }}>
                <span className="block px-3 pt-2 text-[11px] font-medium text-white">
                  {Math.round(h.intensity * 100)}% density
                </span>
                <span className="block px-3 text-[10px] text-white/70">block {h.x},{h.y}</span>
              </div>
            ))}
            {heat.length === 0 && (
              <p className="col-span-2 py-6 text-center text-sm text-ink-soft">
                Heat aggregation is not available from the backend yet.
              </p>
            )}
          </div>
        </Card>
      </div>
      <RegionReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
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