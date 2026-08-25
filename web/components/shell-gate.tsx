"use client";

/**
 * Auth-aware shell wrapper: redirects anonymous users to /login and hides
 * the admin chrome (sidebar/topbar) on the login screen.
 *
 * Auth check uses useSyncExternalStore with a null server snapshot to avoid
 * hydration mismatches. During the null (hydrating) phase, children render
 * immediately inside AppShell — no blank loading screen. Redirect only fires
 * after the subscription confirms the user is genuinely unauthenticated.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasSession, subscribeToAuth } from "@/lib/api";
import { AppShell } from "@/components/shell";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";

  // Server snapshot returns null (hydrating). Client resolves to true/false.
  const authed = useSyncExternalStore(subscribeToAuth, hasSession, () => null);

  useEffect(() => {
    if (authed === false && !onLogin) {
      router.replace("/login");
    }
  }, [authed, onLogin, router]);

  if (onLogin) return <>{children}</>;
  // Render children immediately — no blank loading screen.
  // If auth fails, the redirect effect fires on the next tick.
  if (!authed) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
