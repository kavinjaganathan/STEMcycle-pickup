"use client";

import { useId } from "react";
import type { GeocodeStatus, PickupStatus } from "@/lib/db/admin";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
};

const VARIANTS = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong border border-transparent",
  secondary: "bg-surface text-text border border-border hover:bg-brand-soft",
  danger: "bg-surface text-danger border border-danger hover:bg-danger-soft",
  ghost: "text-text hover:bg-brand-soft border border-transparent",
};
const SIZES = { sm: "px-2.5 py-1.5 text-sm", md: "px-3.5 py-2 text-sm", lg: "px-4 py-3 text-base" };

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}

export const inputClass =
  "block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text sm:text-sm aria-[invalid=true]:border-danger";

/** Label + control + optional hint. `children` receives the generated id. */
export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-border bg-brand-soft",
    success: "border-brand bg-brand-soft",
    error: "border-danger bg-danger-soft",
  };
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border p-3 text-sm ${styles[kind]}`}
    >
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<PickupStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  scheduled: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  picked_up: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
};
export const STATUS_LABEL: Record<PickupStatus, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: PickupStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function GeocodeBadge({ status }: { status: GeocodeStatus }) {
  if (status === "ok") return null;
  const text = {
    pending: "Locating…",
    needs_review: "Check location",
    failed: "Location not found",
  }[status];
  const style =
    status === "pending"
      ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
      : "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {text}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="py-6 text-center text-sm text-muted">
      {label}
    </p>
  );
}
