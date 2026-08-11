"use client";

/**
 * Ranger profile (PRD §7.2) — personal, duty and performance detail.
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo } from "react";
import { authorizations, patrols, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Avatar, Progress } from "@/components/ui";
import { StatRow, Timeline } from "@/components/data";
import { Icon } from "@/components/icons";
import { LineChart } from "@/components/charts";
import { JurisdictionBadge } from "@/components/jurisdiction";
import { authStatusLabel, authStatusTone, resolveJurisdiction } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { dutyStatusLabel, dutyStatusTone, patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatKm, formatMinutes } from "@/lib/utils";

export default function RangerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: ranger, error, loading, reload } = useAsyncData(() => rangers.get(params.id));
  const trend = useAsyncData(() => rangers.trend(params.id));
  const auths = useAsyncData(() => authorizations.list());
  const patrolData = useAsyncData(() => patrols.list());

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

  if (loading) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!ranger) return <NotFound what="ranger" id={params.id} />;

  const s = ranger.stats;
  const activeAuths = myAuths.filter((a) => a.status === "active");
  const currentPatrol = myPatrols.find((p) => p.status === "ongoing" || p.status === "delayed");

  return (
    <div>
      <PageHeader
        title={ranger.name}
        subtitle={`${ranger.code} · ${ranger.designation} · joined ${ranger.joinYear}`}
        actions={
          <>
            <Badge tone={dutyStatusTone[ranger.dutyStatus]} dot>{dutyStatusLabel[ranger.dutyStatus]}</Badge>
            <Link
              href="/patrols/permissions"
              className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="lock" size={14} /> View patrol permissions
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5 shadow-card sm:flex-row sm:items-center">
        <Avatar name={ranger.name} size={64} />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-ink">{ranger.name}</h2>
          <p className="text-sm text-ink-soft">
            {unitName(ranger.division)} · {unitName(ranger.range)} · {unitName(ranger.beat)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span>Blood group: {ranger.bloodGroup ?? "—"}</span>
            <span>Phone: {ranger.phone ?? "—"}</span>
            <span>Last sync: {ranger.lastSync ? timeAgo(ranger.lastSync) : "—"}</span>
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
              { label: "Coverage", value: `${s.coveragePct}%` },
              { label: "Observations", value: s.observations },
              { label: "Incidents", value: s.incidents, tone: s.incidents > 0 ? "danger" : undefined },
              { label: "Team", value: ranger.teamId },
            ]}
          />

          <Card>
            <CardHeader title="Performance trend" icon="chart" subtitle="Monthly patrols and beat coverage, last 6 months (mock)" />
            <div className="p-4">
              <LineChart
                dataset={
                  trend.data ?? {
                    labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
                    series: [{ name: "Patrols", values: [] }],
                  }
                }
                height={200}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Coverage vs beat target" icon="target" subtitle="Field coverage vs team average (mock)" />
            <div className="space-y-3 p-5">
              <Progress value={s.coveragePct} tone={s.coveragePct >= 80 ? "forest" : "warning"} />
              <p className="text-xs text-ink-soft">
                {ranger.name} covers <strong className="text-ink">{s.coveragePct}%</strong> of their home beat —
                {s.coveragePct >= 80 ? " above the forest average." : " below the forest average, consider schedule review."}
              </p>
              <p className="text-xs text-ink-soft">
                Cross-jurisdiction patrols are not counted here; they are flagged{" "}
                <strong className="text-ink">&quot;review&quot;</strong> until validated against an authorization.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Current patrol"
              icon="radio"
              subtitle={currentPatrol ? "Live field status (mock)" : "Not on patrol"}
            />
            {currentPatrol ? (
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-forest-800">{currentPatrol.code}</span>
                  <JurisdictionBadge state={resolveJurisdiction(currentPatrol, auths.data ?? []).state} />
                  <Badge tone={patrolStatusTone[currentPatrol.status]} dot>{patrolStatusLabel[currentPatrol.status]}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-soft">
                  {unitName(currentPatrol.beat)} · started {timeAgo(currentPatrol.startScheduled)}
                  {currentPatrol.distanceKm > 0 && ` · ${formatKm(currentPatrol.distanceKm)} covered`}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => router.push(`/patrols/${currentPatrol.id}`)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700"
                  >
                    <Icon name="eye" size={12} /> Live view
                  </button>
                  <button
                    onClick={() => router.push(`/patrols/${currentPatrol.id}/replay`)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line-strong bg-white px-3 text-xs font-medium text-ink hover:border-forest-600"
                  >
                    <Icon name="play" size={12} /> Replay
                  </button>
                </div>
              </div>
            ) : (
              <p className="p-4 text-sm text-ink-soft">No patrol in progress.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent patrols" icon="route" subtitle="Latest patrols with jurisdiction status (mock)" />
            {myPatrols.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">No patrols on record.</p>
            ) : (
              <div className="divide-y divide-line">
                {myPatrols.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="font-mono text-xs font-medium text-forest-800">{p.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                      <span className="block text-xs text-ink-soft">
                        {formatMinutes(p.durationMin)} · {formatKm(p.distanceKm)} · {timeAgo(p.startScheduled)}
                      </span>
                    </span>
                    <JurisdictionBadge state={resolveJurisdiction(p, auths.data ?? []).state} />
                    <Badge tone={patrolStatusTone[p.status]}>{patrolStatusLabel[p.status]}</Badge>
                    <button
                      onClick={() => router.push(`/patrols/${p.id}`)}
                      className="text-xs font-medium text-forest-700 hover:underline"
                    >
                      View →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" icon="history" subtitle="Latest events involving this ranger (mock)" />
            <div className="p-5">
              <Timeline
                items={[
                  ...(currentPatrol
                    ? [{ time: timeAgo(currentPatrol.startScheduled), title: `Started ${currentPatrol.title.toLowerCase()}`, detail: `${currentPatrol.code} · ${unitName(currentPatrol.beat)}`, tone: "forest" as const }]
                    : []),
                  { time: "2h ago", title: "Completed morning beat patrol", detail: "Patrol P-2026-0118", tone: "forest" },
                  { time: "6h ago", title: "Logged tiger pugmark sighting", detail: "Indirect sign S8", tone: "warning" },
                  { time: "2d ago", title: "Returned radio set to armory", detail: "Maintenance check", tone: "info" },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Normal jurisdiction" icon="map" />
            <dl className="space-y-2.5 p-4 text-sm">
              <DetailRow label="Division" value={unitName(ranger.division)} />
              <DetailRow label="Range" value={unitName(ranger.range)} />
              <DetailRow label="Beat" value={unitName(ranger.beat)} />
            </dl>
            <p className="border-t border-line p-4 text-xs text-ink-soft">
              Patrols outside this jurisdiction are out of authorization until approved through{" "}
              <Link href="/patrols/permissions" className="font-medium text-forest-700 hover:underline">patrol permissions</Link>.
            </p>
          </Card>

          <Card>
            <CardHeader
              title="Authorized exceptions"
              icon="lock"
              subtitle="Active permissions and recent cross-jurisdiction patrols"
            />
            {activeAuths.length > 0 ? (
              <div className="divide-y divide-line">
                {activeAuths.map((a) => (
                  <Link key={a.id} href={`/patrols/permissions/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.id}</p>
                      <p className="text-xs text-ink-soft">
                        {unitName(a.authDivision)} / {unitName(a.authRange)} / {unitName(a.authBeat)}
                      </p>
                    </div>
                    <Badge tone={authStatusTone[a.status]} dot>{authStatusLabel[a.status]}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-ink-soft">No active authorizations.</p>
            )}
            <div className="border-t border-line px-4 py-3">
              <p className="mb-2 text-xs font-medium text-ink-soft">Expired in last 60 days</p>
              {myAuths.filter((a) => a.status === "expired").length > 0 ? (
                <div className="space-y-1.5">
                  {myAuths.filter((a) => a.status === "expired").map((a) => (
                    <p key={a.id} className="text-xs text-ink-soft">
                      <span className="font-mono text-ink">{a.id}</span> — valid until {a.validUntil.slice(0, 10)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-soft">None</p>
              )}
            </div>
            <div className="border-t border-line px-4 py-3">
              <p className="mb-2 text-xs font-medium text-ink-soft">Recent cross-jurisdiction patrols</p>
              {crossJurisdiction.length > 0 ? (
                <div className="space-y-1.5">
                  {crossJurisdiction.slice(0, 4).map(({ patrol: p, j }) => (
                    <button key={p.id} onClick={() => router.push(`/patrols/${p.id}`)} className="flex w-full items-center justify-between gap-2 text-left hover:underline">
                      <span className="font-mono text-xs text-ink">{p.code}</span>
                      <Badge tone={j.state === "authorized-exception" ? "info" : "warning"}>
                        {j.state === "authorized-exception" ? "Authorized" : "Review"}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-soft">None</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Duty & contact" icon="info" />
            <dl className="space-y-2.5 p-4 text-sm">
              <DetailRow label="Duty status" value={<Badge tone={dutyStatusTone[ranger.dutyStatus]} dot>{dutyStatusLabel[ranger.dutyStatus]}</Badge>} />
              <DetailRow label="Designation" value={ranger.designation} />
              <DetailRow label="Division" value={unitName(ranger.division)} />
              <DetailRow label="Range" value={unitName(ranger.range)} />
              <DetailRow label="Beat" value={unitName(ranger.beat)} />
              <DetailRow label="Phone" value={ranger.phone ?? "—"} />
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

          <Card>
            <CardHeader title="Emergency" icon="alert" iconTone="danger" />
            <p className="p-4 text-sm text-ink-soft">
              Emergency contact and medical notes are visible to SOC duty officers only (mock placeholder).
            </p>
          </Card>
        </div>
      </div>
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
        <Icon name="chevronLeft" size={12} /> Back to rangers
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