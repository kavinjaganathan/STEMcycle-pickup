"use client";

import { useId } from "react";
import type { GeocodeStatus, PickupStatus } from "@/lib/shared";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
};

const VARIANTS = {
  primary: "bg-ink text-white border border-ink hover:bg-brand-strong hover:border-brand-strong",
  secondary: "bg-white text-ink border border-ink hover:bg-ink hover:text-white",
  danger: "bg-white text-danger border border-danger hover:bg-danger-soft",
  ghost: "text-ink border border-transparent hover:bg-tint",
};
const SIZES = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-6 text-[0.9375rem]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-[2px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}

export const inputClass =
  "block w-full rounded-[2px] border border-field bg-white px-3 py-2.5 text-base text-ink aria-[invalid=true]:border-danger aria-[invalid=true]:border-2";

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
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
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
    <section className={`border border-line bg-white p-4 sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-1 text-3xl sm:text-4xl">{title}</h1>
      </div>
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
    info: "border-l-brand bg-tint",
    success: "border-l-success bg-success-soft",
    error: "border-l-danger bg-danger-soft",
  };
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`border-l-4 p-3 text-sm leading-relaxed ${styles[kind]}`}
    >
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<PickupStatus, string> = {
  pending: "border-amber-700 text-amber-900 bg-amber-50",
  scheduled: "border-brand text-brand-strong bg-tint",
  picked_up: "border-success text-success bg-success-soft",
  cancelled: "border-zinc-500 text-zinc-700 bg-zinc-100",
};
export const STATUS_LABEL: Record<PickupStatus, string> = {
  pending: "Unassigned",
  scheduled: "Scheduled",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: PickupStatus }) {
  return (
    <span
      className={`inline-block rounded-[2px] border px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[status]}`}
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
      ? "border-zinc-500 text-zinc-700 bg-zinc-100"
      : "border-danger text-danger bg-danger-soft";
  return (
    <span className={`inline-block rounded-[2px] border px-2 py-0.5 text-xs font-bold ${style}`}>
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
