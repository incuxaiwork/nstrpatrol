"use client";

/** Master data (PRD §11.4) — species, categories, water bodies, patrol types, objectives, vehicle & weapon types */

import { useState } from "react";
import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data";
import { Tabs } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";

type TabKey = "species" | "categories" | "water" | "patrolTypes" | "objectives" | "vehicles" | "weapons";

export default function MasterDataPage() {
  const { pushToast } = useApp();
  const md = useAsyncData(() => admin.masterData());
  const [tab, setTab] = useState<TabKey>("species");

  if (md.loading || !md.data) return <SkeletonRows rows={7} />;
  if (md.error) return <ErrorState message={md.error.message} onRetry={md.reload} />;

  const d = md.data;
  const counts: Record<TabKey, number> = {
    species: d.species.length,
    categories: d.categories.length,
    water: d.waterBodyTypes.length,
    patrolTypes: d.patrolTypes.length,
    objectives: d.patrolObjectives.length,
    vehicles: d.vehicleTypes.length,
    weapons: d.weaponTypes.length,
  };

  return (
    <div>
      <PageHeader
        title="Master Data"
        subtitle="Reference lists used across the portal (species, categories, types)"
        actions={
          <button
            onClick={() => pushToast("info", "Master data", "Add/edit is a backend write — not available on mock (planned)")}
            className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
          >
            Add entry
          </button>
        }
      />

      <Tabs<TabKey>
        tabs={[
          { value: "species", label: "Species", count: counts.species },
          { value: "categories", label: "Report categories", count: counts.categories },
          { value: "water", label: "Water bodies", count: counts.water },
          { value: "patrolTypes", label: "Patrol types", count: counts.patrolTypes },
          { value: "objectives", label: "Objectives", count: counts.objectives },
          { value: "vehicles", label: "Vehicle types", count: counts.vehicles },
          { value: "weapons", label: "Weapon types", count: counts.weapons },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Card className="mt-2">
        {tab === "species" && (
          <DataTable
            rows={d.species.map((s) => ({ ...s, id: s.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Species", sortValue: (s) => s.name, render: (s) => <span className="font-medium text-ink">{s.name}</span> },
              { key: "category", header: "Category", render: (s) => <Badge tone="neutral">{s.category}</Badge> },
              { key: "status", header: "Conservation status", render: (s) => <StatusBadge status={s.status} /> },
            ]}
          />
        )}
        {tab === "categories" && (
          <DataTable
            rows={d.categories.map((c) => ({ ...c, id: c.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Category", sortValue: (c) => c.name, render: (c) => <span className="font-medium text-ink">{c.name}</span> },
              { key: "mappedTo", header: "Map key", render: (c) => <span className="font-mono text-xs text-forest-800">{c.mappedTo}</span> },
              { key: "active", header: "Active", render: (c) => <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Yes" : "No"}</Badge> },
            ]}
          />
        )}
        {tab === "water" && (
          <DataTable
            rows={d.waterBodyTypes.map((w) => ({ ...w, id: w.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Type", render: (w) => <span className="font-medium text-ink">{w.name}</span> },
              { key: "active", header: "Active", render: (w) => <Badge tone={w.active ? "success" : "neutral"}>{w.active ? "Yes" : "No"}</Badge> },
            ]}
          />
        )}
        {tab === "patrolTypes" && (
          <DataTable
            rows={d.patrolTypes.map((p) => ({ ...p, id: p.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Type", render: (p) => <span className="font-medium text-ink">{p.name}</span> },
              { key: "active", header: "Active", render: (p) => <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Yes" : "No"}</Badge> },
            ]}
          />
        )}
        {tab === "objectives" && (
          <DataTable
            rows={d.patrolObjectives.map((o) => ({ ...o, id: o.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Objective", render: (o) => <span className="font-medium text-ink">{o.name}</span> },
              { key: "active", header: "Active", render: (o) => <Badge tone={o.active ? "success" : "neutral"}>{o.active ? "Yes" : "No"}</Badge> },
            ]}
          />
        )}
        {tab === "vehicles" && (
          <DataTable
            rows={d.vehicleTypes.map((v) => ({ ...v, id: v.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Vehicle type", render: (v) => <span className="font-medium text-ink">{v.name}</span> },
              { key: "active", header: "Active", render: (v) => <Badge tone={v.active ? "success" : "neutral"}>{v.active ? "Yes" : "No"}</Badge> },
            ]}
          />
        )}
        {tab === "weapons" && (
          <DataTable
            rows={d.weaponTypes.map((w) => ({ ...w, id: w.id }))}
            loading={false}
            columns={[
              { key: "name", header: "Weapon type", render: (w) => <span className="font-medium text-ink">{w.name}</span> },
              { key: "active", header: "Active", render: (w) => <Badge tone={w.active ? "success" : "neutral"}>{w.active ? "Yes" : "No"}</Badge> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "threatened" ? "danger" : status === "rare" ? "warning" : "success";
  return <Badge tone={tone}>{status}</Badge>;
}