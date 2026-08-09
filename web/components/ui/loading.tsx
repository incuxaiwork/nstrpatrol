"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-zinc-200", className)} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink-soft" role="status">
      <Spinner className="size-7 text-forest-700" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong while loading this view.",
  onRetry,
}: {
  message?: string;
  onRetry?(): void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center" role="alert">
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <span className="text-lg font-semibold">!</span>
      </span>
      <p className="max-w-sm text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-field border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:text-forest-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon = "search",
  title,
  description,
  action,
}: {
  icon?: "search" | "map" | "camera" | "filter" | "box" | "users";
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const iconMap = {
    search: "search",
    map: "map",
    camera: "camera",
    filter: "filter",
    box: "box",
    users: "users",
  } as const;
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-zinc-100 text-ink-faint">
        <Icon name={iconMap[icon]} size={22} />
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-xs text-ink-soft">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}