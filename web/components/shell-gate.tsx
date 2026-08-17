"use client";

/**
 * Auth-aware shell wrapper: redirects anonymous users to /login and hides
 * the admin chrome (sidebar/topbar) on the login screen.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasSession } from "@/lib/api";
import { AppShell } from "@/components/shell";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const onLogin = pathname === "/login";

  useEffect(() => {
    if (!onLogin && !hasSession()) {
      router.replace("/login");
    }
  }, [onLogin, router]);

  if (onLogin) return <>{children}</>;
  if (!hasSession()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-soft">
        Redirecting to sign in…
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}