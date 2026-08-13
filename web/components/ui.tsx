"use client";

/**
 * Design-system primitives — Button, Badge, Inputs, Card, Avatar, etc.
 * Implemented directly on Tailwind v4 tokens (no external UI library).
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/ui/loading";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "khaki";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-forest-800 text-white hover:bg-forest-700 active:bg-forest-900 shadow-card",
  secondary:
    "bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 shadow-card",
  outline:
    "border border-line-strong bg-white text-ink hover:border-forest-600 hover:text-forest-800",
  ghost: "text-ink-soft hover:bg-forest-50 hover:text-forest-800",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-card",
  khaki: "bg-khaki-400 text-forest-950 hover:bg-khaki-300 shadow-card",
};

const buttonSizes = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, iconRight, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-field font-medium transition-colors",
        "focus-visible:outline-2 select-none disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Spinner className="size-4" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 14 : 16} />
      ) : null}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  )
);
Button.displayName = "Button";

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    name: IconName;
    size?: number;
    label: string;
    active?: boolean;
  }
>(({ name, size = 18, label, active, className, ...props }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    className={cn(
      "inline-flex size-8 items-center justify-center rounded-field text-ink-soft transition-colors",
      "hover:bg-forest-50 hover:text-forest-800",
      active && "bg-forest-50 text-forest-800",
      className
    )}
    {...props}
  >
    <Icon name={name} size={size} />
  </button>
));
IconButton.displayName = "IconButton";

/* ------------------------------------------------------------------ */
/* Badge / status chips                                               */
/* ------------------------------------------------------------------ */

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "forest"
  | "khaki";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-[#8a4b00] border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
  forest: "bg-forest-100 text-forest-900 border-forest-200",
  khaki: "bg-khaki-100 text-khaki-600 border-khaki-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-white shadow-card",
        hover && "transition-shadow hover:shadow-card-hover",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  iconTone = "forest",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
  iconTone?: "forest" | "navy" | "khaki" | "danger";
}) {
  const tones = {
    forest: "bg-forest-50 text-forest-800",
    navy: "bg-info-soft text-info",
    khaki: "bg-khaki-100 text-khaki-600",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className={cn("flex size-9 items-center justify-center rounded-field", tones[iconTone])}>
            <Icon name={icon} size={18} />
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                      */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-field border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint " +
  "border-line-strong focus:border-forest-600 focus:outline-none disabled:bg-zinc-50 disabled:text-ink-soft";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-24 resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "appearance-none pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-forest-700" : "bg-zinc-300"
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar / Progress / misc                                           */
/* ------------------------------------------------------------------ */

export function Avatar({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-forest-100 font-semibold text-forest-800",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Progress({ value, tone = "forest" }: { value: number; tone?: "forest" | "warning" | "danger" }) {
  const tones = {
    forest: "bg-forest-600",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        className={cn("h-full rounded-full transition-all", tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Dot({ tone }: { tone: BadgeTone }) {
  const dotTones: Record<BadgeTone, string> = {
    neutral: "bg-zinc-300",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    forest: "bg-forest-600",
    khaki: "bg-khaki-500",
  };
  return <span className={cn("inline-block size-2 rounded-full", dotTones[tone])} />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {breadcrumb}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(fieldBase, "pl-9")}
      />
    </div>
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 rounded bg-zinc-900 px-2 py-1 text-xs text-white opacity-0 whitespace-nowrap transition-opacity group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-field border border-line bg-surface p-0.5",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-white text-forest-800 shadow-card"
              : "text-ink-soft hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "outline",
  size = "md",
  icon,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-field font-medium transition-colors",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}