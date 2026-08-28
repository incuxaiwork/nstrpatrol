"use client";

/**
 * Notification center — full-page view of the alert feed.
 * Allows viewing all notifications, filtering by read/unread, marking items read,
 * and unmarking read notifications back to unread state.
 */

import { useState } from "react";
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

type FilterTab = "all" | "unread" | "read";

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    markAllRead,
    markNotificationRead,
    markNotificationUnread,
    toggleNotificationRead,
    notificationsError,
    reloadNotifications,
  } = useApp();

  const [filter, setFilter] = useState<FilterTab>("all");

  const readCount = notifications.length - unreadCount;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "read") return n.read;
    return true;
  });

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <CardHeader
            title="Alert feed"
            icon="activity"
            subtitle={
              notificationsError
                ? "Feed unavailable"
                : `${notifications.length} total · ${unreadCount} unread · ${readCount} read`
            }
          />

          {!notificationsError && notifications.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-xs">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  filter === "all" ? "bg-white text-forest-900 shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  filter === "unread" ? "bg-white text-forest-900 shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                Unread ({unreadCount})
              </button>
              <button
                onClick={() => setFilter("read")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  filter === "read" ? "bg-white text-forest-900 shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                Read ({readCount})
              </button>
            </div>
          )}
        </div>

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
          ) : filteredNotifications.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-soft">
              {notifications.length === 0
                ? "No notifications yet. SOS, tamper and coverage events appear here as rangers report them."
                : filter === "unread"
                ? "No unread notifications."
                : "No read notifications."}
            </p>
          ) : (
            filteredNotifications.map((n) => {
              const handleMarkUnread = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                markNotificationUnread(n.id);
              };

              const handleMarkRead = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                markNotificationRead(n.id);
              };

              const rowContent = (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={toneFor(n.kind)} dot>
                        {labelFor(n.kind)}
                      </Badge>
                      {!n.read ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-[10px] font-semibold text-forest-800">
                          ● Unread
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                          Read
                        </span>
                      )}
                      <span className="text-[11px] text-ink-faint">{timeAgo(n.time)}</span>
                    </div>

                    <p className={`text-sm ${!n.read ? "font-bold text-ink" : "font-medium text-ink-soft"}`}>
                      {n.title}
                    </p>
                    <p className="text-sm text-ink-soft">{n.body}</p>

                    {n.href && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-forest-700">
                        Open details <Icon name="chevronRight" size={12} />
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    {n.read ? (
                      <button
                        type="button"
                        onClick={handleMarkUnread}
                        title="Unmark message (mark as unread)"
                        className="inline-flex h-8 items-center gap-1.5 rounded-field border border-line-strong bg-white px-2.5 text-xs font-medium text-ink-soft hover:border-forest-600 hover:bg-forest-50 hover:text-forest-900"
                      >
                        <Icon name="mail" size={13} />
                        Unmark
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleMarkRead}
                        title="Mark message as read"
                        className="inline-flex h-8 items-center gap-1.5 rounded-field border border-forest-600/30 bg-forest-50 px-2.5 text-xs font-medium text-forest-800 hover:bg-forest-100"
                      >
                        <Icon name="check" size={13} />
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              );

              return n.href ? (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => {
                    if (!n.read) markNotificationRead(n.id);
                  }}
                  className={`block px-5 py-4 transition hover:bg-surface ${
                    !n.read ? "bg-forest-50/40 border-l-4 border-l-forest-600" : ""
                  }`}
                >
                  {rowContent}
                </Link>
              ) : (
                <div
                  key={n.id}
                  className={`px-5 py-4 ${
                    !n.read ? "bg-forest-50/40 border-l-4 border-l-forest-600" : ""
                  }`}
                >
                  {rowContent}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
