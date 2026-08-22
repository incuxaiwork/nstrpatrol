"use client";

/**
 * Auth-aware shell wrapper: redirects anonymous users to /login and hides
 * the admin chrome (sidebar/topbar) on the login screen.
 *
 * The session lives in localStorage, which the server cannot see. Reading it
 * during render made SSR emit the placeholder while a signed-in client
 * hydrated straight into <AppShell> — a hydration mismatch. Instead we read
 * the store through useSyncExternalStore: server render and hydration both
 * use the neutral `false` snapshot, then React re-renders with the live
 * client value.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasSession, subscribeToAuth } from "@/lib/api";
import { AppShell } from "@/components/shell";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";
  const authed = useSyncExternalStore(subscribeToAuth, hasSession, () => false);

  useEffect(() => {
    if (!onLogin && !authed) {
      router.replace("/login");
    }
  }, [onLogin, authed, router]);

  if (onLogin) return <>{children}</>;
  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-soft">
        Redirecting to sign in…
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
