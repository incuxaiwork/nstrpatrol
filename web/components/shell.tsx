"use client";

/**
 * Application shell — persistent left sidebar + top navigation (PRD §13).
 * Sidebar states: expanded (desktop), collapsed, tablet overlay drawer.
 * Includes notification center and profile menu.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { useApp } from "@/lib/store";
import { auth as authService } from "@/lib/services";
import { navModules, breadcrumbsFor, type NavItem } from "@/lib/nav";
import { Avatar, Badge } from "@/components/ui";
import {
  Dropdown,
  DropdownItem,
  ToastStack,
} from "@/components/overlays";

/* ------------------------------------------------------------------ */
/* Password change dialog                                              */
/* ------------------------------------------------------------------ */

function PasswordDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { pushToast } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || next.length < 8) {
      setError("Current password is required and the new password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.changePassword(current, next);
      pushToast("success", "Password changed", "Your password was updated.");
      setCurrent("");
      setNext("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-card border border-line bg-white p-5 shadow-pop"
      >
        <p className="text-sm font-semibold text-ink">Change password</p>
        <p className="mt-0.5 text-xs text-ink-soft">Verified against the backend (PATCH /api/auth/password).</p>
        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            className="h-10 w-full rounded-field border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-forest-600"
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="h-10 w-full rounded-field border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-forest-600"
          />
        </div>
        {error && <p className="mt-3 rounded-field border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-field border border-line-strong px-3 text-sm font-medium text-ink hover:border-forest-600">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-9 rounded-field bg-forest-800 px-3 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60">
            {busy ? "Saving…" : "Update"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */

function NotificationsMenu() {
  const { notifications, unreadCount, markAllRead } = useApp();
  const [open, setOpen] = useState(false);
  const toneFor = (kind: string) =>
    kind === "critical" ? "danger" : kind === "warning" ? "warning" : kind === "success" ? "success" : "info";

  return (
    <Dropdown
      open={open}
      onToggle={setOpen}
      label="Notifications"
      width={340}
      trigger={
        <button
          className="relative flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-forest-50 hover:text-forest-900"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Icon name="bell" size={18} />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        <button onClick={markAllRead} className="text-xs font-medium text-forest-700 hover:underline">
          Mark all read
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-soft">No notifications yet.</p>
        )}
        {notifications.map((n) => (
          <div key={n.id} className={cn("flex gap-3 border-b border-line px-3 py-2.5", !n.read && "bg-forest-50/40")}>
            <Badge tone={toneFor(n.kind)} dot>
              {n.kind === "critical" ? "SOS" : n.kind}
            </Badge>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{n.title}</p>
              <p className="truncate text-xs text-ink-soft">{n.body}</p>
              <p className="mt-0.5 text-[11px] text-ink-faint">{n.module}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line bg-surface px-3 py-2">
        <button className="w-full text-center text-xs font-medium text-forest-700 hover:underline">
          Open notification center
        </button>
      </div>
    </Dropdown>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function ProfileMenu() {
  const { pushToast, user, setUser } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const name = user?.fullName ?? "Guest";
  const roleLabel = user?.role === "ADMIN" ? "Administrator" : user?.cader ? `${user.role} · ${user.cader}` : user?.role ?? "Operator";

  const signOut = async () => {
    setOpen(false);
    setSigningOut(true);
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setSigningOut(false);
      router.replace("/login");
    }
  };

  return (
    <>
      <Dropdown
        open={open}
        onToggle={setOpen}
        label="Account"
        width={240}
        trigger={
          <button className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-forest-50" aria-label="Account menu">
            <Avatar name={name} size={30} />
            <span className="hidden text-left lg:block">
              <span className="block text-xs font-semibold text-ink">{name}</span>
              <span className="block text-[10px] text-ink-soft">{roleLabel}</span>
            </span>
            <Icon name="chevronDown" size={13} className="hidden text-ink-faint lg:block" />
          </button>
        }
      >
        <div className="border-b border-line px-3 py-2.5">
          <p className="text-sm font-semibold text-ink">{name}</p>
          <p className="text-xs text-ink-soft">{roleLabel} · {user?.email ?? ""}</p>
        </div>
        <div className="py-1">
          <ProfileItem icon="sliders" label="Preferences" onClick={() => setOpen(false)} />
          <ProfileItem
            icon="key"
            label="Change password"
            onClick={() => {
              setOpen(false);
              setPwOpen(true);
            }}
          />
        </div>
        <div className="border-t border-line py-1">
          <ProfileItem
            icon="login"
            label={signingOut ? "Signing out…" : "Sign out"}
            danger
            onClick={signOut}
          />
        </div>
      </Dropdown>
      <PasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}

function ProfileItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick?(): void;
  danger?: boolean;
}) {
  return <DropdownItem icon={icon} onClick={onClick} danger={danger}>{label}</DropdownItem>;
}

/* ------------------------------------------------------------------ */
/* Breadcrumb                                                         */
/* ------------------------------------------------------------------ */

function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-ink-soft">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <Icon name="chevronRight" size={12} className="text-ink-faint" />}
          {c.href && i < crumbs.length - 1 ? (
            <Link href={c.href} className="hover:text-forest-800 hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className={i === crumbs.length - 1 ? "font-medium text-ink" : ""}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                              */
/* ------------------------------------------------------------------ */

function Sidebar({
  collapsed,
  onExpand,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onExpand?(): void;
  mobileOpen: boolean;
  onCloseMobile(): void;
}) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const activeKey: string = pathname.split("/")[1] || "dashboard";
  const isActive = (m: NavItem) =>
    m.key === activeKey || pathname.startsWith(m.href + "/");

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-white transition-[width] lg:flex",
          collapsed ? "lg:w-[68px]" : "lg:w-60"
        )}
      >
        <div className={cn("flex items-center gap-2.5 border-b border-line px-4 py-3", collapsed && "justify-center px-2")}>
          {collapsed ? (
            <button
              onClick={onExpand}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-forest-50 hover:text-forest-900"
            >
              <Icon name="chevronRight" size={17} />
            </button>
          ) : (
            <>
              <button
                onClick={onExpand}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-forest-50 hover:text-forest-900"
              >
                <Icon name="chevronLeft" size={17} />
              </button>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-forest-800 text-white">
                <Icon name="tree" size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">NSTR Patrol</p>
                <p className="text-[10px] uppercase tracking-wider text-ink-faint">Admin Portal</p>
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Primary">
          {navModules.map((m) => {
            const active = isActive(m);
            const groupOpen = openGroup === m.key;
            return (
              <div key={m.key}>
                <div className={cn("flex items-center rounded-md", active ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-forest-50 hover:text-forest-900")}>
                  <Link
                    href={m.href}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-sm font-medium"
                  >
                    <Icon name={m.icon} size={17} className="shrink-0" />
                    {!collapsed && <span className="truncate">{m.label}</span>}
                  </Link>
                  {!collapsed && m.children && m.children.length > 0 && (
                    <button
                      onClick={() => setOpenGroup(groupOpen ? null : m.key)}
                      aria-label={`Toggle ${m.label}`}
                      className={cn("mr-1.5 rounded p-0.5", active ? "hover:bg-white/15" : "hover:bg-forest-100")}
                    >
                      <Icon name={groupOpen ? "chevronUp" : "chevronDown"} size={13} />
                    </button>
                  )}
                </div>
                {!collapsed && groupOpen && m.children && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2.5 pb-1">
                    {m.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        onClick={() => setOpenGroup(null)}
                        className={cn(
                          "block truncate rounded px-2.5 py-1.5 text-[13px]",
                          pathname === c.href
                            ? "bg-forest-50 font-medium text-forest-900"
                            : "text-ink-soft hover:bg-forest-50 hover:text-forest-900"
                        )}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Mobile / tablet drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 transform-gpu flex-col bg-white shadow-pop transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-forest-800 text-white">
              <Icon name="tree" size={15} />
            </span>
            <p className="text-sm font-semibold text-ink">NSTR Patrol</p>
          </div>
          <button onClick={onCloseMobile} aria-label="Close navigation" className="text-ink-soft hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {navModules.map((m) => (
            <div key={m.key}>
              <Link
                href={m.href}
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm font-medium",
                  isActive(m) ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-forest-50"
                )}
              >
                <Icon name={m.icon} size={17} />
                {m.label}
              </Link>
              {m.children?.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  onClick={onCloseMobile}
                  className={cn(
                    "ml-6 block rounded px-2.5 py-1.5 text-[13px]",
                    pathname === c.href ? "bg-forest-50 font-medium text-forest-900" : "text-ink-soft"
                  )}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-zinc-950/40 lg:hidden" onClick={onCloseMobile} />}
    </>
  );
}

function Topbar({ onMenu }: { onMenu(): void }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white px-3 sm:px-4">
      <button onClick={onMenu} aria-label="Open navigation" className="rounded-md p-1.5 text-ink-soft hover:bg-forest-50 lg:hidden">
        <Icon name="menu" size={19} />
      </button>
      <button
        onClick={() => router.back()}
        aria-label="Go back"
        title="Go back"
        className="flex size-9 items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:border-forest-600 hover:text-forest-800"
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <div className="flex-1" />
      <NotificationsMenu />
      <ProfileMenu />
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useApp();

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      <Sidebar
        collapsed={sidebarCollapsed}
        onExpand={toggleSidebar}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className={cn("flex min-w-0 flex-1 flex-col transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-60")}>
        <Topbar onMenu={() => setMobileNavOpen(true)} />
        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-5 sm:px-6">
          <Breadcrumbs />
          {children}
        </main>
      </div>
      <ToastStack />
    </div>
  );
}