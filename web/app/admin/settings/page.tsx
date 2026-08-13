"use client";

/** System settings (PRD §11.6) — operational thresholds + notification templates */

import { useState } from "react";
import { useApp } from "@/lib/store";
import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Field, Input, Select, Switch } from "@/components/ui";
import { DataTable } from "@/components/data";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import type { NotificationTemplate, SiteSettings } from "@/lib/types";

export default function SettingsPage() {
  const settings = useAsyncData(() => admin.settings());
  const templates = useAsyncData(() => admin.notificationTemplates());

  if (settings.loading || !settings.data) return <SkeletonRows rows={6} />;
  if (settings.error) return <ErrorState message={settings.error.message} onRetry={settings.reload} />;

  return (
    <SettingsForm
      initial={settings.data}
      templates={templates.data ?? []}
      onSaved={settings.reload}
      onTemplateToggled={(id, enabled) => {
        admin.setTemplateEnabled(id, enabled);
        templates.reload();
      }}
    />
  );
}

function SettingsForm({
  initial,
  templates,
  onSaved,
  onTemplateToggled,
}: {
  initial: SiteSettings;
  templates: NotificationTemplate[];
  onSaved(): void;
  onTemplateToggled(id: string, enabled: boolean): void;
}) {
  const { pushToast } = useApp();
  const [siteName, setSiteName] = useState(initial.siteName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [syncWindowHours, setSyncWindowHours] = useState(String(initial.syncWindowHours));
  const [sosWindowMin, setSosWindowMin] = useState(String(initial.sosWindowMin));
  const [heatmapSensitivity, setHeatmapSensitivity] = useState(String(initial.heatmapSensitivity));
  const [offlineGraceHours, setOfflineGraceHours] = useState(String(initial.offlineGraceHours));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await admin.saveSettings({
      siteName: siteName.trim() || initial.siteName,
      timezone,
      syncWindowHours: Number(syncWindowHours) || initial.syncWindowHours,
      sosWindowMin: Number(sosWindowMin) || initial.sosWindowMin,
      heatmapSensitivity: Math.min(1, Math.max(0, Number(heatmapSensitivity) || initial.heatmapSensitivity)),
      offlineGraceHours: Number(offlineGraceHours) || initial.offlineGraceHours,
    });
    setSaving(false);
    onSaved();
    pushToast("success", "Saved", "Settings updated in the mock store (persist until reload)");
  };

  return (
    <div>
      <PageHeader
        title="System Settings"
        subtitle="Operational thresholds and notification behaviour"
        actions={
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700 disabled:opacity-45"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="General" icon="settings" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Site name">
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </Field>
            <Field label="Time zone">
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
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
              <Input type="number" value={syncWindowHours} onChange={(e) => setSyncWindowHours(e.target.value)} />
            </Field>
            <Field label="SOS response window (min)" hint="Response target after SOS">
              <Input type="number" value={sosWindowMin} onChange={(e) => setSosWindowMin(e.target.value)} />
            </Field>
            <Field label="Heatmap sensitivity" hint="0.0 – 1.0">
              <Input type="number" step="0.1" min="0" max="1" value={heatmapSensitivity} onChange={(e) => setHeatmapSensitivity(e.target.value)} />
            </Field>
            <Field label="Offline grace (hours)" hint="When offline rangers are flagged">
              <Input type="number" value={offlineGraceHours} onChange={(e) => setOfflineGraceHours(e.target.value)} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Notification templates" icon="bell" subtitle="Message prototypes used by the alert engine" />
        <DataTable
          rows={templates}
          loading={false}
          columns={[
            { key: "name", header: "Template", sortValue: (t) => t.name, render: (t) => <span className="font-medium text-ink">{t.name}</span> },
            { key: "kind", header: "Kind", render: (t) => (
              <Badge tone={t.kind === "Critical" ? "danger" : t.kind === "Warning" ? "warning" : "info"}>{t.kind}</Badge>
            ) },
            { key: "subject", header: "Subject", render: (t) => <span className="font-mono text-xs text-ink-soft">{t.subject}</span> },
            { key: "body", header: "Body", render: (t) => <span className="line-clamp-1 max-w-md text-xs text-ink-soft">{t.body}</span> },
            { key: "enabled", header: "Enabled", render: (t) => (
              <Switch
                checked={t.enabled}
                onChange={(v) => {
                  onTemplateToggled(t.id, v);
                  pushToast(v ? "info" : "warning", "Template updated", `${t.name} ${v ? "enabled" : "disabled"} (mock store)`);
                }}
                label={`${t.name} enabled`}
              />
            ) },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No templates.</p>}
        />
      </Card>

      <p className="mt-3 text-xs text-ink-faint">
        Thresholds and templates are stored in the client-side mock store — swap for API calls when the backend lands.
      </p>
    </div>
  );
}