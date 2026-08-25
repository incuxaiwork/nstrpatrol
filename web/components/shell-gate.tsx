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
 *
 * BUG FIX: On browser refresh, useSyncExternalStore uses the server snapshot
 * `() => false` during hydration. The redirect useEffect fires with the stale
 * false BEFORE the subscription corrects to the live client value. We guard
 * the redirect with a `hasHydrated` state so it only fires after the first
 * client-side mount cycle completes. (useState, not useRef — ref mutations
 * are synchronous within the same commit and would not prevent the race.)
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasSession, subscribeToAuth } from "@/lib/api";
import { AppShell } from "@/components/shell";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";
  const authed = useSyncExternalStore(subscribeToAuth, hasSession, () => false);

  // Guard: only allow redirects AFTER hydration completes.
  // During the first client render, useSyncExternalStore returns the server
  // snapshot (false). The subscription then corrects it to the real client
  // value in a batched update. We use useState (not useRef) because ref
  // mutations are synchronous within the same commit cycle — both effects
  // would fire with hasHydrated.current = true and authed = false in the
  // same pass, causing a spurious redirect. useState batches the update
  // so it only takes effect on the next render.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => { setHasHydrated(true); }, []);

  useEffect(() => {
    if (hasHydrated && !onLogin && !authed) {
      router.replace("/login");
    }
  }, [hasHydrated, onLogin, authed, router]);

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
