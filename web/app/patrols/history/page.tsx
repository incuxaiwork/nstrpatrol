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
import { Card, Badge, PageHeader, SearchInput } from "@/components/ui";
import { FilterSelect, FilterBar } from "@/components/data";
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
  const [status, setStatus] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [query, setQuery] = useState("");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const cutoff =
    dateRange === "today" ? todayStart
      : dateRange === "week" ? now.getTime() - 7 * 86_400_000
        : dateRange === "month" ? now.getTime() - 30 * 86_400_000
          : dateRange === "quarter" ? now.getTime() - 90 * 86_400_000
            : 0;

  const days = useMemo(() => {
    if (!data || !auths.data) return [];
    const q = query.trim().toLowerCase();
    const map = new Map<string, { patrol: (typeof data)[number]; state: JurisdictionState }[]>();
    data.forEach((p) => {
      if (status && p.status !== status) return;
      if (cutoff && new Date(p.startScheduled).getTime() < cutoff) return;
      const patrolState = resolveJurisdiction(p, auths.data ?? []).state;
      if (state && patrolState !== state) return;
      if (q && !p.code.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q) && !p.leader.toLowerCase().includes(q)) return;
      const key = new Date(p.startScheduled).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ patrol: p, state: patrolState });
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data, auths.data, state, status, cutoff, query]);

  if (loading || !data || auths.loading || !auths.data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Patrol History"
        subtitle="Chronological record of patrol activity recorded by rangers in the field"
      />

      <Card>
        <FilterBar
          onClear={() => { setState(""); setStatus(""); setDateRange(""); setQuery(""); }}
        >
          <FilterSelect label="Jurisdiction" value={state} onChange={setState}
            options={[
              { value: "normal", label: "Within normal jurisdiction" },
              { value: "authorized-exception", label: "Authorized exception" },
              { value: "pending-review", label: "Pending review" },
              { value: "requires-review", label: "Requires review" },
            ]} />
          <FilterSelect label="Status" value={status} onChange={setStatus}
            options={Object.entries(patrolStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect label="Period" value={dateRange} onChange={setDateRange}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "Last 7 days" },
              { value: "month", label: "Last 30 days" },
              { value: "quarter", label: "Last 90 days" },
            ]} />
          <SearchInput value={query} onChange={setQuery} placeholder="Search code, title or leader…" className="ml-auto w-56" />
        </FilterBar>

        <div className="max-h-[560px] space-y-5 overflow-y-auto p-4">
          {days.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-soft">No patrol history matches the filters.</p>
          )}
          {days.map(([day, items]) => (
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
