"use client";

/** Administration dashboard (PRD §11.1) — governance overview */

import Link from "next/link";
import { admin, hierarchy as hierarchyService, dashboard } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { KpiCard, DataTable } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { timeAgo } from "@/lib/utils";

export default function AdminDashboardPage() {
  const users = useAsyncData(() => admin.users());
  const roles = useAsyncData(() => admin.roles());
  const audit = useAsyncData(() => admin.audit());
  const md = useAsyncData(() => admin.masterData());
  const units = useAsyncData(() => hierarchyService.units());
  const dash = useAsyncData(() => dashboard.summary());

  if (users.loading || !users.data) return <SkeletonRows rows={7} />;
  if (users.error) return <ErrorState message={users.error.message} onRetry={users.reload} />;

  const active = users.data.filter((u) => u.status === "active").length;
  const divisions = units.data?.divisions ?? [];
  const rangesByDivision = units.data?.ranges ?? {};

  return (
    <div>
      <PageHeader title="Administration" subtitle="Users, roles, master data and system settings" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Users" value={users.data.length} icon="users" tone="forest" onClick={() => undefined} />
        <KpiCard label="Active" value={active} icon="check" tone="success" />
        <KpiCard label="Invited" value={users.data.filter((u) => u.status === "invited").length} icon="mail" tone="info" />
        <KpiCard label="Roles" value={roles.data?.length ?? 0} icon="shield" tone="khaki" />
        <KpiCard label="Species" value={md.data?.species.length ?? 0} icon="paw" tone="warning" />
        <KpiCard label="Audit entries" value={audit.data?.length ?? 0} icon="history" tone="neutral" />
      </div>

      {/* Forest hierarchy */}
      <div className="mt-4">
        <Card>
          <CardHeader title="Forest hierarchy" icon="tree" subtitle="Operational units & administrative divisions" />
          <div className="grid gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {divisions.map((d) => (
              <div key={d.id} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{d.name}</p>
                  <Badge tone="forest">{rangesByDivision[d.id]?.length ?? 0} ranges</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
                  <span>Patrols</span>
                  <span className="font-semibold text-ink">{dash.data?.patrolsTotal ?? "—"}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-soft">
                  <span>Coverage</span>
                  <span className="font-semibold text-ink">
                    {dash.data && dash.data.coveragePct > 0 ? `${dash.data.coveragePct}%` : "—"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-soft">
                  <span>Rangers</span>
                  <span className="font-semibold text-ink">{dash.data?.rangersTotal ?? "—"}</span>
                </div>
              </div>
            ))}
            {divisions.length === 0 && !units.loading && (
              <p className="col-span-full py-6 text-center text-sm text-ink-soft">
                No hierarchy data available yet.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Recent actions"
              icon="history"
              actions={<Link href="/admin/audit-logs" className="text-xs font-medium text-forest-700 hover:underline">Audit log →</Link>}
            />
            <DataTable
              rows={(audit.data ?? []).slice(0, 6)}
              loading={audit.loading}
              columns={[
                { key: "user", header: "User", sortValue: (a) => a.user, render: (a) => <span className="font-medium text-ink">{a.user}</span> },
                { key: "action", header: "Action", render: (a) => <span className="text-ink-soft">{a.action}</span> },
                { key: "target", header: "Target", render: (a) => <span className="font-mono text-xs text-forest-800">{a.target}</span> },
                { key: "time", header: "When", sortValue: (a) => new Date(a.time).getTime(), render: (a) => <span className="text-ink-soft">{timeAgo(a.time)}</span> },
              ]}
              empty={<p className="py-8 text-center text-sm text-ink-soft">No events.</p>}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="System status" icon="wifi" />
            <dl className="space-y-2.5 p-4 text-sm">
              <Row label="Notification service" value={<Badge tone="success">Operational</Badge>} />
              <Row label="Mock data layer" value={<Badge tone="neutral">Mock</Badge>} />
              <Row label="Time zone" value="Asia/Kolkata" />
              <Row label="Sync window" value="24 h" />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Quick links" icon="zap" />
            <div className="grid grid-cols-2 gap-2 p-4">
              {[
                { label: "Users", href: "/admin/users", icon: "users" },
                { label: "Roles", href: "/admin/roles", icon: "shield" },
                { label: "Master data", href: "/admin/master-data", icon: "box" },
                { label: "Audit", href: "/admin/audit-logs", icon: "history" },
                { label: "Settings", href: "/admin/settings", icon: "settings" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center gap-2 rounded-field border border-line bg-surface px-3 py-2.5 text-xs font-medium text-ink transition-colors hover:border-forest-600 hover:bg-forest-50">
                  <Icon name={l.icon as IconName} size={14} className="text-forest-800" />
                  {l.label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}