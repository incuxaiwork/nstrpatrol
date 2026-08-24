"use client";

/** Users (PRD Â§11.2) â€” accounts, roles and access status */

import { useState } from "react";
import { ACCOUNT_OPTIONS, admin } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Avatar, Badge, Card, Field, Input, PageHeader, SearchInput, Select } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination } from "@/components/data";
import { ConfirmDialog, Dialog, ExportButton, type ExportKind } from "@/components/overlays";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { timeAgo, geoLabel } from "@/lib/utils";
import { exportRows, stamp } from "@/lib/export";
import type { AdminUser } from "@/lib/types";

const statusTone: Record<string, "success" | "info" | "danger" | "neutral"> = {
  active: "success",
  invited: "info",
  disabled: "danger",
};
const statusLabel: Record<string, string> = { active: "Active", invited: "Invited", disabled: "Disabled" };

/**
 * Cryptographically secure temporary password (no email infrastructure
 * exists â€” the administrator hands these credentials to the new user).
 * ~103 bits of entropy from CSPRNG bytes over an unambiguous alphabet.
 */
function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(18);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${base}9A!`;
}

export default function AdminUsersPage() {
  const { pushToast } = useApp();
  const users = useAsyncData(() => admin.users());
  const roles = useAsyncData(() => admin.roles());

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cader, setCader] = useState("FBO");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  /** Shown ONCE after successful creation â€” never persisted or logged. */
  const [createdCreds, setCreatedCreds] = useState<{ name: string; email: string; password: string; role: string } | null>(null);
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const [intent, setIntent] = useState<"toggle" | "remove" | null>(null);

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
  const validNewUser = name.trim().length >= 3 && email.includes("@");
  const selectedAccount = ACCOUNT_OPTIONS.find((o) => o.value === cader);

  const handleExport = (kind: ExportKind) => {
    exportRows(kind, `admin-users-${stamp()}`, filtered.map((u) => ({
      name: u.name,
      email: u.email,
      role: roleName(u.roleId),
      division: geoLabel(u.division),
      status: statusLabel[u.status],
      lastActive: u.lastActive ?? "",
      created: u.created,
    })));
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Administrative accounts, roles and access state"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExport} />
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
            >
              Create user
            </button>
          </div>
        }
      />

      <Card>
        <FilterBar onClear={() => { setRoleFilter(""); setStatusFilter(""); }}>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-soft">Search</span>
            <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Name or emailâ€¦" className="w-52" />
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
            { key: "division", header: "Division", render: (u) => <span className="text-ink-soft">{geoLabel(u.division)}</span> },
            { key: "lastActive", header: "Last active", sortValue: (u) => new Date(u.lastActive ?? "").getTime(),
              render: (u) => <span className="text-ink-soft">{u.lastActive ? timeAgo(u.lastActive) : "â€”"}</span> },
            { key: "created", header: "Created", render: (u) => <span className="text-ink-soft">{u.created}</span> },
            { key: "status", header: "Status", sortValue: (u) => u.status, render: (u) => <Badge tone={statusTone[u.status]} dot>{statusLabel[u.status]}</Badge> },
            {
              key: "actions", header: "",
              render: (u) => (
                <div className="flex items-center justify-end gap-1">
                  {u.status === "disabled" ? (
                    <button
                      onClick={() => { setActionUser(u); setIntent("toggle"); }}
                      title="Enable user"
                      className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-forest-50 hover:text-forest-800"
                    >
                      <Icon name="check" size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setActionUser(u); setIntent("toggle"); }}
                      title="Disable user"
                      className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-danger/10 hover:text-danger"
                    >
                      <Icon name="power" size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => { setActionUser(u); setIntent("remove"); }}
                    title="Deactivate user"
                    className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-danger/10 hover:text-danger"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ),
            },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No users match the filters.</p>}
        />
        <Pagination page={page} pageSize={8} total={filtered.length} onChange={setPage} />
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create user" icon="users">
        <div className="space-y-4">
          <p className="rounded-card border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
            No email/SMS is sent â€” the portal has no messaging infrastructure. After
            creation you will see a one-time temporary password to hand over securely.
          </p>
          <Field label="Full name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neha Gupta" />
          </Field>
          <Field label="Work email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="neha.gupta@nstr.gov.in" />
          </Field>
          <Field label="Cadre / role" required>
            <Select value={cader} onChange={(e) => setCader(e.target.value)}>
              {ACCOUNT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-ink-soft">
            Creates a <strong className="text-ink">{selectedAccount?.role}</strong> account with cadre{" "}
            <strong className="text-ink">{cader}</strong>, exactly as the backend role model supports.
          </p>
          {createError && (
            <p className="rounded-card border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {createError}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setCreateOpen(false)} className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50">Cancel</button>
          <button
            disabled={!validNewUser || busy}
            onClick={async () => {
              setBusy(true);
              setCreateError(null);
              const password = generateTemporaryPassword();
              try {
                await admin.createUser({ name: name.trim(), email: email.trim(), cader, password });
                setCreateOpen(false);
                setName(""); setEmail("");
                users.reload();
                // Displayed once; not stored in app state beyond this view.
                setCreatedCreds({
                  name: name.trim(),
                  email: email.trim(),
                  password,
                  role: selectedAccount?.role ?? "RANGER",
                });
                pushToast("success", "User created", "Share the temporary credentials securely.");
              } catch (err) {
                setCreateError(err instanceof Error ? err.message : "User creation failed");
              } finally {
                setBusy(false);
              }
            }}
            className="h-9 rounded-field bg-forest-800 px-4 text-sm font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Creatingâ€¦" : "Create user"}
          </button>
        </div>
      </Dialog>

      {/* One-time credential reveal â€” never persisted, never re-shown. */}
      <Dialog open={createdCreds !== null} onClose={() => setCreatedCreds(null)} title="Temporary credentials" icon="lock">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            User created. Share these temporary credentials securely (in person or via an
            approved channel). They will not be shown again.
          </p>
          <div className="grid gap-2 rounded-card border border-line bg-surface p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-soft">User</span>
              <span className="font-medium text-ink">{createdCreds?.name} Â· {createdCreds?.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-soft">Role / cadre</span>
              <Badge tone="forest">{createdCreds?.role}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-soft">Temporary password</span>
              <code className="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-ink ring-1 ring-line">
                {createdCreds?.password}
              </code>
            </div>
          </div>
          <button
            onClick={() => {
              if (createdCreds) navigator.clipboard?.writeText(`${createdCreds.email}: ${createdCreds.password}`).catch(() => undefined);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line-strong bg-white px-3 text-xs font-medium text-ink hover:border-forest-600"
          >
            <Icon name="file" size={12} /> Copy credentials
          </button>
          <p className="text-xs text-ink-soft">
            The new user should change this password after first sign-in. The portal does not
            store or display it again.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={() => setCreatedCreds(null)} className="h-9 rounded-field bg-forest-800 px-4 text-sm font-medium text-white hover:bg-forest-700">
            Done â€” I&apos;ve shared it securely
          </button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={actionUser !== null}
        onClose={() => { setActionUser(null); setIntent(null); }}
        danger={intent === "remove"}
        title={
          intent === "remove"
            ? `Deactivate ${actionUser?.name}`
            : actionUser?.status === "disabled"
              ? `Reactivate ${actionUser?.name}`
              : `Deactivate ${actionUser?.name}`
        }
        message={
          intent === "remove"
            ? `${actionUser?.name}'s account will be deactivated â€” sign-in is disabled immediately. The account can be reactivated later and all records are kept. Nothing is permanently deleted.`
            : actionUser?.status === "disabled"
              ? `Reactivate ${actionUser?.name}? They regain access per their role.`
              : `${actionUser?.name} will be locked out until reactivated.`
        }
        confirmLabel={intent === "remove" ? "Deactivate user" : actionUser?.status === "disabled" ? "Enable user" : "Disable user"}
        onConfirm={async () => {
          if (!actionUser) return;
          const u = actionUser;
          const nextAction = intent;
          setActionUser(null);
          setIntent(null);
          if (nextAction === "remove") {
            await admin.removeUser(u.id);
            pushToast("warning", "User deactivated", `${u.name} can no longer sign in. Reactivate any time.`);
          } else {
            const next = u.status === "disabled" ? "active" : "disabled";
            await admin.setUserStatus(u.id, next);
            pushToast("info", "User updated", `${u.name} is now ${statusLabel[next].toLowerCase()}`);
          }
          users.reload();
        }}
      />
    </div>
  );
}