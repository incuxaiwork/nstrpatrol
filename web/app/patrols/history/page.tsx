"use client";

/**
 * Patrol History (PRD §6 — new operating model) — chronological record of
 * patrol activity synced from the field. Grouped by day with jurisdiction
 * status so officers can review what happened, where, and under which
 * authorization.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { authorizations, patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, Badge, PageHeader } from "@/components/ui";
import { FilterSelect } from "@/components/data";
import { JurisdictionBadge } from "@/components/jurisdiction";
import { resolveJurisdiction } from "@/lib/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolStatusLabel, patrolStatusTone } from "@/lib/nav";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo, formatMinutes, formatKm } from "@/lib/utils";
import type { JurisdictionState } from "@/lib/types";

export default function PatrolHistoryPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsyncData(() => patrols.list());
  const auths = useAsyncData(() => authorizations.list());
  const [state, setState] = useState("");

  const days = useMemo(() => {
    if (!data || !auths.data) return [];
    const map = new Map<string, { patrol: (typeof data)[number]; state: JurisdictionState }[]>();
    data.forEach((p) => {
      const key = new Date(p.startScheduled).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ patrol: p, state: resolveJurisdiction(p, auths.data ?? []).state });
    });
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, items]) => ({
        day,
        items: items.filter((i) => !state || i.state === state),
      }))
      .filter((d) => d.items.length > 0);
  }, [data, auths.data, state]);

  if (loading || !data || auths.loading || !auths.data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const total = days.reduce((a, d) => a + d.items.length, 0);

  return (
    <div>
      <PageHeader
        title="Patrol History"
        subtitle="Chronological record of patrol activity recorded by rangers in the field"
      />

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <p className="text-xs text-ink-soft">{total} patrols · grouped by day</p>
          <FilterSelect
            label="Jurisdiction"
            value={state}
            onChange={setState}
            options={[
              { value: "normal", label: "Within normal jurisdiction" },
              { value: "authorized-exception", label: "Authorized exception" },
              { value: "pending-review", label: "Pending review" },
              { value: "requires-review", label: "Requires review" },
            ]}
          />
        </div>

        <div className="max-h-[560px] space-y-5 overflow-y-auto p-4">
          {days.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-soft">No patrol history matches the filter.</p>
          )}
          {days.map(({ day, items }) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-2">
                <span className="size-2 rounded-full bg-forest-700" />
                <p className="text-sm font-semibold text-ink">
                  {new Date(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <Badge tone="neutral">{items.length} patrols</Badge>
              </div>
              <div className="space-y-1.5">
                {items.map(({ patrol, state: st }) => (
                  <button
                    key={patrol.id}
                    onClick={() => router.push(`/patrols/${patrol.id}`)}
                    className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-forest-600 hover:bg-forest-50"
                  >
                    <span className="font-mono text-xs font-medium text-forest-800">{patrol.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{patrol.title}</span>
                      <span className="block text-xs text-ink-soft">
                        {patrol.leader} · {unitName(patrol.beat)} · {timeAgo(patrol.startScheduled)}
                        {patrol.durationMin > 0 && ` · ${formatMinutes(patrol.durationMin)}`}
                        {patrol.distanceKm > 0 && ` · ${formatKm(patrol.distanceKm)}`}
                      </span>
                    </span>
                    <Badge tone={patrolStatusTone[patrol.status]}>{patrolStatusLabel[patrol.status]}</Badge>
                    <JurisdictionBadge state={st} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
