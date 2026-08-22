"use client";

/** App Releases — publish Android APK builds so field devices self-update. */

import { useRef, useState } from "react";
import { appReleases, type ApiAppRelease } from "@/lib/api";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Badge, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function AppReleasesPage() {
  const { pushToast } = useApp();
  const releases = useAsyncData(() => appReleases.list());
  const fileInput = useRef<HTMLInputElement>(null);

  const [apkFile, setApkFile] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState("");
  const [versionName, setVersionName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function handlePublish() {
    setFormError("");
    if (!apkFile) {
      setFormError("Select the release APK first.");
      return;
    }
    const code = Number(versionCode);
    if (!Number.isInteger(code) || code < 1) {
      setFormError("Version code must be a positive integer and greater than every published build.");
      return;
    }
    if (!versionName.trim()) {
      setFormError("Version name is required.");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await appReleases.uploadApk(apkFile);
      await appReleases.register({
        versionCode: code,
        versionName: versionName.trim(),
        apkKey: uploaded.key,
        sha256: uploaded.sha256,
        sizeBytes: uploaded.size,
        notes: notes.trim() || undefined,
      });
      pushToast("success", `Release ${versionName} published`, "Devices update on next app open");
      setApkFile(null);
      setVersionCode("");
      setVersionName("");
      setNotes("");
      if (fileInput.current) fileInput.current.value = "";
      releases.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  function nextCode(): string {
    const max = (releases.data ?? []).reduce((m, r) => Math.max(m, r.versionCode), 0);
    return max > 0 ? String(max + 1) : "";
  }

  const rows = releases.data ?? [];

  return (
    <div>
      <PageHeader
        title="App Releases"
        subtitle="Publish APK builds; ranger devices prompt to install them on next app open."
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="Publish a new build" />
          <div className="flex flex-col gap-3 p-4">
            <Field label="Release APK" required>
              <input
                ref={fileInput}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                onChange={(e) => setApkFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Version code" hint={`Next suggested: ${nextCode() || "1"}`} required>
              <Input
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={nextCode() || "1"}
                inputMode="numeric"
              />
            </Field>
            <Field label="Version name" required>
              <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="1.1.0" />
            </Field>
            <Field label="Release notes" hint="Shown on the device update prompt">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Photo sync fixes, faster maps…"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </Field>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy || releases.loading}
              className="rounded-lg bg-forest-700 px-4 py-2 text-sm font-medium text-white hover:bg-forest-800 disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload & publish"}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Published releases" />
          <div className="p-4">
            {releases.error ? (
              <ErrorState onRetry={releases.reload} />
            ) : releases.loading && rows.length === 0 ? (
              <SkeletonRows rows={3} />
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No releases published yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-3">Version</th>
                    <th className="pb-2 pr-3">Size</th>
                    <th className="pb-2 pr-3">Notes</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as ApiAppRelease[]).map((r) => (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 pr-3 font-medium">
                        {r.versionName} <span className="text-xs text-muted">(code {r.versionCode})</span>
                      </td>
                      <td className="py-2.5 pr-3">{formatBytes(r.sizeBytes)}</td>
                      <td className="max-w-[280px] truncate py-2.5 pr-3 text-muted">{r.notes ?? "—"}</td>
                      <td className="py-2.5">
                        <Badge tone={r.isLatest ? "success" : "neutral"}>{r.isLatest ? "Latest" : "Superseded"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
