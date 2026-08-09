"use client";

/** Weapons & armory (PRD §7.5) — issuance and inspection status */

import { rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable, KpiCard } from "@/components/data";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo } from "@/lib/utils";
import type { BadgeTone } from "@/components/ui";
import type { Weapon } from "@/lib/types";

const tone: Record<Weapon["status"], BadgeTone> = { issued: "forest", armory: "neutral", maintenance: "warning" };
const label: Record<Weapon["status"], string> = { issued: "Issued", armory: "In armory", maintenance: "Maintenance" };

export default function WeaponsPage() {
  const { data, error, loading, reload } = useAsyncData(() => rangers.weapons());

  if (loading || !data) return <SkeletonRows rows={5} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader title="Weapons & Armory" subtitle="Issued weapons, holders and inspection cycle" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Weapons" value={data.length} icon="lock" tone="forest" />
        <KpiCard label="Issued" value={data.filter((w) => w.status === "issued").length} icon="check" tone="success" />
        <KpiCard label="In armory" value={data.filter((w) => w.status === "armory").length} icon="box" tone="info" />
        <KpiCard label="Maintenance" value={data.filter((w) => w.status === "maintenance").length} icon="sliders" tone="danger" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Register" icon="lock" />
        <DataTable
          rows={data}
          loading={loading}
          columns={[
            { key: "code", header: "Code", sortValue: (w) => w.code, render: (w) => <span className="font-mono text-xs font-medium text-forest-800">{w.code}</span> },
            { key: "weapon", header: "Weapon", sortValue: (w) => w.type, render: (w) => (
              <div>
                <p className="font-medium text-ink">{w.type}</p>
                <p className="text-xs text-ink-soft">{w.caliber}</p>
              </div>
            ) },
            { key: "unit", header: "Unit", render: (w) => <span className="text-ink-soft">{unitName(w.division)}</span> },
            { key: "holder", header: "Holder", render: (w) => <span className="text-ink-soft">{w.holderId ?? "—"}</span> },
            { key: "inspection", header: "Last inspection", render: (w) => <span className="text-ink-soft">{w.lastInspection ? timeAgo(w.lastInspection) : "—"}</span> },
            { key: "status", header: "Status", sortValue: (w) => w.status, render: (w) => <Badge tone={tone[w.status]} dot>{label[w.status]}</Badge> },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No weapons on record.</p>}
        />
      </Card>
    </div>
  );
}