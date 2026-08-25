"use client";

/**
 * SOS & Alerts Control Room (Part D).
 *
 * Scoped, honest operations view over the REAL backend feeds:
 *  • SOS cases come from GET /api/incidents (role-scoped server-side) via
 *    lib/services sos.cases() — statuses are the incident record's own
 *    SUBMITTED / VERIFIED / RESOLVED / REJECTED, never invented client-side;
 *  • Acknowledge = POST /api/incidents/:id/verify (the Phase B contract:
 *    ACK == VERIFIED, no new status fabricated);
 *  • "View on Map" deep-links /gis?sos=<id>; alerts without GPS say
 *    "Location unavailable" instead of guessing coordinates;
 *  • Tamper / coverage events render from the same GET /api/alerts feed the
 *    bell menu uses;
 *  • 401/403/network failures render as explicit states — never as a silent
 *    empty room.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, invalidateCache, ApiError } from "@/lib/api";
import type { ApiIncident } from "@/lib/api";
import { sos as sosService, type SosCase } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/ui/loading";
import { timeAgo } from "@/lib/utils";

type SosStatus = ApiIncident["status"];

const statusTone: Record<SosStatus, "danger" | "success" | "info" | "neutral"> = {
  SUBMITTED: "danger",
  VERIFIED: "success",
  RESOLVED: "info",
  REJECTED: "neutral",
};

const statusLabel: Record<SosStatus, string> = {
  SUBMITTED: "Needs acknowledgment",
  VERIFIED: "Acknowledged",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function SosControlRoomPage() {
  const { pushToast, user } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  const casesData = useAsyncData(() => sosService.cases(), [], { cacheKey: "sos:cases" });
  const feedData = useAsyncData(() => sosService.feed(), [], { cacheKey: "sos:feed" });

  const cases = casesData.data ?? [];
  const pendingCount = cases.filter((c) => c.incident.status === "SUBMITTED").length;

  // Non-SOS operational alerts (tamper logs, coverage breaches) from the
  // same division feed the bell menu consumes.
  const otherAlerts = useMemo(
    () => (feedData.data ?? []).filter((a) => a.type !== "SOS"),
    [feedData.data]
  );

  const acknowledge = async (c: SosCase) => {
    setBusyId(c.incident.id);
    try {
      await api.incidents.verify(c.incident.id);
      invalidateCache();
      casesData.reload();
      pushToast(
        "success",
        "SOS acknowledged",
        `${c.incident.title} verified by ${user?.fullName ?? "you"} — status is now VERIFIED`
      );
    } catch (err) {
      pushToast(
        "error",
        "Acknowledge failed",
        err instanceof ApiError && err.status === 403
          ? "Your role is not allowed to acknowledge SOS alerts."
          : err instanceof Error
            ? err.message
            : "Backend rejected the request"
      );
    } finally {
      setBusyId(null);
    }
  };

  const loadError = casesData.error ?? feedData.error;
  const errorMessage = (() => {
    if (!loadError) return null;
    if (loadError instanceof ApiError && loadError.status === 403)
      return "Your role does not have access to this alert scope (BEAT / OPERATIONAL accounts are limited to their own reports).";
    if (loadError instanceof ApiError && loadError.status === 401)
      return "Sign in with a Division / Sub-Division / Range account to operate the SOS room.";
    return loadError.message || "Backend unreachable — the SOS room cannot load live data.";
  })();

  return (
    <div className="space-y-4">
      <PageHeader
        title="SOS & Alerts"
        subtitle="Emergency operations — scoped to your division / range assignment"
        actions={
          <Link
            href="/notifications"
            className="inline-flex h-9 items-center gap-2 rounded-field border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-forest-50"
          >
            <Icon name="bell" size={14} /> Notification center
          </Link>
        }
      />

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-card border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-ink">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-danger" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!errorMessage && casesData.loading && <SkeletonRows rows={5} />}

      {/* Priority SOS queue */}
      <Card>
        <CardHeader
          title="SOS queue"
          icon="sos"
          subtitle={
            cases.length === 0
              ? "No SOS emergencies on record for your scope"
              : `${cases.length} SOS event${cases.length === 1 ? "" : "s"} · ${pendingCount} awaiting acknowledgment`
          }
        />
        <div className="divide-y divide-line">
          {!casesData.loading && !errorMessage && cases.length === 0 && (
            <p className="p-8 text-center text-sm text-ink-soft">
              No SOS emergencies have been raised in your assigned scope. When a ranger triggers the
              SOS button, the event appears here as soon as it syncs.
            </p>
          )}
          {cases.map((c) => (
            <SosCard key={c.incident.id} c={c} busy={busyId === c.incident.id} onAcknowledge={() => acknowledge(c)} />
          ))}
        </div>
      </Card>

      {/* Non-SOS operational alerts */}
      <Card>
        <CardHeader
          title="Tamper & coverage alerts"
          icon="alert"
          subtitle="Non-emergency events from the same division feed"
        />
        <div className="divide-y divide-line">
          {feedData.error ? (
            <p className="p-4 text-xs text-danger">
              Couldn&apos;t load the alert feed — {feedData.error.message}
            </p>
          ) : otherAlerts.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-soft">
              No tamper or coverage alerts in the current feed.
            </p>
          ) : (
            otherAlerts.map((a) => (
              <div
                key={`${a.type}-${a.eventId ?? a.incidentId ?? a.patrolId ?? a.timestamp}`}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={a.type === "TAMPER" ? "warning" : "info"}>{a.type}</Badge>
                    <span className="truncate text-sm font-medium text-ink">{a.details ?? a.type}</span>
                  </div>
                  {a.ranger && <p className="mt-0.5 text-xs text-ink-soft">{a.ranger}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-ink-faint">{timeAgo(a.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SOS card                                                            */
/* ------------------------------------------------------------------ */

function SosCard({ c, busy, onAcknowledge }: { c: SosCase; busy: boolean; onAcknowledge(): void }) {
  const i = c.incident;
  const hasCoords = i.latitude != null && i.longitude != null;

  return (
    <div id={i.id} className="scroll-mt-24 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Icon name="sos" size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{i.title}</p>
            <p className="text-xs text-ink-soft">
              {c.rangerName} · {fmtTime(i.occurredAt)} ({timeAgo(i.occurredAt)})
            </p>
          </div>
        </div>
        <Badge tone={statusTone[i.status]} dot>
          {statusLabel[i.status]}
        </Badge>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        <div className="flex items-start gap-1.5">
          <dt className="shrink-0 font-medium text-ink-faint">Location:</dt>
          <dd className={hasCoords ? "font-mono text-ink" : "text-warning"}>
            {hasCoords ? `${i.latitude!.toFixed(6)}, ${i.longitude!.toFixed(6)}` : "Location unavailable"}
          </dd>
        </div>
        <div className="flex items-start gap-1.5">
          <dt className="shrink-0 font-medium text-ink-faint">Severity:</dt>
          <dd className="text-ink">{i.severity}</dd>
        </div>
        {c.verifierName && (
          <div className="flex items-start gap-1.5">
            <dt className="shrink-0 font-medium text-ink-faint">Acknowledged by:</dt>
            <dd className="text-ink">
              {c.verifierName}
              {i.verifiedAt ? ` · ${fmtTime(i.verifiedAt)}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {c.message && <p className="mt-2 text-sm text-ink-soft">“{c.message}”</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasCoords ? (
          <Link
            href={`/gis?sos=${encodeURIComponent(i.id)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line bg-white px-3 text-xs font-medium text-ink hover:bg-forest-50"
          >
            <Icon name="pin" size={13} /> View on Map
          </Link>
        ) : (
          <span
            title="This SOS has no GPS coordinates, so it cannot be placed on the map"
            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-field border border-line bg-surface px-3 text-xs font-medium text-ink-faint"
          >
            <Icon name="pin" size={13} /> View on Map — no GPS fix
          </span>
        )}
        {i.status === "SUBMITTED" ? (
          <button
            onClick={onAcknowledge}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white shadow-card hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="check" size={13} /> {busy ? "Acknowledging…" : "Acknowledge"}
          </button>
        ) : (
          <span className="text-xs text-ink-faint">
            {i.status === "VERIFIED"
              ? "Acknowledged — no further action required"
              : `Closed as ${statusLabel[i.status].toLowerCase()}`}
          </span>
        )}
      </div>
    </div>
  );
}
