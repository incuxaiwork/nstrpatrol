"use client";

/** Teams (PRD §7.3) — squad composition and readiness. */

import { useRouter } from "next/navigation";
import { rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Avatar } from "@/components/ui";
import { DataTable, KpiCard } from "@/components/data";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";

export default function TeamsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => rangers.teams());
  const crew = useAsyncData(() => rangers.list());

  if (loading || !data) return <SkeletonRows rows={5} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const ready = data.filter((t) => t.onDuty >= t.size * 0.75).length;

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Squad composition, leaders and duty readiness"
        actions={
          <span className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink">
            <Badge tone="success">{ready}/${data.length}</Badge> ready
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Teams" value={data.length} icon="users" tone="forest" />
        <KpiCard label="Total strength" value={data.reduce((a, t) => a + t.size, 0)} icon="users" tone="info" />
        <KpiCard label="Currently on duty" value={data.reduce((a, t) => a + t.onDuty, 0)} icon="activity" tone="success" />
        <KpiCard label="Readiness" value={Math.round((ready / data.length) * 100)} unit="%" icon="shield" tone="khaki" />
      </div>

      <Card className="mt-4">
        <CardHeader title="All teams" icon="users" />
        <DataTable
          rows={data}
          loading={loading}
          onRowClick={(t) => router.push(`/rangers/teams`)}
          columns={[
            { key: "name", header: "Team", sortValue: (t) => t.name, render: (t) => (
              <div>
                <p className="font-medium text-ink">{t.name}</p>
                <p className="text-xs text-ink-soft">{t.id}</p>
              </div>
            ) },
            { key: "leader", header: "Leader", render: (t) => <LeaderCell name={t.leader} /> },
            { key: "size", header: "Size", sortValue: (t) => t.size, render: (t) => <span className="text-ink">{t.size}</span> },
            { key: "onDuty", header: "On duty", sortValue: (t) => t.onDuty,
              render: (t) => (
                <span className={t.onDuty >= t.size * 0.75 ? "font-medium text-success" : "font-medium text-warning"}>
                  {t.onDuty}/{t.size}
                </span>
              ) },
            { key: "unit", header: "Unit", render: (t) => <span className="text-ink-soft">{unitName(t.range)}</span> },
            { key: "vehicle", header: "Vehicle", render: (t) => <span className="text-ink-soft">{t.vehicleId ?? "—"}</span> },
            {
              key: "readiness", header: "Readiness", sortValue: (t) => t.onDuty / t.size,
              render: (t) => <Badge tone={t.onDuty >= t.size * 0.75 ? "success" : "warning"}>{t.onDuty >= t.size * 0.75 ? "Ready" : "Short"}</Badge>,
            },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No teams.</p>}
        />
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((t) => (
          <Card key={t.id}>
            <CardHeader
              title={t.name}
              icon="users"
              actions={<Badge tone={t.onDuty >= t.size * 0.75 ? "success" : "warning"}>{t.onDuty}/{t.size} on duty</Badge>}
            />
            <div className="space-y-2 p-4 text-sm text-ink-soft">
              <p>Leader: <span className="font-medium text-ink">{t.leader}</span></p>
              <p>Unit: {unitName(t.division)} / {unitName(t.range)}</p>
              <p>Vehicle: {t.vehicleId ?? "—"}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {crew.data?.filter((r) => r.teamId === t.id).map((r) => (
                  <Avatar key={r.id} name={r.name} size={26} />
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LeaderCell({ name }: { name: string }) {
  return <span className="text-ink-soft">{name}</span>;
}