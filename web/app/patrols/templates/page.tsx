"use client";

/**
 * Patrol templates (PRD §6.5) — reusable patrol blueprints with quick-start.
 */

import { useRouter } from "next/navigation";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { DataTable, PrimaryLink } from "@/components/data";
import { Icon, type IconName } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolTypeLabels } from "@/lib/mock/patrols";

const typeIcon: Record<string, IconName> = {
  routine: "route",
  night: "clock",
  special: "star",
  response: "sos",
  combing: "target",
};

export default function TemplatesPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.templates());

  if (loading || !data) return <SkeletonRows rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Patrol Templates"
        subtitle="Reusable patrol structures — start a patrol from a template"
        actions={<PrimaryLink href="/patrols/new" icon="plus">Create patrol</PrimaryLink>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((t) => (
          <Card key={t.id}>
            <CardHeader
              title={t.name}
              icon={typeIcon[t.type] ?? "route"}
              actions={<Badge tone="forest">{patrolTypeLabels[t.type]}</Badge>}
            />
            <div className="space-y-2 px-4 py-3 text-sm">
              <p className="text-ink-soft">{t.objective}</p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Fact label="Duration" value={durationLabel(t.durationMin)} />
                <Fact label="Checkpoints" value={`${t.checkpoints} CPs`} />
                <Fact label="Areas" value={t.areas} />
                <Fact label="Used" value={`${t.usedCount} times`} />
              </dl>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button
                onClick={() => router.push("/patrols/new")}
                className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line-strong bg-white px-3 text-xs font-medium text-ink hover:border-forest-600 hover:text-forest-800"
              >
                <Icon name="plus" size={13} />
                New patrol from this
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field bg-surface px-2.5 py-2">
      <dt className="text-[11px] text-ink-soft">{label}</dt>
      <dd className="text-xs font-semibold text-ink">{value}</dd>
    </div>
  );
}

function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}