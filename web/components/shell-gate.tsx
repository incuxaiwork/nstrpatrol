"use client";

/**
 * Auth-aware shell wrapper: redirects anonymous users to /login and hides
 * the admin chrome (sidebar/topbar) on the login screen.
 *
 * The session lives in localStorage, which the server cannot see. Reading it
 * during render made SSR emit the placeholder while a signed-in client
 * hydrated straight into <AppShell> — a hydration mismatch. Instead we read
 * the store through useSyncExternalStore: server render and hydration both
 * return null (unknown), then React re-renders with the live client value.
 *
 * The server snapshot returns null (not false) to distinguish "still
 * hydrating" from "genuinely not authenticated". This prevents the race
 * where the redirect useEffect fires with the stale server-snapshot false
 * before the subscription corrects to the real client value.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasSession, subscribeToAuth } from "@/lib/api";
import { AppShell } from "@/components/shell";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";

  // Server snapshot returns null (unknown), not false (not authed).
  // This prevents the redirect effect from firing during hydration
  // before the subscription corrects to the real client value.
  const authed = useSyncExternalStore(subscribeToAuth, hasSession, () => null);

  useEffect(() => {
    if (authed === false && !onLogin) {
      router.replace("/login");
    }
  }, [authed, onLogin, router]);

  if (onLogin) return <>{children}</>;
  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-soft">
        Loading…
      </div>
    );
  }
  if (!authed) return null;
  return <AppShell>{children}</AppShell>;
}
