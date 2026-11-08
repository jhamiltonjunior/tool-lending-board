"use client";

import { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Caption, daysLate, DueTag, formatDate, label, ToolGlyph } from "@/components/ui";

export type Tool = FunctionReturnType<typeof api.tools.list>["page"][number];

/**
 * One tool on the board. Available: a filled panel row with "Available".
 * Lent out: an empty dashed outline (like a painted tool outline on a workshop
 * wall) with a manila tag saying when it is back.
 */
export function ToolSlot({ tool, owner, action, children }: { tool: Tool; owner?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  const onLoan = !tool.available;
  const late = onLoan && tool.backOn !== null && daysLate(tool.backOn) > 0;
  // "Good, 18V, two batteries." reads as one sentence after the bold name.
  const detail = tool.description.replace(/\.$/, "");
  const rest = [label(tool.condition), detail.charAt(0).toLowerCase() + detail.slice(1)].filter(Boolean).join(", ");
  return (
    <li className={onLoan ? "ll-slot is-loan" : "ll-slot"} style={{ listStyle: "none" }}>
      <div className="ll-slot-art"><ToolGlyph category={tool.category} dashed={onLoan} /></div>
      <div className="ll-slot-main">
        <Caption title={tool.name} rest={rest ? `${rest}.` : undefined} />
      </div>
      <div className="ll-slot-owner">{owner}</div>
      <div className="ll-slot-statuscell">
        {onLoan ? (
          <DueTag late={late}>
            {late && tool.backOn ? `${daysLate(tool.backOn)} days late` : tool.backOn ? `Back ${formatDate(tool.backOn)}` : "Lent out"}
          </DueTag>
        ) : (
          <span className="ll-status">Available</span>
        )}
      </div>
      <div className="ll-slot-action">{action}</div>
      {children}
    </li>
  );
}

/** "Ana Souza" over "Lent 14 times · Trusted lender". */
export function OwnerLine({ tool, you }: { tool: Tool; you?: boolean }) {
  const lent = tool.ownerTimesLent;
  const parts = [lent > 0 ? `Lent ${lent} time${lent === 1 ? "" : "s"}` : "New lender", tool.ownerTrusted ? "Trusted lender" : null].filter(Boolean);
  return (
    <>
      <strong>{you ? "You" : tool.ownerName}</strong>
      <span className="ll-tabular">{parts.join(" · ")}</span>
    </>
  );
}
