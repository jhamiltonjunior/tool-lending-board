"use client";

import { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Inbox } from "lucide-react";
import type { api } from "@/convex/_generated/api";
import { Activity, Card, Empty, formatDate, Loading, StatusBadge, TrustedBadge } from "@/components/ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];

export function LoanList({
  loans,
  emptyTitle,
  emptyText,
  perspective,
  actions,
}: {
  loans: Loan[] | undefined;
  emptyTitle: string;
  emptyText?: string;
  perspective: "borrower" | "owner" | "admin";
  actions?: (loan: Loan) => ReactNode;
}) {
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <Empty title={emptyTitle} icon={Inbox}>{emptyText}</Empty>;
  return (
    <div className="space-y-3">
      {loans.map((l) => (
        <Card key={l._id} className={l.overdue ? "border-rose-200 bg-rose-50/40" : ""}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-stone-900">{l.toolName}</h3>
                <StatusBadge status={l.status} overdue={l.overdue} />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
                <span className="inline-flex items-center gap-1.5 font-medium text-stone-700">
                  {formatDate(l.startDate)} <ArrowRight className="h-3.5 w-3.5 text-stone-400" /> {formatDate(l.endDate)}
                </span>
                {perspective !== "owner" && (
                  <span className="inline-flex items-center gap-1.5">
                    from {l.ownerName} {l.ownerTrusted && <TrustedBadge />}
                  </span>
                )}
                {perspective !== "borrower" && <span>borrowed by {l.borrowerName}</span>}
              </p>
              <Activity activity={l.lastActivity} />
            </div>
            {actions && <div className="flex shrink-0 gap-2">{actions(l)}</div>}
          </div>
        </Card>
      ))}
    </div>
  );
}
