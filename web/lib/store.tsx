"use client";

/**
 * Global app state: operational scope, sidebar, search, notifications,
 * toasts, and export dialog — all client-side, no backend.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { global as api } from "@/lib/services";
import type { NotificationItem, SearchResult, Scope } from "@/lib/types";

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

interface AppContextValue {
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
  toasts: ToastItem[];
  pushToast(kind: ToastItem["kind"], title: string, message?: string): void;
  dismissToast(id: number): void;
  exportOpen: boolean;
  setExportOpen(v: boolean): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const toastId = useRef(0);

  const setScope = useCallback((s: Scope) => setScopeState(s), []);

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
      toasts,
      pushToast,
      dismissToast,
      exportOpen,
      setExportOpen,
    }),
    [
      scope, setScope, unitPath, sidebarCollapsed, toggleSidebar, mobileNavOpen,
      searchOpen, searchResults, searchQuery, runSearch, notifications,
      markAllRead, toasts, pushToast, dismissToast, exportOpen,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}