"use client";

/**
 * Application shell — persistent left sidebar + top navigation (PRD §13).
 * Sidebar states: expanded (desktop), collapsed, tablet overlay drawer.
 * Includes global search modal, notification center, profile menu and
 * scope picker.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { useApp } from "@/lib/store";
import { navModules, breadcrumbsFor, type NavItem } from "@/lib/nav";
import { Avatar, Badge } from "@/components/ui";
import {
  Dropdown,
  DropdownItem,
  ExportDialog,
  ToastStack,
} from "@/components/overlays";
import { mockDivisions, mockRanges, mockBeats, unitName } from "@/lib/mock/hierarchy";

/* ------------------------------------------------------------------ */
/* Scope picker                                                       */
/* ------------------------------------------------------------------ */

function ScopePicker() {
  const { scope, setScope } = useApp();
  const [open, setOpen] = useState(false);

  return (
<Dropdown
      open={open}
      onToggle={setOpen}
      label="Operational scope"
      width={330}
      trigger={
        <button
          className="hidden h-9 items-center gap-2 rounded-field border border-line bg-white px-3 text-sm text-ink hover:border-forest-600 sm:flex"
          aria-label="Change operational scope"
        >
          <Icon name="locate" size={15} className="text-forest-700" />
          <span className="max-w-40 truncate">{unitName(scope.division)}{scope.range !== "all" ? ` / ${unitName(scope.range)}` : ""}</span>
          <Icon name="chevronDown" size={13} className="text-ink-faint" />
        </button>
      }
    >
      <div className="p-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Select operational scope
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft">Division</p>
            <select
              value={scope.division}
              onChange={(e) =>
                setScope({
                  ...scope,
                  division: e.target.value,
                  range: mockRanges[e.target.value][0]?.id ?? "",
                  beat: mockBeats[mockRanges[e.target.value][0]?.id ?? ""]?.[0]?.id ?? "",
                })
              }
              className="w-full rounded-field border border-line-strong bg-white px-2.5 py-1.5 text-sm focus:border-forest-600 focus:outline-none"
            >
              {mockDivisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft">Range</p>
            <select
              value={scope.range}
              onChange={(e) =>
                setScope({
                  ...scope,
                  range: e.target.value,
                  beat: mockBeats[e.target.value]?.[0]?.id ?? "",
                })
              }
              className="w-full rounded-field border border-line-strong bg-white px-2.5 py-1.5 text-sm focus:border-forest-600 focus:outline-none"
            >
              {mockRanges[scope.division].map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft">Beat</p>
            <select
              value={scope.beat}
              onChange={(e) => setScope({ ...scope, beat: e.target.value })}
              className="w-full rounded-field border border-line-strong bg-white px-2.5 py-1.5 text-sm focus:border-forest-600 focus:outline-none"
            >
              {(mockBeats[scope.range] ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Dropdown>
  );
}

/* ------------------------------------------------------------------ */
/* Search modal                                                       */
/* ------------------------------------------------------------------ */

function SearchModal() {
  const { searchOpen, setSearchOpen, searchQuery, runSearch, searchResults } = useApp();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  if (!searchOpen) return null;

  const groupBy = (k: string) => searchResults.filter((r) => r.kind === k);

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/40 p-4 pt-16"
      onMouseDown={() => setSearchOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <div
        className="mx-auto max-w-2xl overflow-hidden rounded-card bg-white shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Icon name="search" size={17} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search patrols, rangers, teams, reports…"
            aria-label="Search"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-soft">Esc</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {!searchQuery.trim() && (
            <p className="px-3 py-8 text-center text-sm text-ink-soft">
              Type to search across the whole portal.
            </p>
          )}
          {searchQuery.trim() && searchResults.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-soft">No results for “{searchQuery}”.</p>
          )}
          {(["patrol", "ranger", "team", "observation"] as const).map((kind) => {
            const items = groupBy(kind);
            if (items.length === 0) return null;
            const kindLabel: Record<string, string> = {
              patrol: "Patrols", ranger: "Rangers", team: "Teams", observation: "Observations & Reports",
            };
            return (
              <div key={kind} className="mb-1">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {kindLabel[kind]}
                </p>
                {items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSearchOpen(false);
                      router.push(r.href);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-forest-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-forest-100 text-forest-800">
                      <Icon name={kindIcon(r.kind)} size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                      <span className="block truncate text-xs text-ink-soft">{r.subtitle}</span>
                    </span>
                    <Icon name="chevronRight" size={14} className="ml-auto text-ink-faint" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function kindIcon(kind: string): IconName {
  if (kind === "patrol") return "route";
  if (kind === "ranger") return "users";
  if (kind === "team") return "shield";
  if (kind === "observation") return "binoculars";
  return "search";
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
  const { pushToast } = useApp();
  const [open, setOpen] = useState(false);
  const name = "Suresh Iyer";
  return (
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
            <span className="block text-[10px] text-ink-soft">Administrator</span>
          </span>
          <Icon name="chevronDown" size={13} className="hidden text-ink-faint lg:block" />
        </button>
      }
    >
      <div className="border-b border-line px-3 py-2.5">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <p className="text-xs text-ink-soft">Administrator · NSTR Forest</p>
      </div>
      <div className="py-1">
        <Link href="/profile" onClick={() => setOpen(false)}>
          <ProfileItem icon="users" label="My profile" />
        </Link>
        <ProfileItem icon="sliders" label="Preferences" onClick={() => setOpen(false)} />
        <ProfileItem
          icon="key"
          label="Change password"
          onClick={() => {
            setOpen(false);
            pushToast("info", "Password form", "This is a frontend mock — backend endpoint pending.");
          }}
        />
      </div>
      <div className="border-t border-line py-1">
        <ProfileItem
          icon="login"
          label="Sign out"
          danger
          onClick={() => {
            setOpen(false);
            pushToast("info", "Sign out", "Session ending is a frontend mock only.");
          }}
        />
      </div>
    </Dropdown>
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

function ExportButton() {
  const { exportOpen, setExportOpen } = useApp();
  return (
    <>
      <button
        onClick={() => setExportOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800 xl:flex"
      >
        <Icon name="export" size={15} />
        Export
      </button>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  );
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
  const { setSearchOpen } = useApp();
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
      <button
        onClick={() => setSearchOpen(true)}
        className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-field border border-line bg-white px-3 text-sm text-ink-soft hover:border-forest-600 md:flex"
      >
        <Icon name="search" size={15} />
        <span className="flex-1 truncate text-left">Search patrols, rangers, reports…</span>
        <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-faint">/</kbd>
      </button>
      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="ml-auto flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-white md:hidden"
      >
        <Icon name="search" size={18} />
      </button>
      <ScopePicker />
      <NotificationsMenu />
      <ExportButton />
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
      <SearchModal />
      <ToastStack />
    </div>
  );
}