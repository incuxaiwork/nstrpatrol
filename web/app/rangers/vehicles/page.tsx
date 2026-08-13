"use client";

/** Vehicles (PRD §7.4) — fleet status, deployment, servicing */

import { rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable, KpiCard } from "@/components/data";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatKm } from "@/lib/utils";
import type { BadgeTone } from "@/components/ui";
import type { Vehicle } from "@/lib/types";

const statusTone: Record<Vehicle["status"], BadgeTone> = {
  available: "neutral",
  deployed: "forest",
  maintenance: "warning",
};
const statusLabel: Record<Vehicle["status"], string> = {
  available: "Available",
  deployed: "Deployed",
  maintenance: "Maintenance",
};

export default function VehiclesPage() {
  const { data, error, loading, reload } = useAsyncData(() => rangers.vehicles());

  if (loading || !data) return <SkeletonRows rows={5} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader title="Vehicles" subtitle="Patrol fleet status and assignment" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total vehicles" value={data.length} icon="truck" tone="forest" />
        <KpiCard label="Deployed" value={data.filter((v) => v.status === "deployed").length} icon="route" tone="success" />
        <KpiCard label="Available" value={data.filter((v) => v.status === "available").length} icon="check" tone="info" />
        <KpiCard label="In maintenance" value={data.filter((v) => v.status === "maintenance").length} icon="sliders" tone="warning" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Fleet" icon="truck" />
        <DataTable
          rows={data}
          loading={loading}
          columns={[
            { key: "code", header: "Code", sortValue: (v) => v.code, render: (v) => <span className="font-mono text-xs font-medium text-forest-800">{v.code}</span> },
            { key: "vehicle", header: "Vehicle", sortValue: (v) => v.model, render: (v) => (
              <div>
                <p className="font-medium text-ink">{v.model}</p>
                <p className="text-xs text-ink-soft">{v.type} · {v.plate}</p>
              </div>
            ) },
            { key: "unit", header: "Unit", render: (v) => <span className="text-ink-soft">{unitName(v.division)}</span> },
            { key: "assigned", header: "Assigned to", render: (v) => <span className="text-ink-soft">{v.assignedTo ?? "Pool"}</span> },
            { key: "odometer", header: "Odometer", sortValue: (v) => v.odometerKm, render: (v) => <span className="text-ink-soft">{formatKm(v.odometerKm)}</span> },
            { key: "service", header: "Last service", render: (v) => <span className="text-ink-soft">{v.lastService ? timeAgo(v.lastService) : "—"}</span> },
            { key: "status", header: "Status", sortValue: (v) => v.status, render: (v) => <Badge tone={statusTone[v.status]} dot>{statusLabel[v.status]}</Badge> },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No vehicles on record.</p>}
        />
      </Card>
    </div>
  );
}