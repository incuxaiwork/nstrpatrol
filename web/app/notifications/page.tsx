"use client";

/**
 * Notification center — full-page view of the SAME alert feed the bell menu
 * consumes (lib/store.tsx owns the fetch). No second request, no parallel
 * cache: this page renders the store's items with deep links, mark-all-read,
 * and honest error/empty states (403 role scopes are stated, never hidden).
 */

import Link from "next/link";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Badge, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { timeAgo } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

const toneFor = (kind: NotificationItem["kind"]) =>
  kind === "critical" ? "danger" : kind === "warning" ? "warning" : kind === "success" ? "success" : "info";

const labelFor = (kind: NotificationItem["kind"]) =>
  kind === "critical" ? "SOS" : kind.charAt(0).toUpperCase() + kind.slice(1);

export default function NotificationsPage() {
  const { notifications, unreadCount, markAllRead, notificationsError, reloadNotifications } = useApp();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notification Center"
        subtitle="Division alert feed — SOS, tamper and coverage events"
        actions={
          <>
            <button
              onClick={reloadNotifications}
              className="inline-flex h-9 items-center gap-2 rounded-field border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-forest-50"
            >
              <Icon name="refresh" size={14} /> Refresh
            </button>
            <button
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="check" size={14} /> Mark all read
            </button>
          </>
        }
      />

      <Card>
        <CardHeader
          title="Alert feed"
          icon="activity"
          subtitle={
            notificationsError
              ? "Feed unavailable"
              : `${notifications.length} item${notifications.length === 1 ? "" : "s"} · ${unreadCount} unread`
          }
        />
        <div className="divide-y divide-line">
          {notificationsError ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <p className="flex items-start gap-2 text-sm text-danger">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                {notificationsError}
              </p>
              <button
                onClick={reloadNotifications}
                className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line bg-white px-3 text-xs font-medium text-ink hover:bg-forest-50"
              >
                <Icon name="refresh" size={12} /> Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-soft">
              No notifications yet. SOS, tamper and coverage events appear here as rangers report them.
            </p>
          ) : (
            notifications.map((n, idx) => {
              const row = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={toneFor(n.kind)} dot>
                      {labelFor(n.kind)}
                    </Badge>
                    <span className="text-[11px] text-ink-faint">{timeAgo(n.time)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-ink">{n.title}</p>
                  <p className="text-sm text-ink-soft">{n.body}</p>
                  {n.href && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-forest-700">
                      Open <Icon name="chevronRight" size={12} />
                    </span>
                  )}
                </>
              );
              return n.href ? (
                <Link
                  key={`${n.id}-${idx}`}
                  href={n.href}
                  className={`block px-4 py-3.5 transition hover:bg-surface ${!n.read ? "bg-forest-50/40" : ""}`}
                >
                  {row}
                </Link>
              ) : (
                <div key={`${n.id}-${idx}`} className={`px-4 py-3.5 ${!n.read ? "bg-forest-50/40" : ""}`}>
                  {row}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
