"use client";

/**
 * Ranger profile (PRD §7.2) — personal, duty and performance detail.
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authorizations, observations, patrols, rangers } from "@/lib/services";
import { api } from "@/lib/api";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, Avatar, Select, Input } from "@/components/ui";
import { Pagination, StatRow } from "@/components/data";
import { Icon } from "@/components/icons";
import { LineChart } from "@/components/charts";
import { Dialog, Dropdown, DropdownItem } from "@/components/overlays";
import { JurisdictionBadge } from "@/components/jurisdiction";
import { authStatusLabel, authStatusTone, resolveJurisdiction } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { dutyStatusLabel, dutyStatusTone, patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { unitName } from "@/lib/mock/hierarchy";
import { categoryMeta } from "@/lib/mock/observations";
import { timeAgo, formatKm, formatMinutes, geoLabel } from "@/lib/utils";
import { ReportButton } from "@/components/reports/ReportButton";
import { RangerReportDialog } from "@/components/reports/dialogs";

export default function RangerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast, user } = useApp();
  const { data: ranger, error, loading, reload } = useAsyncData(() => rangers.get(params.id), [], { cacheKey: `ranger:${params.id}`, pollInterval: 15000 });
  const trend = useAsyncData(() => rangers.trend(params.id), [], { cacheKey: `ranger:${params.id}:trend`, pollInterval: 60000 });
  const auths = useAsyncData(() => authorizations.list(), [], { cacheKey: "patrols:auths", pollInterval: 30000 });
  const patrolData = useAsyncData(() => patrols.list(), [], { cacheKey: "patrols:list", pollInterval: 15000 });
  const hierarchyData = useAsyncData(() => import("@/lib/services").then(m => m.hierarchy.units()), [], { cacheKey: "hierarchy:units", pollInterval: 60000 });
  const covData = useAsyncData(() => import("@/lib/api").then(m => m.api.coverage.rangers().catch(() => null)), [], { cacheKey: `ranger:${params.id}:coverage`, pollInterval: 30000 });
  const rawUserData = useAsyncData(() => import("@/lib/api").then(m => m.api.users.list({ role: "RANGER" }).catch(() => [] as any[])), [], { cacheKey: "rangers:rawUsers", pollInterval: 15000 });
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const teamsData = useAsyncData(() => rangers.teams().catch(() => []), [], { cacheKey: "rangers:teams", pollInterval: 60000 });
  const teamName = useMemo(() => {
    const t = (teamsData.data ?? []).find((x: any) => x.id === ranger?.teamId);
    return t ? t.name : ranger?.teamId || "—";
  }, [teamsData.data, ranger?.teamId]);

  const myAuths = useMemo(
    () => (auths.data ?? []).filter((a) => a.rangerId === params.id),
    [auths.data, params.id]
  );
  const myPatrols = useMemo(
    () =>
      (patrolData.data ?? [])
        .filter((p) => p.rangerId === params.id || p.leader === ranger?.name)
        .sort((a, b) => new Date(b.startScheduled).getTime() - new Date(a.startScheduled).getTime()),
    [patrolData.data, params.id, ranger?.name]
  );
  const crossJurisdiction = useMemo(
    () =>
      myPatrols
        .map((p) => ({ patrol: p, j: resolveJurisdiction(p, auths.data ?? []) }))
        .filter((x) => x.j.state !== "normal"),
    [myPatrols, auths.data]
  );

  // Observations for this officer (recordedBy === ranger.name) — live
  const obsData = useAsyncData(() => observations.list(), [], { cacheKey: `ranger:${params.id}:obs`, pollInterval: 15000 });
  const currentPatrol = useMemo(() => myPatrols.find((p) => p.status === "ongoing" || p.status === "delayed"), [myPatrols]);

  const myObservations = useMemo(
    () => (obsData.data ?? []).filter((o) => o.recordedBy === ranger?.name),
    [obsData.data, ranger?.name]
  );
  const [obsType, setObsType] = useState("");
  const [obsSub, setObsSub] = useState("");
  const obsSubOptions = useMemo(() => {
    const base = obsType ? myObservations.filter((o) => o.category === obsType) : myObservations;
    return [...new Set(base.map((o) => o.subcategory).filter(Boolean))].sort() as string[];
  }, [myObservations, obsType]);
  const filteredObs = useMemo(() => {
    return myObservations.filter((o) => {
      if (obsType && o.category !== obsType) return false;
      if (obsSub && o.subcategory !== obsSub) return false;
      return true;
    });
  }, [myObservations, obsType, obsSub]);

  // Unified patrols: current patrol on top with live indication
  const allPatrolsSorted = useMemo(() => {
    if (!currentPatrol) return myPatrols;
    const others = myPatrols.filter((p) => p.id !== currentPatrol.id);
    return [currentPatrol, ...others];
  }, [myPatrols, currentPatrol]);

  const PATROL_PAGE_SIZE = 10;
  const OBS_PAGE_SIZE = 10;
  const [patrolPage, setPatrolPage] = useState(1);
  const [obsPage, setObsPage] = useState(1);
  useEffect(() => { setPatrolPage(1); }, [myPatrols.length]);
  useEffect(() => { setObsPage(1); }, [obsType, obsSub, myObservations.length]);

  // Real-time stats derived from live patrols/observations/coverage (updates every 15-30s) — hooks before early returns
  const coverageRow = useMemo(() => (covData.data?.rows ?? []).find((r: any) => r.userId === ranger?.id), [covData.data, ranger?.id]);
  const s = useMemo(() => {
    if (!ranger) return { patrols: 0, distanceKm: 0, fieldHours: 0, coveragePct: null as number | null, observations: 0, incidents: 0 };
    const patrolCount = myPatrols.length;
    const totalDistance = myPatrols.reduce((a, p) => a + (p.distanceKm ?? 0), 0);
    const fieldHours = myPatrols.filter((p) => p.status === "completed" && p.startActual && p.endActual).reduce((a, p) => {
      const ms = new Date(p.endActual!).getTime() - new Date(p.startActual!).getTime();
      return a + (Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0);
    }, 0);
    const obsCount = myObservations.length;
    const incidentCount = myObservations.filter((o) => ["human-impact", "mortality"].includes(o.category)).length;
    const coveragePct = coverageRow?.coveragePercent ?? ranger.stats.coveragePct ?? null;
    return {
      patrols: patrolCount,
      distanceKm: Math.round(totalDistance * 100) / 100,
      fieldHours: Math.round(fieldHours * 10) / 10,
      coveragePct,
      observations: obsCount,
      incidents: incidentCount,
    };
  }, [ranger, myPatrols, myObservations, coverageRow]);

  // Real-time hierarchy resolution for Duty & contact blanks — hooks before early returns
  const areaLabels = useMemo(() => {
    if (!ranger) return { division: "—", range: "—", beat: "—" };
    const raw = (rawUserData.data ?? []).find((u: any) => u.id === ranger.id) as any;
    const tree = hierarchyData.data as any;
    const beatName = raw?.beatId && tree ? (() => {
      for (const div of tree.divisions ?? []) for (const rng of tree.ranges[div.id] ?? []) for (const b of tree.beats[rng.id] ?? []) if (b.id === raw.beatId) return b.name;
      return null;
    })() : null;
    const rangeName = raw?.rangeId && tree ? (() => {
      for (const div of tree.divisions ?? []) for (const rng of tree.ranges[div.id] ?? []) if (rng.id === raw.rangeId) return rng.name;
      return null;
    })() : null;
    return {
      division: geoLabel(ranger.division) !== "—" ? geoLabel(ranger.division) : raw?.divisionId ?? "—",
      range: rangeName ? geoLabel(rangeName) : geoLabel(ranger.range),
      beat: beatName ? geoLabel(beatName) : geoLabel(ranger.beat),
    };
  }, [ranger, rawUserData.data, hierarchyData.data]);

  const lastSyncReal = useMemo(() => {
    if (!ranger) return null;
    const patrolTimes = myPatrols.map((p) => p.endActual ?? p.startActual ?? p.startScheduled).filter(Boolean) as string[];
    const obsTimes = myObservations.map((o) => o.recordedAt).filter(Boolean) as string[];
    const all = [...patrolTimes, ...obsTimes, ranger.lastSync ?? ""].filter(Boolean);
    if (!all.length) return null;
    const sorted = all.map((t) => new Date(t).getTime()).filter(Number.isFinite).sort((a, b) => b - a);
    return sorted.length ? new Date(sorted[0]).toISOString() : null;
  }, [ranger, myPatrols, myObservations]);

  const trendDataset = useMemo(() => {
    if (trend.data) return trend.data;
    const now = new Date();
    const labels: string[] = [];
    const values: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString("en", { month: "short" }));
      const count = myPatrols.filter((p) => {
        const dt = new Date(p.startScheduled);
        return dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear();
      }).length;
      values.push(count);
    }
    return { labels, series: [{ name: "Patrols", values }] };
  }, [trend.data, myPatrols]);

  const patrolPageRows = useMemo(() => allPatrolsSorted.slice((patrolPage - 1) * PATROL_PAGE_SIZE, patrolPage * PATROL_PAGE_SIZE), [allPatrolsSorted, patrolPage]);
  const obsPageRows = useMemo(() => filteredObs.slice((obsPage - 1) * OBS_PAGE_SIZE, obsPage * OBS_PAGE_SIZE), [filteredObs, obsPage]);

  if (loading) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!ranger) return <NotFound what="ranger" id={params.id} />;

  const activeAuths = myAuths.filter((a) => a.status === "active");

  return (
    <div>
      <PageHeader
        title={ranger.name}
        subtitle={`${ranger.code} · ${ranger.designation.toUpperCase()} · joined ${ranger.joinYear}`}
        actions={
          <>
            <Badge tone={dutyStatusTone[ranger.dutyStatus]} dot>{dutyStatusLabel[ranger.dutyStatus]}</Badge>
            <ReportButton onClick={() => setReportOpen(true)} />
            <Link
              href="/patrols/permissions"
              className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="lock" size={14} /> View patrol permissions
            </Link>
            <Dropdown
              open={menuOpen}
              onToggle={setMenuOpen}
              label="Officer actions"
              trigger={
                <button className="flex size-9 items-center justify-center rounded-field border border-line-strong bg-white text-ink hover:border-forest-600 hover:text-forest-800" aria-label="More actions">
                  <Icon name="more" size={16} />
                </button>
              }
            >
              <DropdownItem icon="edit" onClick={() => { setMenuOpen(false); router.push(`/rangers/${ranger.id}/edit`); }}>Edit officer</DropdownItem>
              <DropdownItem icon="trash" danger onClick={() => { setMenuOpen(false); setDeletePassword(""); setDeleteError(""); setRemoveOpen(true); }}>Remove officer</DropdownItem>
            </Dropdown>
          </>
        }
      />

      <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5 shadow-card sm:flex-row sm:items-center">
        <Avatar name={ranger.name} size={64} />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-ink">{ranger.name}</h2>
          <p className="text-sm text-ink-soft">
            {areaLabels.division} · {areaLabels.range} · {areaLabels.beat}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span>Blood group: {ranger.bloodGroup ?? "—"}</span>
            <span>Phone: {ranger.phone ?? "—"}</span>
            <span>Last sync: {lastSyncReal ? timeAgo(lastSyncReal) : "—"}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <MiniStat label="Patrols" value={s.patrols} />
          <MiniStat label="Distance" value={formatKm(s.distanceKm)} />
          <MiniStat label="Field hours" value={formatMinutes(s.fieldHours)} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <StatRow
            items={[
              { label: "Coverage", value: s.coveragePct != null ? `${s.coveragePct}%` : "—" },
              { label: "Observations", value: s.observations },
              { label: "Incidents", value: s.incidents, tone: s.incidents > 0 ? "danger" : undefined },
              { label: "Team", value: teamName },
            ]}
          />

          <Card>
            <CardHeader title="Performance trend" icon="chart" subtitle="Monthly patrols — last 6 months (live)" />
            <div className="p-4">
              <LineChart dataset={trendDataset} height={200} />
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title={`All patrols — ${myPatrols.length}`} icon="route" subtitle={currentPatrol ? "Current patrol on top (live)" : "No active patrol"} />
              {myPatrols.length === 0 ? (
                <p className="p-4 text-sm text-ink-soft">No patrols on record for this officer.</p>
              ) : (
                <>
                  <div className="divide-y divide-line">
                    {patrolPageRows.map((p) => {
                      const isCurrent = currentPatrol?.id === p.id;
                      return (
                        <div key={p.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${isCurrent ? "bg-forest-50/60" : ""}`}>
                          <span className="font-mono text-xs font-medium text-forest-800">{p.code}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                              {isCurrent && <Badge tone="success" dot>Live</Badge>}
                            </span>
                            <span className="block text-xs text-ink-soft">
                              {formatMinutes(p.durationMin)} · {p.distanceKm != null ? formatKm(p.distanceKm) : "—"} · {timeAgo(p.startScheduled)} · {geoLabel(p.beat) || "—"}
                            </span>
                          </span>
                          <JurisdictionBadge state={resolveJurisdiction(p, auths.data ?? []).state} />
                          <Badge tone={patrolStatusTone[p.status]}>{patrolStatusLabel[p.status]}</Badge>
                          <button onClick={() => router.push(`/patrols/${p.id}`)} className="text-xs font-medium text-forest-700 hover:underline">
                            View →
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {allPatrolsSorted.length > PATROL_PAGE_SIZE && (
                    <Pagination page={patrolPage} pageSize={PATROL_PAGE_SIZE} total={allPatrolsSorted.length} onChange={setPatrolPage} />
                  )}
                </>
              )}
            </Card>

            <Card>
              <CardHeader title={`Observations — ${filteredObs.length}`} icon="binoculars" subtitle={`Noted by ${ranger.name} · ${myObservations.length} total`} />
              <div className="border-b border-line bg-surface/50 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-ink-soft">Type</span>
                    <Select value={obsType} onChange={(e) => { setObsType(e.target.value); setObsSub(""); }}>
                      <option value="">All types</option>
                      <option value="human-impact">Human Activity</option>
                      <option value="water-body">Water Resource</option>
                      <option value="mortality">Animal Mortality</option>
                      <option value="wildlife">Animal Sightings</option>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-ink-soft">Category</span>
                    <Select value={obsSub} onChange={(e) => setObsSub(e.target.value)} disabled={obsSubOptions.length === 0}>
                      <option value="">{obsType ? "All categories" : "Select a type first"}</option>
                      {obsSubOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                  </label>
                </div>
                {(obsType || obsSub) && (
                  <button onClick={() => { setObsType(""); setObsSub(""); }} className="mt-2 text-xs text-forest-700 hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
              {obsData.loading ? (
                <p className="p-4 text-sm text-ink-soft">Loading observations…</p>
              ) : filteredObs.length === 0 ? (
                <p className="p-4 text-sm text-ink-soft">
                  {myObservations.length === 0 ? "No observations recorded by this officer yet." : "No observations match the selected filters."}
                </p>
              ) : (
                <>
                  <div className="divide-y divide-line">
                    {obsPageRows.map((o) => (
                      <div key={o.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface/50">
                        <div className="mt-1 size-2 shrink-0 rounded-full" style={{ background: categoryMeta[o.category]?.color ?? "#757575" }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {o.code} · {o.title}
                          </p>
                          <p className="text-xs text-ink-soft">
                            {categoryMeta[o.category]?.label ?? o.category} {o.subcategory ? `· ${o.subcategory}` : ""} · {o.severity} · {timeAgo(o.recordedAt)}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-ink">{o.description}</p>
                        </div>
                        <Badge tone={o.status === "open" ? "info" : o.status === "resolved" ? "success" : o.status === "escalated" ? "danger" : "neutral"}>{o.status}</Badge>
                      </div>
                    ))}
                  </div>
                  {filteredObs.length > OBS_PAGE_SIZE && (
                    <Pagination page={obsPage} pageSize={OBS_PAGE_SIZE} total={filteredObs.length} onChange={setObsPage} />
                  )}
                </>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Duty & contact" icon="info" />
            <dl className="space-y-2.5 p-4 text-sm">
              <DetailRow label="Duty status" value={<Badge tone={dutyStatusTone[ranger.dutyStatus]} dot>{dutyStatusLabel[ranger.dutyStatus]}</Badge>} />
              <DetailRow label="Designation" value={ranger.designation.toUpperCase()} />
              <DetailRow label="Division" value={areaLabels.division} />
              <DetailRow label="Range" value={areaLabels.range} />
              <DetailRow label="Beat" value={areaLabels.beat} />
              <DetailRow label="Phone" value={ranger.phone ?? "—"} />
              <DetailRow label="Emergency contact" value="—" />
              <DetailRow label="Emergency phone" value="—" />
              <DetailRow label="Blood group" value={ranger.bloodGroup ?? "—"} />
              <DetailRow label="Join year" value={String(ranger.joinYear)} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Vehicle & weapon" icon="truck" />
            <dl className="space-y-2.5 p-4 text-sm">
              <DetailRow label="Vehicle" value={ranger.vehicleId ? `Linked (${ranger.vehicleId})` : "—"} />
              <DetailRow label="Weapon" value={ranger.weaponId ? `Linked (${ranger.weaponId})` : "—"} />
            </dl>
            <div className="border-t border-line p-4">
              <button
                onClick={() => router.push("/rangers/vehicles")}
                className="text-xs font-medium text-forest-700 hover:underline"
              >
                Manage vehicles & assets →
              </button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={removeOpen}
        onClose={() => { if (!deleteLoading) { setRemoveOpen(false); setDeletePassword(""); setDeleteError(""); } }}
        title="Remove officer"
        icon="alert"
        footer={
          <>
            <button
              onClick={() => { if (!deleteLoading) { setRemoveOpen(false); setDeletePassword(""); setDeleteError(""); } }}
              className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50"
              disabled={deleteLoading}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!deletePassword.trim()) { setDeleteError("Password is required"); return; }
                if (!user?.email) { setDeleteError("No admin session"); return; }
                setDeleteLoading(true);
                setDeleteError("");
                try {
                  // Verify portal password via login (no token side-effect beyond verification)
                  await api.auth.login(user.email, deletePassword);
                  await rangers.remove(ranger.id);
                  pushToast("warning", "Officer removed", `${ranger.name} removed from the directory`);
                  setRemoveOpen(false);
                  setDeletePassword("");
                  router.push("/rangers");
                } catch (e: any) {
                  setDeleteError(e?.message ?? "Password verification failed");
                } finally {
                  setDeleteLoading(false);
                }
              }}
              disabled={deleteLoading || !deletePassword.trim()}
              className="h-9 rounded-field bg-danger px-4 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
            >
              {deleteLoading ? "Verifying…" : "Remove officer"}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Remove <span className="font-medium text-ink">{ranger.name}</span> ({ranger.code}) from the directory? Historical patrol and authorization records are kept. This action requires admin portal password.
        </p>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-ink">Admin portal password</label>
          <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Enter your portal password" autoFocus />
          {deleteError && <p className="mt-2 text-xs text-danger">{deleteError}</p>}
        </div>
      </Dialog>
      <RangerReportDialog open={reportOpen} onClose={() => setReportOpen(false)} ranger={ranger} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function NotFound({ what, id }: { what: string; id: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-card border border-line bg-white p-6 text-center">
      <Icon name="search" size={28} className="text-ink-faint" />
      <p className="text-sm font-medium text-ink">
        {what[0].toUpperCase() + what.slice(1)} <span className="font-mono">{id}</span> not found
      </p>
      <p className="max-w-sm text-xs text-ink-soft">It may not exist in the mock records.</p>
      <Link href="/rangers" className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700">
        <Icon name="chevronLeft" size={12} /> Back to officers
      </Link>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}