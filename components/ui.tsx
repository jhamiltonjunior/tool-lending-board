"use client";

import { ConvexError } from "convex/values";
import { ReactNode, useState } from "react";

export const CATEGORIES = ["power tools", "hand tools", "garden", "kitchen", "camping", "cleaning", "other"];
export const CONDITIONS = ["new", "good", "fair", "worn"];

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

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-800",
  cancelled: "bg-zinc-200 text-zinc-700",
  returned: "bg-sky-100 text-sky-800",
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const label = overdue ? "overdue" : status === "approved" ? "on loan" : status;
  const style = overdue ? "bg-rose-600 text-white" : STATUS_STYLE[status] ?? "bg-zinc-100";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

export function TrustedBadge() {
  return <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">Trusted Lender</span>;
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
  return (
    <p className={`text-xs ${failed ? "text-rose-700" : "text-zinc-500"}`} title={activity.detail}>
      {ACTIVITY_LABEL[activity.kind] ?? activity.kind} {timeAgo(activity.at)}
    </p>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">{children}</div>;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700",
    ghost: "border border-zinc-300 text-zinc-800 hover:bg-zinc-100",
    danger: "border border-rose-300 text-rose-700 hover:bg-rose-50",
  }[variant];
  return (
    <button {...props} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-rose-700">{error}</p> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{children}</p>;
}
