"use client";

import { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Activity, Card, Empty, StatusBadge, TrustedBadge } from "@/components/ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];

export function LoanList({
  loans,
  empty,
  perspective,
  actions,
}: {
  loans: Loan[] | undefined;
  empty: string;
  perspective: "borrower" | "owner" | "admin";
  actions?: (loan: Loan) => ReactNode;
}) {
  if (loans === undefined) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (loans.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3">
      {loans.map((l) => (
        <Card key={l._id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{l.toolName}</h3>
                <StatusBadge status={l.status} overdue={l.overdue} />
              </div>
              <p className="text-sm text-zinc-600">
                {l.startDate} → {l.endDate}
                {perspective !== "owner" && <> · lender {l.ownerName} {l.ownerTrusted && <TrustedBadge />}</>}
                {perspective !== "borrower" && <> · borrower {l.borrowerName}</>}
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
