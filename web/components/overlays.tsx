"use client";

/**
 * Overlay primitives — Dialog, Drawer, Dropdown, ConfirmDialog, Toasts,
 * DateRangePicker. Pure frontend components; no portal lib needed (fixed
 * positioning renders above shell).
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";
import { useApp, type ToastItem } from "@/lib/store";

/* ------------------------------------------------------------------ */
/* Dialog                                                             */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-card bg-white shadow-pop",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {icon && (
              <span className="flex size-7 items-center justify-center rounded-md bg-forest-50 text-forest-800">
                <Icon name={icon} size={15} />
              </span>
            )}
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-zinc-100 hover:text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
}: {
  open: boolean;
  onClose(): void;
  onConfirm(): void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} icon="alert">
      <p className="text-sm text-ink-soft">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={cn(
            "h-9 rounded-field px-4 text-sm font-medium text-white",
            danger ? "bg-danger hover:bg-danger/90" : "bg-forest-800 hover:bg-forest-700"
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer (right side)                                                */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/35"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex max-w-full flex-col bg-white shadow-pop",
          wide ? "w-[560px]" : "w-[400px]"
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {icon && (
              <span className="flex size-7 items-center justify-center rounded-md bg-forest-50 text-forest-800">
                <Icon name={icon} size={15} />
              </span>
            )}
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-zinc-100 hover:text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dropdown                                                           */
/* ------------------------------------------------------------------ */

export function Dropdown({
  trigger,
  children,
  align = "right",
  width = 240,
  open,
  onToggle,
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  width?: number;
  open: boolean;
  onToggle(v: boolean): void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onToggle(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => onToggle(!open)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-40 mt-1.5 overflow-hidden rounded-card border border-line bg-white shadow-pop",
            align === "right" ? "right-0" : "left-0"
          )}
          style={{ width }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  icon,
  children,
  onClick,
  danger,
  active,
}: {
  icon?: IconName;
  children: ReactNode;
  onClick?(): void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-forest-50",
        danger ? "text-danger" : "text-ink",
        active && "bg-forest-50 text-forest-800"
      )}
    >
      {icon && <Icon name={icon} size={15} />}
      <span className="flex-1">{children}</span>
      {active && <Icon name="check" size={14} className="text-forest-700" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                             */
/* ------------------------------------------------------------------ */

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  const tones: Record<ToastItem["kind"], { icon: IconName; cls: string }> = {
    success: { icon: "check", cls: "border-success/30 bg-white text-ink" },
    error: { icon: "alert", cls: "border-danger/30 bg-white text-ink" },
    warning: { icon: "alert", cls: "border-warning/40 bg-white text-ink" },
    info: { icon: "info", cls: "border-line-strong bg-white text-ink" },
  };
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-card border p-3 shadow-pop",
            tones[t.kind].cls
          )}
        >
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-800">
            <Icon name={tones[t.kind].icon} size={13} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">{t.title}</p>
            {t.message && <p className="mt-0.5 text-xs text-ink-soft">{t.message}</p>}
          </div>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange(v: T): void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative -mb-px shrink-0 border-b-2 px-3.5 pb-2.5 pt-1.5 text-sm font-medium transition-colors",
            value === t.value
              ? "border-forest-700 text-forest-800"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                value === t.value ? "bg-forest-100 text-forest-900" : "bg-zinc-100 text-ink-soft"
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date range quick picker                                            */
/* ------------------------------------------------------------------ */

export function DateRangePicker({
  value,
  onChange,
}: {
  value: string; // e.g. "last7d"
  onChange(v: string): void;
}) {
  const presets = [
    { v: "today", label: "Today" },
    { v: "last7d", label: "7 days" },
    { v: "last30d", label: "30 days" },
    { v: "last90d", label: "90 days" },
    { v: "ytd", label: "YTD" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-field border border-line bg-white px-1 py-0.5">
      <Icon name="calendar" size={14} className="ml-1 text-ink-faint" />
      {presets.map((p) => (
        <button
          key={p.v}
          onClick={() => onChange(p.v)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            value === p.v ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-forest-50 hover:text-ink"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Export dialog                                                      */
/* ------------------------------------------------------------------ */

export function ExportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { pushToast } = useApp();
  const [format, setFormat] = useState("PDF");
  const [scope, setScope] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export"
      icon="export"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              pushToast("success", "Export started", "Your file will be ready shortly.");
            }}
            className="h-9 rounded-field bg-forest-800 px-4 text-sm font-medium text-white hover:bg-forest-700"
          >
            Generate report
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">Format</label>
          <div className="flex gap-2">
            {["PDF", "CSV", "XLSX"].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  "h-9 flex-1 rounded-field border text-sm font-medium",
                  format === f
                    ? "border-forest-600 bg-forest-50 text-forest-800"
                    : "border-line-strong bg-white text-ink-soft hover:text-ink"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full rounded-field border border-line-strong bg-white px-3 py-2 text-sm focus:border-forest-600 focus:outline-none"
          >
            <option value="">Current operational scope</option>
            <option value="forest">Whole forest</option>
            <option value="division">Division</option>
            <option value="range">Range</option>
            <option value="beat">Beat</option>
          </select>
        </div>
        <p className="text-xs text-ink-soft">
          Exports respect your current filters and selection. Formatting follows the approved report
          layout.
        </p>
      </div>
    </Dialog>
  );
}

export function ExportButton() {
  const { exportOpen, setExportOpen } = useApp();
  return (
    <>
      <button
        onClick={() => setExportOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
      >
        <Icon name="export" size={15} />
        Export
      </button>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  );
}