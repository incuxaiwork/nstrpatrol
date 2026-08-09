"use client";

/**
 * Ranger profile (PRD §7.2) — personal, duty and performance detail.
 */

import { useParams, useRouter } from "next/navigation";
import { rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader, Avatar, Progress } from "@/components/ui";
import { StatRow, Timeline } from "@/components/data";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { dutyStatusLabel, dutyStatusTone } from "@/lib/nav";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatKm, formatMinutes } from "@/lib/utils";

export default function RangerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useApp();
  const { data: ranger, error, loading, reload } = useAsyncData(() => rangers.get(params.id));

  if (loading || !ranger) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const s = ranger.stats;

  return (
    <div>
      <PageHeader
        title={ranger.name}
        subtitle={`${ranger.code} · ${ranger.designation} · joined ${ranger.joinYear}`}
        actions={
          <>
            <Badge tone={dutyStatusTone[ranger.dutyStatus]} dot>{dutyStatusLabel[ranger.dutyStatus]}</Badge>
            <button
              onClick={() => pushToast("info", "Ranger record", "Field edits are not available on mock data yet")}
              className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
            >
              <Icon name="pencil" size={14} /> Edit record
            </button>
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
            <CardHeader title="Coverage trend" icon="target" subtitle="Field coverage vs team average (mock)" />
            <div className="space-y-3 p-5">
              <Progress value={s.coveragePct} tone={s.coveragePct >= 80 ? "forest" : "warning"} />
              <p className="text-xs text-ink-soft">
                {ranger.name} covers <strong className="text-ink">{s.coveragePct}%</strong> of their assigned beat —
                {s.coveragePct >= 80 ? " above the forest average." : " below the forest average, consider schedule review."}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Issued equipment" icon="box" subtitle="Personally assigned items" />
            {ranger.equipment?.length ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {ranger.equipment.map((e) => (
                  <div key={e.serial} className="rounded-card border border-line bg-surface p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-ink">{e.item}</p>
                      <Badge tone={e.condition === "serviceable" ? "success" : e.condition === "lost" ? "danger" : "warning"}>
                        {e.condition.replace("-", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">Serial {e.serial}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-ink-soft">No equipment assigned on record.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" icon="history" subtitle="Latest events involving this ranger (mock)" />
            <div className="p-5">
              <Timeline
                items={[
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}