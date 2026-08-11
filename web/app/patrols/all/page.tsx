"use client";

/**
 * All Patrols (PRD §6.2 — new operating model) — monitoring and history.
 * Every patrol shown here was initiated by a ranger in the field and synced
 * to the portal. The table validates each patrol against the ranger's normal
 * jurisdiction and any special authorization.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { authorizations, patrols, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, Badge, PageHeader } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination, ViewSwitcher, type ViewMode } from "@/components/data";
import { Icon } from "@/components/icons";
import { JurisdictionBadge } from "@/components/jurisdiction";
import { resolveJurisdiction, type JurisdictionResolution } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolMethodLabels, patrolTypeLabels } from "@/lib/mock/patrols";
import { mockDivisions, mockRanges, mockBeats, unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatMinutes, formatKm } from "@/lib/utils";
import type { Patrol } from "@/lib/types";

const PAGE_SIZE = 10;

export default function AllPatrolsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.list());
  const auths = useAsyncData(() => authorizations.list());
  const roster = useAsyncData(() => rangers.list());
  const teams = useAsyncData(() => rangers.teams());

  const [status, setStatus] = useState(initialParam("status"));
  const [jurisdiction, setJurisdiction] = useState(initialParam("jurisdiction"));
  const [type, setType] = useState("");
  const [method, setMethod] = useState("");
  const [division, setDivision] = useState("");
  const [range, setRange] = useState("");
  const [beat, setBeat] = useState("");
  const [ranger, setRanger] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  const resolved = useMemo(() => {
    if (!data || !auths.data) return [];
    return data.map((p) => ({ id: p.id, patrol: p, jurisdiction: resolveJurisdiction(p, auths.data ?? []) }));
  }, [data, auths.data]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const cutoff =
    dateRange === "today" ? todayStart : dateRange === "week" ? now.getTime() - 7 * 86_400_000 : dateRange === "month" ? now.getTime() - 30 * 86_400_000 : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resolved.filter(({ patrol, jurisdiction: j }) => {
      if (status && patrol.status !== status) return false;
      if (jurisdiction === "authorized" && j.state !== "authorized-exception") return false;
      if (jurisdiction === "review" && j.state !== "requires-review" && j.state !== "pending-review") return false;
      if (type && patrol.type !== type) return false;
      if (method && patrol.method !== method) return false;
      if (division && patrol.division !== division) return false;
      if (range && patrol.range !== range) return false;
      if (beat && patrol.beat !== beat) return false;
      if (ranger && patrol.rangerId !== ranger && patrol.leader !== ranger) return false;
      if (cutoff && new Date(patrol.startScheduled).getTime() < cutoff) return false;
      if (q && !patrol.title.toLowerCase().includes(q) && !patrol.code.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, status, jurisdiction, type, method, division, range, beat, ranger, dateRange, query, cutoff]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading || !data || auths.loading || !auths.data || roster.loading || !roster.data || teams.loading || !teams.data) {
    return <SkeletonRows rows={8} />;
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const teamName = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? id;
  const rangerByPatrol = (p: Patrol) => roster.data?.find((r) => r.id === p.rangerId || r.name === p.leader);

  const rangesFor = division ? (mockRanges[division] ?? []) : [];
  const beatsFor = range ? (mockBeats[range] ?? []) : [];

  return (
    <div>
      <PageHeader
        title="All Patrols"
        subtitle="Monitor and review patrol activity recorded by rangers in the field"
        actions={
          <Link
            href="/patrols/permissions"
            className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
          >
            <Icon name="lock" size={15} /> Patrol permissions
          </Link>
        }
      />

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <p className="text-xs text-ink-soft">
            {filtered.length} patrol{filtered.length === 1 ? "" : "s"} · jurisdiction-validated against ranger home areas and authorizations
          </p>
          <ViewSwitcher value={view} onChange={(v) => { setView(v); setPage(1); }} />
        </div>

        <FilterBar onClear={() => { setStatus(""); setJurisdiction(""); setType(""); setMethod(""); setDivision(""); setRange(""); setBeat(""); setRanger(""); setDateRange(""); setQuery(""); setPage(1); }}>
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={Object.entries(patrolStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect label="Authorization" value={jurisdiction} onChange={(v) => { setJurisdiction(v); setPage(1); }}
            options={[
              { value: "authorized", label: "Authorized exception" },
              { value: "review", label: "Requires review / pending" },
            ]} />
          <FilterSelect label="Type" value={type} onChange={(v) => { setType(v); setPage(1); }}
            options={Object.entries(patrolTypeLabels).map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect label="Method" value={method} onChange={(v) => { setMethod(v); setPage(1); }}
            options={Object.entries(patrolMethodLabels).map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect label="Division" value={division} onChange={(v) => { setDivision(v); setRange(""); setBeat(""); setPage(1); }}
            options={mockDivisions.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect label="Range" value={range} onChange={(v) => { setRange(v); setBeat(""); setPage(1); }}
            options={rangesFor.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect label="Beat" value={beat} onChange={(v) => { setBeat(v); setPage(1); }}
            options={beatsFor.map((b) => ({ value: b.id, label: b.name }))} />
          <FilterSelect label="Ranger" value={ranger} onChange={(v) => { setRanger(v); setPage(1); }}
            options={roster.data.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect label="Date" value={dateRange} onChange={(v) => { setDateRange(v); setPage(1); }}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "Last 7 days" },
              { value: "month", label: "Last 30 days" },
            ]} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search title or code…"
            className="ml-auto h-9 w-48 rounded-field border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-forest-600"
          />
        </FilterBar>

        {view === "table" ? (
          <>
            <DataTable
              rows={pageRows}
              loading={loading}
              onRowClick={(r) => router.push(`/patrols/${r.patrol.id}`)}              columns={[
                {
                  key: "code", header: "Patrol ID", sortValue: (r) => r.patrol.code,
                  render: (r) => <span className="font-mono text-xs font-medium text-forest-800">{r.patrol.code}</span>,
                },
                {
                  key: "ranger", header: "Ranger", sortValue: (r) => r.patrol.leader,
                  render: (r) => (
                    <div>
                      <p className="font-medium text-ink">{r.patrol.leader}</p>
                      <p className="text-xs text-ink-soft">{teamName(r.patrol.teamId)}</p>
                    </div>
                  ),
                },
                { key: "area", header: "Area", sortValue: (r) => r.patrol.beat,
                  render: (r) => (
                    <span className="text-ink-soft">{unitName(r.patrol.division)} / {unitName(r.patrol.range)} / {unitName(r.patrol.beat)}</span>
                  ) },
                { key: "type", header: "Type", sortValue: (r) => r.patrol.type, render: (r) => <span className="text-ink-soft">{patrolTypeLabels[r.patrol.type]}</span> },
                { key: "start", header: "Start", sortValue: (r) => new Date(r.patrol.startScheduled).getTime(),
                  render: (r) => <span className="text-ink-soft">{timeAgo(r.patrol.startScheduled)}</span> },
                { key: "duration", header: "Duration", sortValue: (r) => r.patrol.durationMin,
                  render: (r) => <span className="text-ink-soft">{r.patrol.durationMin > 0 ? formatMinutes(r.patrol.durationMin) : "—"}</span> },
                { key: "distance", header: "Distance", sortValue: (r) => r.patrol.distanceKm,
                  render: (r) => <span className="text-ink-soft">{r.patrol.distanceKm > 0 ? formatKm(r.patrol.distanceKm) : "—"}</span> },
                { key: "status", header: "Status", sortValue: (r) => r.patrol.status,
                  render: (r) => <Badge tone={patrolStatusTone[r.patrol.status]} dot>{patrolStatusLabel[r.patrol.status]}</Badge> },
                {
                  key: "jurisdiction", header: "Authorization", sortValue: (r) => r.jurisdiction.state,
                  render: (r) => <JurisdictionBadge state={r.jurisdiction.state} />,
                },
                {
                  key: "actions", header: "Actions",
                  render: (r) => (
                    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <IconLink href={`/patrols/${r.patrol.id}`} icon="eye" label="View" />
                      <IconLink href={`/patrols/${r.patrol.id}/replay`} icon="play" label="Replay" />
                      <IconLink href="/gis" icon="map" label="Open GIS" />
                      {rangerByPatrol(r.patrol) && <IconLink href={`/rangers/${rangerByPatrol(r.patrol)!.id}`} icon="users" label="View ranger" />}
                      {r.jurisdiction.authorization && <IconLink href={`/patrols/permissions/${r.jurisdiction.authorization.id}`} icon="lock" label="View authorization" />}
                      <IconLink href="/patrols/reports" icon="file" label="Report" />
                    </span>
                  ),
                },
              ]}
              empty={<p className="py-8 text-center text-sm text-ink-soft">No patrols match the filters.</p>}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          </>
        ) : (
          <PatrolTimeline rows={filtered} onOpen={(id) => router.push(`/patrols/${id}`)} />
        )}
      </Card>
    </div>
  );
}

function initialParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function IconLink({ href, icon, label }: { href: string; icon: "eye" | "play" | "map" | "users" | "lock" | "file"; label: string }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
    >
      <Icon name={icon} size={13} />
    </Link>
  );
}

function PatrolTimeline({ rows, onOpen }: { rows: { patrol: Patrol; jurisdiction: JurisdictionResolution }[]; onOpen(id: string): void }) {
  const days = useMemo(() => {
    const map = new Map<string, typeof rows>();
    rows.forEach((r) => {
      const key = new Date(r.patrol.startScheduled).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  return (
    <div className="max-h-[520px] space-y-4 overflow-y-auto p-4">
      {days.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">No patrols in this period.</p>}
      {days.map(([day, items]) => (
        <div key={day}>
          <p className="mb-1.5 text-xs font-medium text-ink-soft">{new Date(day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {items.length} patrols</p>
          <div className="space-y-1.5">
            {items.map(({ patrol, jurisdiction }) => (
              <button
                key={patrol.id}
                onClick={() => onOpen(patrol.id)}
                className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-forest-600 hover:bg-forest-50"
              >
                <span className="font-mono text-xs font-medium text-forest-800">{patrol.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{patrol.title}</span>
                <span className="hidden text-xs text-ink-soft sm:block">{patrol.leader}</span>
                <Badge tone={patrolStatusTone[patrol.status]}>{patrolStatusLabel[patrol.status]}</Badge>
                <JurisdictionBadge state={jurisdiction.state} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
