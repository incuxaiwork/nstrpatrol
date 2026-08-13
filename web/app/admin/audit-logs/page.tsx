"use client";

/** Audit logs (PRD §11.5) — trace of administrative actions */

import { useState } from "react";
import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination, KpiCard } from "@/components/data";
import { ExportButton, type ExportKind } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { timeAgo, formatDateTime } from "@/lib/utils";
import { exportRows, stamp } from "@/lib/export";

export default function AuditLogsPage() {
  const audit = useAsyncData(() => admin.audit());
  const [module, setModule] = useState("");
  const [page, setPage] = useState(1);

  if (audit.loading || !audit.data) return <SkeletonRows rows={7} />;
  if (audit.error) return <ErrorState message={audit.error.message} onRetry={audit.reload} />;

  const modules = [...new Set(audit.data.map((a) => a.module))];
  const filtered = audit.data.filter((a) => !module || a.module === module);

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Immutable trail of governance actions (mock)"
        actions={
          <ExportButton
            onExport={(kind: ExportKind) =>
              exportRows(kind, `audit-log-${stamp()}`, filtered.map((a) => ({
                user: a.user,
                action: a.action,
                target: a.target,
                module: a.module,
                ip: a.ip,
                time: a.time,
              })))
            }
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Entries" value={audit.data.length} icon="history" tone="forest" />
        <KpiCard label="Modules" value={modules.length} icon="layers" tone="info" />
        <KpiCard label="System events" value={audit.data.filter((a) => a.user === "System").length} icon="settings" tone="khaki" />
        <KpiCard label="Latest" value={timeAgo(audit.data[0].time)} icon="zap" tone="warning" />
      </div>

      <Card className="mt-4">
        <FilterBar onClear={() => setModule("")}>
          <FilterSelect label="Module" value={module} onChange={(v) => { setModule(v); setPage(1); }}
            options={modules.map((m) => ({ value: m, label: m }))} />
        </FilterBar>
        <DataTable
          rows={filtered.slice((page - 1) * 8, page * 8)}
          loading={audit.loading}
          columns={[
            { key: "user", header: "Actor", sortValue: (a) => a.user, render: (a) => <span className="font-medium text-ink">{a.user}</span> },
            { key: "action", header: "Action", render: (a) => <Badge tone="neutral">{a.action}</Badge> },
            { key: "target", header: "Target", render: (a) => <span className="font-mono text-xs text-forest-800">{a.target}</span> },
            { key: "module", header: "Module", render: (a) => <span className="text-ink-soft">{a.module}</span> },
            { key: "ip", header: "IP", render: (a) => <span className="font-mono text-xs text-ink-faint">{a.ip}</span> },
            { key: "time", header: "When", sortValue: (a) => new Date(a.time).getTime(),
              render: (a) => (
                <div>
                  <p className="text-ink">{timeAgo(a.time)}</p>
                  <p className="text-xs text-ink-faint">{formatDateTime(a.time)}</p>
                </div>
              ) },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No audit events match.</p>}
        />
        <Pagination page={page} pageSize={8} total={filtered.length} onChange={setPage} />
      </Card>
    </div>
  );
}