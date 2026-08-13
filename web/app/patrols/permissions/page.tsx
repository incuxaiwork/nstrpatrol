"use client";

/**
 * Patrol Permissions (PRD §6 — Patrol Permissions workspace).
 *
 * Rangers decide and conduct their patrols within their authorized
 * operational area. This workspace manages the EXCEPTION: special patrol
 * authorizations that let a ranger patrol outside their normal jurisdiction
 * for a specific operational reason and period.
 *
 * Only a Super Admin / authorized senior officer may create, approve or
 * revoke authorizations. Other roles see the workspace read-only.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { authorizations, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, Badge, PageHeader } from "@/components/ui";
import { DataTable, FilterBar, FilterSelect, Pagination } from "@/components/data";
import { Icon } from "@/components/icons";
import { ConfirmDialog, ExportButton } from "@/components/overlays";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { authStatusLabel, authStatusTone, areaLabel } from "@/lib/jurisdiction";
import { timeAgo } from "@/lib/utils";

/** Mock current role — in the live system this comes from the session. */
const CURRENT_ROLE = "super-admin";

const PAGE_SIZE = 10;

export default function PatrolPermissionsPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const { data, error, loading, reload } = useAsyncData(() => authorizations.list());
  const roster = useAsyncData(() => rangers.list());
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<{ id: string; kind: "approve" | "revoke" | "reject" | "complete" } | null>(null);

  const canManage = CURRENT_ROLE === "super-admin";

  const confirmCopy: Record<NonNullable<typeof confirming>["kind"], { title: string; label: string; message: string; danger?: boolean }> = {
    approve: {
      title: "Approve this authorization?",
      label: "Approve authorization",
      message: "The authorization becomes active immediately and the ranger can patrol the authorized area.",
    },
    revoke: {
      title: "Revoke this authorization?",
      label: "Revoke authorization",
      danger: true,
      message: "The authorization will be revoked immediately. Patrols already conducted under it remain on record for audit.",
    },
    reject: {
      title: "Reject this authorization?",
      label: "Reject authorization",
      danger: true,
      message: "The ranger will be notified that the request was not approved.",
    },
    complete: {
      title: "Mark this authorization complete?",
      label: "Mark complete",
      message: "All patrols under this authorization have concluded. The record stays available for audit.",
    },
  };

  const runConfirm = async () => {
    if (!confirming) return;
    const { id, kind } = confirming;
    if (kind === "approve") {
      await authorizations.approve(id);
      pushToast("success", "Authorization approved", `${id} activated`);
    } else if (kind === "revoke") {
      await authorizations.revoke(id);
      pushToast("warning", "Authorization revoked", `${id} is no longer valid`);
    } else if (kind === "reject") {
      await authorizations.reject(id);
      pushToast("info", "Authorization rejected", `${id} was not approved`);
    } else {
      await authorizations.complete(id);
      pushToast("success", "Authorization completed", `${id} marked complete`);
    }
    setConfirming(null);
    reload();
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter((a) => {
      if (status && a.status !== status) return false;
      if (q) {
        const ranger = roster.data?.find((r) => r.id === a.rangerId);
        if (
          !a.id.toLowerCase().includes(q) &&
          !(ranger?.name.toLowerCase().includes(q) ?? false) &&
          !a.reason.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [data, status, query, roster.data]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading || !data || roster.loading || !roster.data) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const rangerOf = (id: string) => roster.data?.find((r) => r.id === id);

  return (
    <div>
      <PageHeader
        title="Patrol Permissions"
        subtitle="Manage exceptional patrol access and operational authorizations"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              rows={(data ?? []).map((a) => ({
                id: a.id,
                ranger: rangerOf(a.rangerId)?.name ?? a.rangerId,
                homeArea: areaLabel(a.homeDivision, a.homeRange, a.homeBeat),
                authorizedArea: areaLabel(a.authDivision, a.authRange, a.authBeat),
                reason: a.reason,
                status: a.status,
                priority: a.priority,
                validFrom: a.validFrom,
                validUntil: a.validUntil,
                approvedBy: a.approvedBy ?? "",
                created: a.createdDate,
              }))}
              filename="patrol-authorizations"
            />
            {canManage && (
              <Link
                href="/patrols/permissions/new"
                className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
              >
                <Icon name="plus" size={15} /> Create authorization
              </Link>
            )}
          </div>
        }
      />

      <Card>
        <FilterBar onClear={() => { setStatus(""); setQuery(""); setPage(1); }}>
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={Object.entries(authStatusLabel).map(([v, l]) => ({ value: v, label: l }))} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search ID, ranger or reason…"
            className="ml-auto h-9 w-56 rounded-field border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-forest-600"
          />
        </FilterBar>

        <DataTable
          rows={pageRows}
          loading={loading}
          onRowClick={(a) => router.push(`/patrols/permissions/${a.id}`)}
          columns={[
            {
              key: "id", header: "Authorization ID", sortValue: (a) => a.id,
              render: (a) => <span className="font-mono text-xs font-medium text-forest-800">{a.id}</span>,
            },
            {
              key: "ranger", header: "Ranger", sortValue: (a) => rangerOf(a.rangerId)?.name ?? "",
              render: (a) => {
                const r = rangerOf(a.rangerId);
                return (
                  <div>
                    <p className="font-medium text-ink">{r?.name ?? a.rangerId}</p>
                    <p className="text-xs text-ink-soft">{r?.designation}</p>
                  </div>
                );
              },
            },
            {
              key: "home", header: "Home jurisdiction", sortValue: (a) => a.homeBeat,
              render: (a) => <span className="text-xs text-ink-soft">{areaLabel(a.homeDivision, a.homeRange, a.homeBeat)}</span>,
            },
            {
              key: "auth", header: "Authorized area", sortValue: (a) => a.authBeat,
              render: (a) => (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-[#8a4b00]">
                  {areaLabel(a.authDivision, a.authRange, a.authBeat)}
                </span>
              ),
            },
            {
              key: "reason", header: "Reason", sortValue: (a) => a.reason,
              render: (a) => <span className="line-clamp-1 max-w-56 text-xs text-ink-soft">{a.reason}</span>,
            },
            { key: "validFrom", header: "Valid from", sortValue: (a) => new Date(a.validFrom).getTime(),
              render: (a) => <span className="text-xs text-ink-soft">{new Date(a.validFrom).toLocaleDateString()}</span> },
            { key: "validUntil", header: "Valid until", sortValue: (a) => new Date(a.validUntil).getTime(),
              render: (a) => <span className="text-xs text-ink-soft">{new Date(a.validUntil).toLocaleDateString()}</span> },
            { key: "approvedBy", header: "Approved by", render: (a) => <span className="text-xs text-ink-soft">{a.approvedBy ?? "—"}</span> },
            {
              key: "status", header: "Status", sortValue: (a) => a.status,
              render: (a) => <Badge tone={authStatusTone[a.status]} dot>{authStatusLabel[a.status]}</Badge>,
            },
            {
              key: "created", header: "Created", sortValue: (a) => new Date(a.createdDate).getTime(),
              render: (a) => <span className="text-xs text-ink-soft">{timeAgo(a.createdDate)}</span>,
            },
            {
              key: "actions", header: "Actions",
              render: (a) => (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/patrols/permissions/${a.id}`}
                    title="View details"
                    aria-label="View details"
                    className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                  >
                    <Icon name="eye" size={13} />
                  </Link>
                  {canManage && a.status === "pending" && (
                    <>
                      <button
                        onClick={() => setConfirming({ id: a.id, kind: "approve" })}
                        title="Approve"
                        aria-label={`Approve ${a.id}`}
                        className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-forest-700 transition-colors hover:border-forest-600"
                      >
                        <Icon name="check" size={13} />
                      </button>
                      <button
                        onClick={() => setConfirming({ id: a.id, kind: "reject" })}
                        title="Reject"
                        aria-label={`Reject ${a.id}`}
                        className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-danger transition-colors hover:border-danger/50"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </>
                  )}
                  {canManage && a.status === "draft" && (
                    <Link
                      href={`/patrols/permissions/new?edit=${a.id}`}
                      title="Continue draft"
                      aria-label={`Continue draft ${a.id}`}
                      className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                    >
                      <Icon name="edit" size={13} />
                    </Link>
                  )}
                  {canManage && a.status === "active" && (
                    <>
                      <button
                        onClick={() => setConfirming({ id: a.id, kind: "complete" })}
                        title="Mark complete"
                        aria-label={`Mark ${a.id} complete`}
                        className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-ink-soft transition-colors hover:border-forest-600 hover:text-forest-800"
                      >
                        <Icon name="flag" size={13} />
                      </button>
                      <button
                        onClick={() => setConfirming({ id: a.id, kind: "revoke" })}
                        title="Revoke"
                        aria-label={`Revoke ${a.id}`}
                        className="flex size-7 items-center justify-center rounded-md border border-line bg-white text-danger transition-colors hover:border-danger/50"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </>
                  )}
                </span>
              ),
            },
          ]}
          empty={<p className="py-8 text-center text-sm text-ink-soft">No authorizations match the filters.</p>}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>

      {confirming && (
        <ConfirmDialog
          open
          danger={confirmCopy[confirming.kind].danger}
          title={confirmCopy[confirming.kind].title}
          message={`${confirming.id} — ${confirmCopy[confirming.kind].message}`}
          confirmLabel={confirmCopy[confirming.kind].label}
          onClose={() => setConfirming(null)}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
}
