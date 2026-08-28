"use client";

/**
 * Global app state: operational scope, sidebar, search, notifications,
 * toasts, and export dialog — all client-side, no backend.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { global as api } from "@/lib/services";
import { ApiError, type ApiUser } from "@/lib/api";
import type { NotificationItem, SearchResult, Scope } from "@/lib/types";

const STORAGE_USER = "nstr.auth.user";
const STORAGE_READ_STATE = "nstr.notifications.readState";

function readStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_USER);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

function readStoredReadState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_READ_STATE);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeStoredReadState(state: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_READ_STATE, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function updateStoredReadState(updater: (prev: Record<string, boolean>) => Record<string, boolean>): void {
  const current = readStoredReadState();
  const next = updater(current);
  writeStoredReadState(next);
}

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

interface AppContextValue {
  user: ApiUser | null;
  setUser(user: ApiUser | null): void;
  scope: Scope;
  setScope(scope: Scope): void;
  unitPath: string;
  sidebarCollapsed: boolean;
  toggleSidebar(): void;
  mobileNavOpen: boolean;
  setMobileNavOpen(v: boolean): void;
  searchOpen: boolean;
  setSearchOpen(v: boolean): void;
  searchResults: SearchResult[];
  searchQuery: string;
  runSearch(q: string): void;
  notifications: NotificationItem[];
  unreadCount: number;
  markAllRead(): void;
  markNotificationRead(id: string): void;
  markNotificationUnread(id: string): void;
  toggleNotificationRead(id: string): void;
  /** Honest failure of the last alert-feed load (403 role scope, 401, network…). */
  notificationsError: string | null;
  reloadNotifications(): void;
  toasts: ToastItem[];
  pushToast(kind: ToastItem["kind"], title: string, message?: string): void;
  dismissToast(id: number): void;
  exportOpen: boolean;
  setExportOpen(v: boolean): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Start with null to match server render. Sync from localStorage after
  // hydration to avoid mismatch (server can't read localStorage).
  const [user, setUserState] = useState<ApiUser | null>(null);
  const [scope, setScopeState] = useState<Scope>({
    forest: "Markapur Division",
    division: "d-markapur",
    range: "r-vp-south",
    beat: "b-vp-south-tummurukota",
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [feedReloadKey, setFeedReloadKey] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const toastId = useRef(0);

  // Sync user from localStorage after hydration (server can't read it).
  useEffect(() => {
    setUserState(readStoredUser());
  }, []);

  const setScope = useCallback((s: Scope) => setScopeState(s), []);

  const setUser = useCallback((u: ApiUser | null) => {
    setUserState(u);
    if (typeof window !== "undefined") {
      try {
        if (u) window.localStorage.setItem(STORAGE_USER, JSON.stringify(u));
        else window.localStorage.removeItem(STORAGE_USER);
      } catch { /* ignore */ }
    }
  }, []);

  const unitPath = useMemo(
    () => `${scope.forest} / ${scope.division} / ${scope.range} / ${scope.beat}`,
    [scope]
  );

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  const runSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    const results = await api.search(q);
    setSearchResults(results);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((ns) => {
      const updated = ns.map((n) => ({ ...n, read: true }));
      updateStoredReadState((stored) => {
        const next = { ...stored };
        for (const n of updated) {
          next[n.id] = true;
        }
        return next;
      });
      return updated;
    });
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((ns) => {
      const updated = ns.map((n) => (n.id === id ? { ...n, read: true } : n));
      updateStoredReadState((stored) => ({ ...stored, [id]: true }));
      return updated;
    });
  }, []);

  const markNotificationUnread = useCallback((id: string) => {
    setNotifications((ns) => {
      const updated = ns.map((n) => (n.id === id ? { ...n, read: false } : n));
      updateStoredReadState((stored) => ({ ...stored, [id]: false }));
      return updated;
    });
  }, []);

  const toggleNotificationRead = useCallback((id: string) => {
    setNotifications((ns) => {
      let nextState = true;
      const updated = ns.map((n) => {
        if (n.id === id) {
          nextState = !n.read;
          return { ...n, read: nextState };
        }
        return n;
      });
      updateStoredReadState((stored) => ({ ...stored, [id]: nextState }));
      return updated;
    });
  }, []);

  const dismissToast = useCallback(
    (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)),
    []
  );

  const pushToast = useCallback(
    (kind: ToastItem["kind"], title: string, message?: string) => {
      const id = ++toastId.current;
      setToasts((ts) => [...ts.slice(-3), { id, kind, title, message }]);
      setTimeout(() => dismissToast(id), 4000);
    },
    [dismissToast]
  );

  // Load the admin alert feed on mount and poll every 10s for live SOS alerts.
  // Failures are NOT swallowed: 403 role scopes / 401 / network errors land
  // in notificationsError so the bell and the notification center can say
  // exactly why the feed is empty instead of pretending "no notifications".
  useEffect(() => {
    let active = true;

    const fetchFeed = () => {
      api
        .notifications()
        .then((ns) => {
          if (!active) return;
          setNotifications((prev) => {
            const stored = readStoredReadState();
            const prevReadMap = new Map(prev.map((p) => [p.id, p.read]));
            if (prev.length > 0) {
              const newCritical = ns.filter(
                (n) => n.kind === "critical" && !prev.some((p) => p.id === n.id)
              );
              newCritical.forEach((c) => {
                pushToast("warning", "🚨 NEW SOS EMERGENCY ALERT", c.title);
              });
            }
            return ns.map((n) => {
              let isRead = n.read;
              if (n.id in stored) {
                isRead = stored[n.id];
              } else if (prevReadMap.has(n.id)) {
                isRead = prevReadMap.get(n.id) as boolean;
              }
              return { ...n, read: isRead };
            });
          });
          setNotificationsError(null);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof ApiError && err.status === 403) {
            setNotificationsError("The division alert feed is not available for your role.");
          } else if (err instanceof ApiError && err.status === 401) {
            setNotificationsError("Sign in to receive the alert feed.");
          } else {
            setNotificationsError("Alert feed unreachable — showing no notifications.");
          }
        });
    };

    fetchFeed();
    const timer = setInterval(fetchFeed, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [feedReloadKey, pushToast]);

  const reloadNotifications = useCallback(() => setFeedReloadKey((k) => k + 1), []);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      setUser,
      scope,
      setScope,
      unitPath,
      sidebarCollapsed,
      toggleSidebar,
      mobileNavOpen,
      setMobileNavOpen,
      searchOpen,
      setSearchOpen,
      searchResults,
      searchQuery,
      runSearch,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      markAllRead,
      markNotificationRead,
      markNotificationUnread,
      toggleNotificationRead,
      notificationsError,
      reloadNotifications,
      toasts,
      pushToast,
      dismissToast,
      exportOpen,
      setExportOpen,
    }),
    [
      user, setUser, scope, setScope, unitPath, sidebarCollapsed, toggleSidebar, mobileNavOpen,
      searchOpen, searchResults, searchQuery, runSearch, notifications,
      markAllRead, markNotificationRead, markNotificationUnread, toggleNotificationRead,
      notificationsError, reloadNotifications, toasts, pushToast, dismissToast, exportOpen,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}