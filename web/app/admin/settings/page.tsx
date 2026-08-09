"use client";

/** System settings (PRD §11.6) — operational thresholds + notification templates */

import { useApp } from "@/lib/store";
import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Field, Input, Select, Switch } from "@/components/ui";
import { DataTable } from "@/components/data";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";

export default function SettingsPage() {
  const { pushToast } = useApp();
  const settings = useAsyncData(() => admin.settings());
  const templates = useAsyncData(() => admin.notificationTemplates());

  if (settings.loading || !settings.data) return <SkeletonRows rows={6} />;
  if (settings.error) return <ErrorState message={settings.error.message} onRetry={settings.reload} />;

  const s = settings.data;

  return (
    <div>
      <PageHeader
        title="System Settings"
        subtitle="Operational thresholds and notification behaviour"
        actions={
          <button
            onClick={() => pushToast("success", "Saved", "Settings updated (mock — no backend write yet)")}
            className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
          >
            Save changes
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="General" icon="settings" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Site name">
              <Input defaultValue={s.siteName} />
            </Field>
            <Field label="Time zone">
              <Select defaultValue={s.timezone}>
                <option>Asia/Kolkata</option>
                <option>UTC</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Operational thresholds" icon="sliders" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Sync window (hours)" hint="How often field devices sync">
              <Input type="number" defaultValue={s.syncWindowHours} />
            </Field>
            <Field label="SOS response window (min)" hint="Response target after SOS">
              <Input type="number" defaultValue={s.sosWindowMin} />
            </Field>
            <Field label="Heatmap sensitivity" hint="0.0 – 1.0">
              <Input type="number" step="0.1" min="0" max="1" defaultValue={s.heatmapSensitivity} />
            </Field>
            <Field label="Offline grace (hours)" hint="When offline rangers are flagged">
              <Input type="number" defaultValue={s.offlineGraceHours} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Notification templates" icon="bell" subtitle="Message prototypes used by the alert engine" />
        <DataTable
          rows={templates.data ?? []}
          loading={templates.loading}
          columns={[
            { key: "name", header: "Template", sortValue: (t) => t.name, render: (t) => <span className="font-medium text-ink">{t.name}</span> },
            { key: "kind", header: "Kind", render: (t) => (
              <Badge tone={t.kind === "Critical" ? "danger" : t.kind === "Warning" ? "warning" : "info"}>{t.kind}</Badge>
            ) },
            { key: "subject", header: "Subject", render: (t) => <span className="font-mono text-xs text-ink-soft">{t.subject}</span> },
            { key: "body", header: "Body", render: (t) => <span className="line-clamp-1 max-w-md text-xs text-ink-soft">{t.body}</span> },
            { key: "enabled", header: "Enabled", render: (t) => (
              <Switch checked={t.enabled} onChange={() => undefined} label={`${t.name} enabled`} />
            ) },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No templates.</p>}
        />
      </Card>

      <p className="mt-3 text-xs text-ink-faint">
        Thresholds and templates are read from mock data — wire to the admin service endpoints when the backend lands.
      </p>
    </div>
  );
}