"use client";

/** Roles & permissions (PRD §11.3) — role cards + permission matrix */

import { useState } from "react";
import { useApp } from "@/lib/store";
import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, Field, Input, type BadgeTone } from "@/components/ui";
import { Dialog } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { permissionMatrix } from "@/lib/mock/admin";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type PermissionLevel = "full" | "view" | "manage" | "none";

const levelTone: Record<string, BadgeTone> = {
  full: "forest",
  manage: "info",
  view: "neutral",
  none: "danger",
};
const levelLabel: Record<string, string> = { full: "Full", manage: "Manage", view: "View", none: "None" };

export default function RolesPage() {
  const { pushToast } = useApp();
  const roles = useAsyncData(() => admin.roles());
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [levels, setLevels] = useState<Record<string, PermissionLevel>>(
    Object.fromEntries(permissionMatrix.map((m) => [m.module, "view" as PermissionLevel]))
  );
  const [busy, setBusy] = useState(false);

  if (roles.loading || !roles.data) return <SkeletonRows rows={6} />;
  if (roles.error) return <ErrorState message={roles.error.message} onRetry={roles.reload} />;

  const data = roles.data;
  const valid = name.trim().length >= 3;

  const handleCreate = async () => {
    setBusy(true);
    await admin.createRole({ name: name.trim(), description: description.trim(), permissions: levels });
    setBusy(false);
    setCreateOpen(false);
    setName(""); setDescription("");
    setLevels(Object.fromEntries(permissionMatrix.map((m) => [m.module, "view" as PermissionLevel])));
    roles.reload();
    pushToast("success", "Role created", `${name.trim()} added with custom permissions (mock store)`);
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Role-based access across modules"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
          >
            Create role
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.name}
              icon="shield"
              actions={<Badge tone={r.system ? "forest" : "neutral"}>{r.system ? "System" : "Custom"}</Badge>}
            />
            <p className="px-4 text-sm text-ink-soft">{r.description}</p>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-3">
              {Object.entries(r.permissions).map(([mod, lvl]) => (
                <span
                  key={mod}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    lvl === "full" ? "bg-forest-100 text-forest-800" : lvl === "none" ? "bg-zinc-100 text-ink-faint" : lvl === "manage" ? "bg-info-soft text-info" : "bg-zinc-100 text-ink-soft"
                  )}
                >
                  {mod} · {levelLabel[lvl]}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-soft">
              <span>{r.userCount} user{r.userCount === 1 ? "" : "s"}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="Permission matrix" icon="grid" subtitle="Module × role capability grid" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-xs text-ink-soft">
                <th className="px-4 py-2.5 font-medium">Module</th>
{data.map((r) => (
                  <th key={r.id} className="px-4 py-2.5 font-medium">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {permissionMatrix.map((m) => (
                <tr key={m.module}>
                  <td className="px-4 py-2.5 font-medium text-ink">{m.label}</td>
                  {data.map((r) => {
                    const lvl = r.permissions[m.module] ?? "none";
                    return (
                      <td key={r.id} className="px-4 py-2.5">
                        <Badge tone={levelTone[lvl]}>{levelLabel[lvl]}</Badge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create role" icon="shield">
        <div className="space-y-4">
          <Field label="Role name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beat Guard" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role governs…" />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">Module permissions</p>
            <div className="space-y-1.5">
              {permissionMatrix.map((m) => (
                <label key={m.module} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2">
                  <span className="text-sm text-ink">{m.label}</span>
                  <select
                    value={levels[m.module]}
                    onChange={(e) => setLevels((l) => ({ ...l, [m.module]: e.target.value as PermissionLevel }))}
                    className="rounded-field border border-line-strong bg-white px-2 py-1.5 text-xs focus:border-forest-600 focus:outline-none"
                  >
                    {m.levels.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setCreateOpen(false)} className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50">Cancel</button>
          <button
            disabled={!valid || busy}
            onClick={handleCreate}
            className="h-9 rounded-field bg-forest-800 px-4 text-sm font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Creating…" : "Create role"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}