"use client";

import Link from "next/link";
import { ConvexError } from "convex/values";
import { ComponentType, ReactNode, useId, useState } from "react";
import { CookingPot, Drill, Hammer, Package, Search, Shovel, SprayCan, Tent } from "lucide-react";

export const CATEGORIES = ["power tools", "hand tools", "garden", "kitchen", "camping", "cleaning", "other"];
export const CONDITIONS = ["new", "good", "fair", "worn"];

export const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- helpers ---------- */

export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) return String(e.data);
  return "Something went wrong. Try again in a moment.";
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

/** "2026-11-14" -> "Nov 14" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const formatRange = (start: string, end: string) =>
  start === end ? formatDate(start) : `${formatDate(start)} to ${formatDate(end)}`;

export function daysLate(endDate: string, now = Date.now()): number {
  const today = new Date(now).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(endDate)) / 86_400_000));
}

/* ---------- glyphs ---------- */

type IconType = ComponentType<{ size?: number; strokeWidth?: number; strokeDasharray?: string; className?: string; "aria-hidden"?: boolean }>;

const CATEGORY_ICON: Record<string, IconType> = {
  "power tools": Drill,
  "hand tools": Hammer,
  garden: Shovel,
  kitchen: CookingPot,
  camping: Tent,
  cleaning: SprayCan,
  other: Package,
};

/** Category glyph, straight on the panel. Dashed for a tool that is lent out. */
export function ToolGlyph({ category, size = 24, dashed = false }: { category: string; size?: number; dashed?: boolean }) {
  const Icon = CATEGORY_ICON[category] ?? Package;
  return <Icon size={size} strokeWidth={1.75} strokeDasharray={dashed ? "2.5 2.5" : undefined} className="ll-glyph" aria-hidden />;
}

/* ---------- primitives ---------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm" | "md" | "lg";
  href?: string;
};

export function Button({ variant = "secondary", size = "md", href, className = "", children, ...rest }: ButtonProps) {
  const cls = ["ll-btn", variant !== "secondary" && `ll-btn-${variant}`, size !== "md" && `ll-btn-${size}`, className].filter(Boolean).join(" ");
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" {...rest} className={cls}>{children}</button>;
}

export function Field({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ll-field">
      <span className="ll-field-label">{text}</span>
      {children}
    </label>
  );
}

export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="ll-field">
      <label htmlFor={id} className="ll-visually-hidden">Search tools</label>
      <div className="ll-input-wrap has-glyph">
        <Search size={18} strokeWidth={1.75} className="ll-glyph" aria-hidden />
        <input id={id} className="ll-input" placeholder="Search tools" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function CategoryFilter({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts?: Record<string, number> }) {
  const options = [{ value: "", label: "All" }, ...CATEGORIES.map((c) => ({ value: c, label: label(c) }))];
  return (
    <div className="ll-cats" role="group" aria-label="Categories">
      {options.map((o) => (
        <button key={o.value || "all"} type="button" className="ll-cat" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {counts && counts[o.value] !== undefined && <span className="ll-cat-count">{counts[o.value]}</span>}
        </button>
      ))}
    </div>
  );
}

export function DueTag({ late = false, children }: { late?: boolean; children: ReactNode }) {
  return <span className={late ? "ll-tag ll-tag-late" : "ll-tag"}>{children}</span>;
}

/** Two-tone caption: the title in ink with a period, the rest in ink-muted. */
export function Caption({ title, rest, as: Tag = "p" }: { title: string; rest?: string; as?: "p" | "figcaption" | "span" }) {
  return (
    <Tag className="ll-caption">
      <strong>{title.replace(/\.?$/, ".")}</strong>
      {rest ? ` ${rest}` : null}
    </Tag>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="ll-error" role="alert">{error}</p> : null;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ll-empty">
      <p className="ll-caption"><strong>{title}</strong>{children ? <> {children}</> : null}</p>
    </div>
  );
}

export function Loading() {
  return <p className="ll-small ll-empty">Loading…</p>;
}

export function PageHeader({ title, lede, side }: { title: string; lede?: ReactNode; side?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-8 pb-6 pt-16 max-[720px]:pt-8">
      <div>
        <h1 className="ll-section-title">{title}</h1>
        {lede && <p className="ll-lede ll-tabular" style={{ marginTop: "var(--space-2)" }}>{lede}</p>}
      </div>
      {side}
    </div>
  );
}

const ACTIVITY: Record<string, string> = {
  notification_sent: "Notified",
  notification_failed: "Notification failed",
  reminder_sent: "Reminder sent",
  reminder_failed: "Reminder failed",
  workflow_error: "Automation error",
};

/** Latest automation result for a loan, as a quiet line: "Reminder sent 2 days ago". */
export function Activity({ activity }: { activity: { kind: string; at: number; detail: string } | null }) {
  if (!activity) return null;
  const failed = activity.kind.endsWith("failed") || activity.kind === "workflow_error";
  return (
    <span className={failed ? "is-problem" : undefined} title={activity.detail}>
      {ACTIVITY[activity.kind] ?? activity.kind} {timeAgo(activity.at)}
    </span>
  );
}

export function Accordion({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState(-1);
  return (
    <ul className="ll-acc">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <li key={it.q} className="ll-acc-item">
            <button type="button" className="ll-acc-q" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
              {it.q}
              <span className="ll-acc-icon" aria-hidden="true" />
            </button>
            {isOpen && <p id={`faq-${i}`} className="ll-acc-a">{it.a}</p>}
          </li>
        );
      })}
    </ul>
  );
}
