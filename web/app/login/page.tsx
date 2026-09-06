"use client";

/**
 * Admin login — authenticates against the backend (POST /api/auth/login),
 * stores tokens + profile, then enters the portal.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth as authService } from "@/lib/services";
import { useApp } from "@/lib/store";
import { Icon } from "@/components/icons";
import { AUTH_DEFAULT_LANDING } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await authService.login(email.trim(), password);
      setUser(user);
      router.replace(AUTH_DEFAULT_LANDING);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to sign in.";
      setError(
        /invalid_credentials|401/.test(msg)
          ? "Invalid email or password."
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-900 px-4">
      <div className="w-full max-w-sm rounded-card border border-white/10 bg-white p-7 shadow-pop">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-forest-800 text-white">
            <Icon name="tree" size={20} />
          </span>
          <div>
            <p className="text-base font-semibold text-ink">NSTR Patrol</p>
            <p className="text-xs text-ink-soft">Admin Portal sign in</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-field border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-forest-600"
              placeholder="admin@nstrpatrol.gov.in"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-soft">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-field border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-forest-600"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-field border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-field bg-forest-800 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Icon name="refresh" size={14} className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}