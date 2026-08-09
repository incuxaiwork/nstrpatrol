"use client";

/** Users (PRD §11.2) — accounts, roles and access status */

import { useState } from "react";
import { admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Avatar, Badge, Card, Field, Input, PageHeader, SearchInput, Select } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination } from "@/components/data";
import { Dialog } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { unitName } from "@/lib/mock/hierarchy";
import { timeAgo } from "@/lib/utils";

const statusTone: Record<string, "success" | "info" | "danger" | "neutral"> = {
  active: "success",
  invited: "info",
  disabled: "danger",
};
const statusLabel: Record<string, string> = { active: "Active", invited: "Invited", disabled: "Disabled" };

export default function AdminUsersPage() {
  const { pushToast } = useApp();
  const users = useAsyncData(() => admin.users());
  const roles = useAsyncData(() => admin.roles());

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("forest-officer");

  if (users.loading || !users.data) return <SkeletonRows rows={7} />;
  if (users.error) return <ErrorState message={users.error.message} onRetry={users.reload} />;

  const q = query.trim().toLowerCase();
  const filtered = users.data.filter(
    (u) =>
      (!roleFilter || u.roleId === roleFilter) &&
      (!statusFilter || u.status === statusFilter) &&
      (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  );

  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Administrative accounts, roles and access state"
        actions={
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
          >
            Invite user
          </button>
        }
      />

      <Card>
        <FilterBar onClear={() => { setRoleFilter(""); setStatusFilter(""); }}>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-soft">Search</span>
            <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Name or email…" className="w-52" />
          </label>
          <FilterSelect label="Role" value={roleFilter} onChange={(v) => { setRoleFilter(v); setPage(1); }}
            options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={Object.keys(statusLabel).map((k) => ({ value: k, label: statusLabel[k] }))} />
        </FilterBar>
        <DataTable
          rows={filtered.slice((page - 1) * 8, page * 8)}
          loading={users.loading}
          columns={[
            {
              key: "user", header: "User", sortValue: (u) => u.name,
              render: (u) => (
                <div className="flex items-center gap-2.5">
                  <Avatar name={u.name} size={30} />
                  <div>
                    <p className="font-medium text-ink">{u.name}</p>
                    <p className="text-xs text-ink-soft">{u.email}</p>
                  </div>
                </div>
              ),
            },
            { key: "role", header: "Role", render: (u) => <Badge tone="forest">{roleName(u.roleId)}</Badge> },
            { key: "division", header: "Division", render: (u) => <span className="text-ink-soft">{unitName(u.division)}</span> },
            { key: "lastActive", header: "Last active", sortValue: (u) => new Date(u.lastActive ?? "").getTime(),
              render: (u) => <span className="text-ink-soft">{u.lastActive ? timeAgo(u.lastActive) : "—"}</span> },
            { key: "created", header: "Created", render: (u) => <span className="text-ink-soft">{u.created}</span> },
            { key: "status", header: "Status", sortValue: (u) => u.status, render: (u) => <Badge tone={statusTone[u.status]} dot>{statusLabel[u.status]}</Badge> },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No users match the filters.</p>}
        />
        <Pagination page={page} pageSize={8} total={filtered.length} onChange={setPage} />
      </Card>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite user" icon="mail">
        <div className="space-y-4">
          <Field label="Full name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neha Gupta" />
          </Field>
          <Field label="Work email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="neha.gupta@nstr.gov.in" />
          </Field>
          <Field label="Role" required>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {(roles.data ?? []).filter((r) => !r.system || r.id !== "admin").map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setInviteOpen(false)} className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50">Cancel</button>
          <button
            onClick={() => {
              setInviteOpen(false);
              setName(""); setEmail("");
              pushToast("success", "Invitation sent", `Invite dispatched to ${email || "the new user"} (mock)`);
            }}
            className="h-9 rounded-field bg-forest-800 px-4 text-sm font-medium text-white hover:bg-forest-700"
          >
            Send invite
          </button>
        </div>
      </Dialog>
    </div>
  );
}