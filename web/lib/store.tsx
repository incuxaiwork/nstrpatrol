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

function readStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_USER);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
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
  const [user, setUserState] = useState<ApiUser | null>(readStoredUser);
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
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
  }, []);

  // Load the admin alert feed on mount (backend /api/alerts, mock fallback).
  // Failures are NOT swallowed: 403 role scopes / 401 / network errors land
  // in notificationsError so the bell and the notification center can say
  // exactly why the feed is empty instead of pretending "no notifications".
  useEffect(() => {
    let active = true;
    api
      .notifications()
      .then((ns) => {
        if (!active) return;
        setNotifications(ns);
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
    return () => {
      active = false;
    };
  }, [feedReloadKey]);

  const reloadNotifications = useCallback(() => setFeedReloadKey((k) => k + 1), []);

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
      markAllRead, notificationsError, reloadNotifications, toasts, pushToast, dismissToast, exportOpen,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}