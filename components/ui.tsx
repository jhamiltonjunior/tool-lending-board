"use client";

import { ConvexError } from "convex/values";
import { ComponentType, ReactNode, useState } from "react";
import {
  BellRing,
  CookingPot,
  Drill,
  Hammer,
  Inbox,
  LoaderCircle,
  Package,
  Repeat,
  ShieldCheck,
  Sprout,
  SprayCan,
  Tent,
  TriangleAlert,
} from "lucide-react";

export const CATEGORIES = ["power tools", "hand tools", "garden", "kitchen", "camping", "cleaning", "other"];
export const CONDITIONS = ["new", "good", "fair", "worn"];

type IconType = ComponentType<{ className?: string }>;

const CATEGORY_META: Record<string, { icon: IconType; tint: string }> = {
  "power tools": { icon: Drill, tint: "bg-orange-100 text-orange-700" },
  "hand tools": { icon: Hammer, tint: "bg-amber-100 text-amber-700" },
  garden: { icon: Sprout, tint: "bg-lime-100 text-lime-700" },
  kitchen: { icon: CookingPot, tint: "bg-rose-100 text-rose-700" },
  camping: { icon: Tent, tint: "bg-sky-100 text-sky-700" },
  cleaning: { icon: SprayCan, tint: "bg-cyan-100 text-cyan-700" },
  other: { icon: Package, tint: "bg-stone-200 text-stone-700" },
};

export function CategoryIcon({ category, size = "md" }: { category: string; size?: "sm" | "md" | "lg" }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  const Icon = meta.icon;
  const box = { sm: "h-8 w-8 rounded-lg", md: "h-11 w-11 rounded-xl", lg: "h-14 w-14 rounded-2xl" }[size];
  const icon = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" }[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${meta.tint}`}>
      <Icon className={icon} />
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
        <Repeat className="h-4 w-4" />
      </span>
      LendLoop
    </span>
  );
}

export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) return String(e.data);
  return "Something went wrong. Please try again.";
}

// Wraps a mutation call with a busy state and a readable error.
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (...args: A) => {
    setBusy(true);
    setError(null);
    try {
      await fn(...args);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  declined: "bg-rose-50 text-rose-700 ring-rose-600/20",
  cancelled: "bg-stone-100 text-stone-600 ring-stone-500/20",
  returned: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const label = overdue ? "Overdue" : status === "approved" ? "On loan" : status[0].toUpperCase() + status.slice(1);
  const style = overdue ? "bg-rose-600 text-white ring-rose-600" : STATUS_STYLE[status] ?? "bg-stone-100 ring-stone-300";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{label}</span>;
}

export function AvailabilityBadge({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-stone-400" /> On loan
    </span>
  );
}

export function TrustedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
      <ShieldCheck className="h-3.5 w-3.5" /> Trusted Lender
    </span>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  notification_sent: "Notification sent",
  notification_failed: "Notification failed",
  reminder_sent: "Reminder sent",
  reminder_failed: "Reminder failed",
  workflow_error: "Automation error",
};

export function Activity({ activity }: { activity: { kind: string; at: number; detail: string } | null }) {
  if (!activity) return null;
  const failed = activity.kind.endsWith("failed") || activity.kind === "workflow_error";
  const Icon = failed ? TriangleAlert : BellRing;
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs ${failed ? "text-rose-700" : "text-stone-500"}`} title={activity.detail}>
      <Icon className="h-3.5 w-3.5" />
      {ACTIVITY_LABEL[activity.kind] ?? activity.kind} {timeAgo(activity.at)}
    </p>
  );
}

export function Card({ children, className = "", interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  const hover = interactive
    ? "transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/[0.06]"
    : "";
  return (
    <div className={`rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm shadow-stone-900/[0.03] ${hover} ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const styles = {
    primary: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-emerald-600",
    secondary: "bg-stone-900 text-white shadow-sm hover:bg-stone-700 focus-visible:outline-stone-900",
    ghost:
      "bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-emerald-50 hover:text-emerald-800 hover:ring-emerald-300 focus-visible:outline-emerald-600",
    danger: "bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50 focus-visible:outline-rose-500",
  }[variant];
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" }[size];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-stone-900 shadow-sm ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
      <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
    </p>
  ) : null;
}

export function Empty({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: IconType }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-medium text-stone-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-stone-500">{children}</p>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-stone-500">
      <LoaderCircle className="h-4 w-4 animate-spin" /> {label}…
    </p>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
