"use client";

/** Equipment (PRD §7.6) — field kit stock, distribution and condition */

import { rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable, KpiCard } from "@/components/data";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import type { BadgeTone } from "@/components/ui";
import type { EquipmentItem } from "@/lib/types";

const tone: Record<EquipmentItem["status"], BadgeTone> = {
  serviceable: "success",
  low: "warning",
  depleted: "danger",
  maintenance: "info",
};
const label: Record<EquipmentItem["status"], string> = {
  serviceable: "Serviceable",
  low: "Low stock",
  depleted: "Depleted",
  maintenance: "In maintenance",
};

export default function EquipmentPage() {
  const { data, error, loading, reload } = useAsyncData(() => rangers.equipment(), [], { cacheKey: "rangers:equipment" });

  if (loading || !data) return <SkeletonRows rows={5} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader title="Equipment" subtitle="Field kit, distribution level and condition" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Item types" value={data.length} icon="box" tone="forest" />
        <KpiCard label="Serviceable" value={data.filter((e) => e.status === "serviceable").length} icon="check" tone="success" />
        <KpiCard label="Low stock" value={data.filter((e) => e.status === "low" || e.status === "depleted").length} icon="alert" tone="warning" />
        <KpiCard label="In maintenance" value={data.filter((e) => e.status === "maintenance").length} icon="sliders" tone="info" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Stock register" icon="box" />
        <DataTable
          rows={data}
          loading={loading}
          columns={[
            { key: "name", header: "Item", sortValue: (e) => e.name, render: (e) => <span className="font-medium text-ink">{e.name}</span> },
            { key: "category", header: "Category", render: (e) => <Badge tone="neutral">{e.category}</Badge> },
            { key: "unit", header: "Unit", render: (e) => <span className="text-ink-soft">{unitName(e.division)}</span> },
            {
              key: "stock", header: "Distribution", sortValue: (e) => e.distributed / e.quantity,
              render: (e) => (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={e.distributed >= e.quantity ? "h-full rounded-full bg-danger" : "h-full rounded-full bg-forest-600"}
                      style={{ width: `${(e.distributed / e.quantity) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-soft">{e.distributed}/{e.quantity}</span>
                </div>
              ),
            },
            { key: "status", header: "Status", sortValue: (e) => e.status, render: (e) => <Badge tone={tone[e.status]} dot>{label[e.status]}</Badge> },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No equipment on record.</p>}
        />
      </Card>
    </div>
  );
}