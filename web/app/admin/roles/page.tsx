"use client";

/** Roles & permissions (PRD §11.3) — role cards + permission matrix */

import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { Card, CardHeader, Badge, PageHeader, type BadgeTone } from "@/components/ui";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { permissionMatrix } from "@/lib/mock/admin";

const levelTone: Record<string, BadgeTone> = {
  full: "forest",
  manage: "info",
  view: "neutral",
  none: "danger",
};
const levelLabel: Record<string, string> = { full: "Full", manage: "Manage", view: "View", none: "None" };

export default function RolesPage() {
  const roles = useAsyncData(() => admin.roles());

  if (roles.loading || !roles.data) return <SkeletonRows rows={6} />;
  if (roles.error) return <ErrorState message={roles.error.message} onRetry={roles.reload} />;

  const data = roles.data;

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="Role-based access across modules" />

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
    </div>
  );
}

function cn(...args: unknown[]) { return args.filter(Boolean).join(" "); }