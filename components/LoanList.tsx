"use client";

import { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Activity, daysLate, DueTag, Empty, formatRange, Loading, ToolGlyph } from "@/components/ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];
type Perspective = "borrower" | "owner" | "admin";

type Phase = "pending" | "upcoming" | "out" | "late" | "returned" | "declined" | "cancelled";

function phaseOf(l: Loan): Phase {
  if (l.status === "approved") return l.overdue ? "late" : l.started ? "out" : "upcoming";
  return l.status;
}

// One sentence per row, in plain words: who has what.
function sentence(l: Loan, p: Perspective, phase: Phase): ReactNode {
  const tool = <strong>{l.toolName}</strong>;
  const owner = <strong>{l.ownerName}</strong>;
  const borrower = <strong>{l.borrowerName}</strong>;
  if (p === "owner") {
    const verb: Record<Phase, string> = {
      pending: "wants your",
      upcoming: "is picking up your",
      out: "has your",
      late: "still has your",
      returned: "returned your",
      declined: "asked for your",
      cancelled: "cancelled the request for your",
    };
    return <>{borrower} {verb[phase]} {tool}</>;
  }
  if (p === "borrower") {
    switch (phase) {
      case "pending": return <>You asked {owner} for the {tool}</>;
      case "upcoming": return <>{owner} is lending you the {tool}</>;
      case "out": return <>You have {owner}&apos;s {tool}</>;
      case "late": return <>You still have {owner}&apos;s {tool}</>;
      case "returned": return <>You returned {owner}&apos;s {tool}</>;
      case "declined": return <>{owner} declined your request for the {tool}</>;
      case "cancelled": return <>You cancelled your request for the {tool}</>;
    }
  }
  return <>{borrower} borrows the {tool} from {owner}</>;
}

const STATE: Record<Phase, { text: string; cls?: string }> = {
  pending: { text: "Waiting for an answer" },
  upcoming: { text: "Approved", cls: "is-approved" },
  out: { text: "With borrower" },
  late: { text: "Late", cls: "is-late" },
  returned: { text: "Returned" },
  declined: { text: "Declined", cls: "is-declined" },
  cancelled: { text: "Cancelled" },
};

export function RequestRow({ loan, perspective, actions }: { loan: Loan; perspective: Perspective; actions?: ReactNode }) {
  const phase = phaseOf(loan);
  const late = phase === "late";
  const lateBy = daysLate(loan.endDate);
  const state = STATE[phase];
  const showState = !(perspective === "owner" && phase === "pending");
  return (
    <li className="ll-req">
      <div className="ll-req-art"><ToolGlyph category={loan.toolCategory} /></div>
      <div className="ll-req-main">
        <p className="ll-req-title">{sentence(loan, perspective, phase)}</p>
        <div className="ll-req-meta">
          <DueTag late={late}>{late ? `${lateBy} day${lateBy === 1 ? "" : "s"} late` : formatRange(loan.startDate, loan.endDate)}</DueTag>
          <Activity activity={loan.lastActivity} />
        </div>
      </div>
      {showState ? <span className={`ll-req-state ${state.cls ?? ""}`}>{state.text}</span> : <span />}
      <div className="ll-req-actions">{actions}</div>
    </li>
  );
}

export function RequestList({
  loans,
  perspective,
  empty,
  actions,
}: {
  loans: Loan[] | undefined;
  perspective: Perspective;
  empty: { title: string; text?: string };
  actions?: (loan: Loan) => ReactNode;
}) {
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <Empty title={empty.title}>{empty.text}</Empty>;
  return (
    <ul className="ll-list">
      {loans.map((l) => (
        <RequestRow key={l._id} loan={l} perspective={perspective} actions={actions?.(l)} />
      ))}
    </ul>
  );
}
