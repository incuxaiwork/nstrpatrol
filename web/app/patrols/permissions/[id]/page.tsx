"use client";

/**
 * Authorization Details (PRD §6.17–19) — full record of a special patrol
 * authorization: summary, ranger, normal vs authorized jurisdiction, GIS
 * map, reason and instruction, validity, approval, audit history timeline,
 * and every patrol conducted under the authorization.
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { authorizations, patrols, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, Avatar } from "@/components/ui";
import { DataTable, Timeline } from "@/components/data";
import { Icon } from "@/components/icons";
import { AuthAreaMap } from "@/components/jurisdiction";
import { ConfirmDialog } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { authStatusLabel, authStatusTone } from "@/lib/jurisdiction";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { unitName } from "@/lib/mock/hierarchy";
import { formatDateTime, formatMinutes, formatKm } from "@/lib/utils";

const CURRENT_ROLE = "super-admin";

export default function AuthorizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useApp();
  const { data: auth, error, loading, reload } = useAsyncData(() => authorizations.get(params.id));
  const roster = useAsyncData(() => rangers.list());
  const allPatrols = useAsyncData(() => patrols.list());
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const canManage = CURRENT_ROLE === "super-admin";

  const patrolsByAuth = useMemo(() => {
    if (!allPatrols.data || !auth) return [];
    return allPatrols.data
      .filter((p) => p.authorizationId === auth.id)
      .sort((a, b) => new Date(b.startScheduled).getTime() - new Date(a.startScheduled).getTime());
  }, [allPatrols.data, auth]);

  if (loading || roster.loading || !roster.data || allPatrols.loading || !allPatrols.data) return <SkeletonRows rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!auth) return <NotFound what="authorization" id={params.id} />;

  const ranger = roster.data.find((r) => r.id === auth.rangerId);

  return (
    <div>
      <PageHeader
        title={auth.id}
        subtitle={`Special patrol authorization · ${ranger?.name ?? auth.rangerId}`}
        actions={
          <>
            <Badge tone={authStatusTone[auth.status]} dot>{authStatusLabel[auth.status]}</Badge>
            <Badge tone={priorityTone[auth.priority]}>{auth.priority[0].toUpperCase() + auth.priority.slice(1)} priority</Badge>
            {canManage && auth.status === "pending" && (
              <button
                onClick={async () => {
                  await authorizations.approve(auth.id);
                  pushToast("success", "Authorization approved", `${auth.id} is now active.`);
                  reload();
                }}
                className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
              >
                <Icon name="check" size={15} /> Approve
              </button>
            )}
            {canManage && auth.status === "active" && (
              <button
                onClick={() => setConfirmRevoke(true)}
                className="inline-flex h-9 items-center gap-2 rounded-field border border-danger/40 bg-white px-4 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                <Icon name="x" size={15} /> Revoke
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Ranger" icon="users" subtitle="Authorization holder" />
            <div className="flex items-center gap-3 p-4">
              {ranger && <Avatar name={ranger.name} size={44} />}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{ranger?.name ?? auth.rangerId}</p>
                <p className="text-xs text-ink-soft">
                  {ranger?.code} · {ranger?.designation}
                </p>
              </div>
              {ranger && (
                <Link href={`/rangers/${ranger.id}`} className="text-xs font-medium text-forest-700 hover:underline">
                  View ranger profile →
                </Link>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Jurisdiction" icon="map" subtitle="Normal jurisdiction vs authorized area" />
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MiniArea label="Division" value={unitName(auth.homeDivision)} />
                  <MiniArea label="Range" value={unitName(auth.homeRange)} />
                  <MiniArea label="Beat" value={unitName(auth.homeBeat)} />
                </div>
                <p className="mt-3 text-xs text-ink-soft">Normal jurisdiction — where {ranger?.name ?? "the ranger"} routinely patrols</p>
                <div className="mt-4 rounded-card border border-warning/30 bg-warning-soft p-3">
                  <p className="text-xs font-medium text-[#8a4b00]">Authorized area</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {unitName(auth.authDivision)} / {unitName(auth.authRange)} / {unitName(auth.authBeat)}
                  </p>
                </div>
              </div>
              <AuthAreaMap homeIds={ranger ? [ranger.beat] : []} authIds={[auth.authBeat]} heightClass="h-56" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Operational details" icon="info" />
            <dl className="space-y-3 p-4 text-sm">
              <div>
                <dt className="text-xs text-ink-soft">Reason</dt>
                <dd className="mt-0.5 font-medium text-ink">{auth.reason}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Operational instruction</dt>
                <dd className="mt-0.5 font-medium text-ink">{auth.instruction}</dd>
              </div>
              {auth.objective && (
                <div>
                  <dt className="text-xs text-ink-soft">Operational objective</dt>
                  <dd className="mt-0.5 font-medium text-ink">{auth.objective}</dd>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-ink-soft">Patrol type</dt>
                  <dd className="mt-0.5 font-medium text-ink">{patrolTypeLabels[auth.patrolType]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-soft">Valid from</dt>
                  <dd className="mt-0.5 font-medium text-ink">{formatDateTime(auth.validFrom)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-soft">Valid until</dt>
                  <dd className="mt-0.5 font-medium text-ink">{formatDateTime(auth.validUntil)}</dd>
                </div>
              </div>
              {auth.restrictions && (
                <div>
                  <dt className="text-xs text-ink-soft">Special restrictions</dt>
                  <dd className="mt-0.5 font-medium text-ink">{auth.restrictions}</dd>
                </div>
              )}
              {auth.notes && (
                <div>
                  <dt className="text-xs text-ink-soft">Notes</dt>
                  <dd className="mt-0.5 text-ink-soft">{auth.notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Approval" icon="shield" />
            <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-soft">Approved by</dt>
                <dd className="mt-0.5 font-medium text-ink">{auth.approvedBy ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Approval date</dt>
                <dd className="mt-0.5 font-medium text-ink">{auth.approvalDate ? formatDateTime(auth.approvalDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Created</dt>
                <dd className="mt-0.5 font-medium text-ink">{formatDateTime(auth.createdDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Status</dt>
                <dd className="mt-0.5"><Badge tone={authStatusTone[auth.status]} dot>{authStatusLabel[auth.status]}</Badge></dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Related patrols" icon="route" subtitle="Patrols performed under this authorization" />
            {patrolsByAuth.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">No patrols recorded under this authorization yet.</p>
            ) : (
              <DataTable
                rows={patrolsByAuth}
                loading={false}
                onRowClick={(p) => router.push(`/patrols/${p.id}`)}
                columns={[
                  { key: "code", header: "Patrol ID", render: (p) => <span className="font-mono text-xs font-medium text-forest-800">{p.code}</span> },
                  { key: "date", header: "Date", sortValue: (p) => new Date(p.startScheduled).getTime(), render: (p) => <span className="text-xs text-ink-soft">{formatDateTime(p.startScheduled)}</span> },
                  { key: "ranger", header: "Ranger", render: (p) => <span className="text-ink-soft">{p.leader}</span> },
                  { key: "area", header: "Area", render: (p) => <span className="text-xs text-ink-soft">{unitName(p.beat)}</span> },
                  { key: "duration", header: "Duration", sortValue: (p) => p.durationMin, render: (p) => <span className="text-ink-soft">{p.durationMin > 0 ? formatMinutes(p.durationMin) : "—"}</span> },
                  { key: "distance", header: "Distance", sortValue: (p) => p.distanceKm, render: (p) => <span className="text-ink-soft">{p.distanceKm > 0 ? formatKm(p.distanceKm) : "—"}</span> },
                  { key: "status", header: "Status", sortValue: (p) => p.status, render: (p) => <Badge tone={patrolStatusTone[p.status]}>{patrolStatusLabel[p.status]}</Badge> },
                  {
                    key: "actions", header: "",
                    render: (p) => (
                      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/patrols/${p.id}`} title="View" aria-label="View patrol" className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:border-forest-600 hover:text-forest-800"><Icon name="eye" size={13} /></Link>
                        <Link href={`/patrols/${p.id}/replay`} title="Replay" aria-label="Replay patrol" className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:border-forest-600 hover:text-forest-800"><Icon name="play" size={13} /></Link>
                      </span>
                    ),
                  },
                ]}
                empty={null}
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Audit history" icon="history" subtitle="Every event with date, time, user and action" />
            <div className="p-4">
              <Timeline
                items={auth.history.map((h) => ({
                  time: formatDateTime(h.time),
                  title: h.action,
                  detail: `${h.user} — ${h.description}`,
                  tone: historyTone(h.action),
                  icon: historyIcon(h.action),
                }))}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Summary" icon="check" />
            <dl className="space-y-2.5 p-4 text-sm">
              <SummaryRow label="Authorization" value={<span className="font-mono">{auth.id}</span>} />
              <SummaryRow label="Ranger" value={ranger?.name ?? auth.rangerId} />
              <SummaryRow label="Home" value={`${unitName(auth.homeBeat)}`} />
              <SummaryRow label="Authorized" value={`${unitName(auth.authDivision)} / ${unitName(auth.authRange)} / ${unitName(auth.authBeat)}`} />
              <SummaryRow label="Patrols under auth" value={String(patrolsByAuth.length)} />
              <SummaryRow label="Status" value={<Badge tone={authStatusTone[auth.status]} dot>{authStatusLabel[auth.status]}</Badge>} />
            </dl>
            <div className="border-t border-line p-4">
              <Link href="/patrols/permissions" className="text-xs font-medium text-forest-700 hover:underline">
                ← All authorizations
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        danger
        title="Revoke this authorization?"
        message={`${auth.id} will be revoked immediately. Patrols already conducted under it remain on record for audit.`}
        confirmLabel="Revoke authorization"
        onClose={() => setConfirmRevoke(false)}
        onConfirm={async () => {
          await authorizations.revoke(auth.id);
          pushToast("warning", "Authorization revoked", `${auth.id} is no longer valid.`);
          reload();
        }}
      />
    </div>
  );
}

const priorityTone: Record<"low" | "medium" | "high" | "critical", "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

function historyTone(action: string): "forest" | "info" | "warning" | "danger" | "neutral" {
  if (action === "Approved" || action === "Completed") return "forest";
  if (action === "Revoked" || action === "Rejected" || action === "Expired") return "danger";
  if (action === "Used by ranger" || action === "Activated") return "info";
  return "neutral";
}

function historyIcon(action: string): "check" | "lock" | "alert" | "history" {
  if (action === "Approved") return "check";
  if (action === "Revoked" || action === "Rejected" || action === "Expired") return "alert";
  if (action === "Used by ranger" || action === "Activated") return "lock";
  return "history";
}

function MiniArea({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3 text-center">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-ink">{value}</p>
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
      <Link href="/patrols/permissions" className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700">
        <Icon name="chevronLeft" size={12} /> Back to patrol permissions
      </Link>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}
